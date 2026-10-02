import {
  FilterQuery,
  LockMode,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeStatus } from '../employees/employee-status.enum';
import { Employee } from '../employees/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { Product } from '../products/product.entity';
import { ProductsService } from '../products/products.service';
import { AssignLicenseDto } from './dto/assign-license.dto';
import { LicenseResponseDto } from './dto/license-response.dto';
import { ListLicensesQueryDto } from './dto/list-licenses-query.dto';
import { LicenseAssignment } from './license-assignment.entity';
import { RevokeReason } from './revoke-reason.enum';
import { SeatsThresholdGateway } from './seats-threshold.gateway';

/** A `seats.threshold` alert is sent when seats in use reach this share. */
const SEATS_THRESHOLD_PERCENT = 90;

@Injectable()
export class LicensesService {
  constructor(
    private readonly em: EntityManager,
    private readonly productsService: ProductsService,
    private readonly employeesService: EmployeesService,
    private readonly seatsGateway: SeatsThresholdGateway,
  ) {}

  // Checks run in the order defined in specs/licenses.spec.md and stop at the
  // first failure: 404 product, 404 employee, RN02, RN03, RN01.
  //
  // Everything runs in one transaction. Calls made through `this.em` (also
  // inside ProductsService/EmployeesService) join it automatically.
  async assign(dto: AssignLicenseDto): Promise<LicenseResponseDto> {
    const { assignment, seatsInUse } = await this.em.transactional(async () => {
      // Rows are read with SELECT ... FOR UPDATE: concurrent assignments of
      // the same product (RN01) or to the same employee (vs. offboarding)
      // wait here, and then read the data already updated by the other one.
      const product = await this.productsService.findProductOrFail(
        dto.productId,
        LockMode.PESSIMISTIC_WRITE,
      );
      const employee = await this.employeesService.findEmployeeOrFail(
        dto.employeeId,
        LockMode.PESSIMISTIC_WRITE,
      );
      this.ensureEmployeeIsActive(employee);
      await this.ensureNotAlreadyAssigned(product, employee);
      const seatsInUseBefore =
        await this.productsService.countSeatsInUse(product);
      this.ensureHasAvailableSeat(product, seatsInUseBefore);

      const created = this.em.create(LicenseAssignment, {
        product,
        employee,
      });
      await this.flushAssignment(product, employee);

      return { assignment: created, seatsInUse: seatsInUseBefore + 1 };
    });

    // After the commit: never notify about an assignment that was rolled back.
    this.notifyIfNearlyFull(assignment.product, seatsInUse);

    return this.toResponse(assignment);
  }

  async findAll(query: ListLicensesQueryDto): Promise<LicenseResponseDto[]> {
    const where: FilterQuery<LicenseAssignment> = {};
    if (query.productId) {
      where.product = query.productId;
    }
    if (query.employeeId) {
      where.employee = query.employeeId;
    }
    if (query.active !== undefined) {
      where.revokedAt = query.active ? null : { $ne: null };
    }

    const assignments = await this.em.find(LicenseAssignment, where, {
      populate: ['product', 'employee'],
      orderBy: { assignedAt: 'DESC' },
    });
    return assignments.map((assignment) => this.toResponse(assignment));
  }

  revoke(id: string): Promise<LicenseResponseDto> {
    return this.em.transactional(async () => {
      // FOR UPDATE: two concurrent revokes cannot both see it as active (RN06).
      const assignment = await this.findAssignmentOrFail(
        id,
        LockMode.PESSIMISTIC_WRITE,
      );
      if (!assignment.isActive) {
        throw new ConflictException(
          `License assignment '${id}' is already revoked`,
        );
      }

      assignment.revoke(RevokeReason.MANUAL);
      await this.em.flush();

      return this.toResponse(assignment);
    });
  }

  private async findAssignmentOrFail(
    id: string,
    lockMode: LockMode,
  ): Promise<LicenseAssignment> {
    const assignment = await this.em.findOne(
      LicenseAssignment,
      { id },
      { lockMode },
    );
    if (!assignment) {
      throw new NotFoundException(`License assignment '${id}' not found`);
    }
    // Populated in a separate query so the lock stays on this row only.
    await this.em.populate(assignment, ['product', 'employee']);
    return assignment;
  }

  private async flushAssignment(
    product: Product,
    employee: Employee,
  ): Promise<void> {
    try {
      await this.em.flush();
    } catch (error) {
      // RN03 under concurrency: the partial unique index rejected a second
      // active assignment of the same product for the same employee.
      if (error instanceof UniqueConstraintViolationException) {
        throw this.alreadyAssignedError(product, employee);
      }
      throw error;
    }
  }

  // RN02 / RN08: only ACTIVE employees receive new licenses.
  private ensureEmployeeIsActive(employee: Employee): void {
    if (employee.status !== EmployeeStatus.ACTIVE) {
      throw new ConflictException(
        `Employee '${employee.name}' is ${employee.status}; only ACTIVE employees can receive licenses`,
      );
    }
  }

  // RN03: no two active assignments of the same product for one employee.
  private async ensureNotAlreadyAssigned(
    product: Product,
    employee: Employee,
  ): Promise<void> {
    const activeAssignments = await this.em.count(LicenseAssignment, {
      product,
      employee,
      revokedAt: null,
    });
    if (activeAssignments > 0) {
      throw this.alreadyAssignedError(product, employee);
    }
  }

  // RN01: the product must have a free seat.
  private ensureHasAvailableSeat(product: Product, seatsInUse: number): void {
    if (seatsInUse >= product.totalSeats) {
      throw new ConflictException(
        `Product '${product.name}' has no available seats (${seatsInUse}/${product.totalSeats} in use)`,
      );
    }
  }

  // Real-time alert (specs/realtime.spec.md): the product reached 90% or more
  // of its seats. Compared with integers, not floats, so any threshold is safe.
  private notifyIfNearlyFull(product: Product, seatsInUse: number): void {
    const reachedThreshold =
      seatsInUse * 100 >= product.totalSeats * SEATS_THRESHOLD_PERCENT;
    if (reachedThreshold) {
      this.seatsGateway.notifySeatsThreshold({
        productId: product.id,
        productName: product.name,
        seatsInUse,
        totalSeats: product.totalSeats,
      });
    }
  }

  private alreadyAssignedError(
    product: Product,
    employee: Employee,
  ): ConflictException {
    return new ConflictException(
      `Employee '${employee.name}' already has an active '${product.name}' license`,
    );
  }

  private toResponse(assignment: LicenseAssignment): LicenseResponseDto {
    return {
      id: assignment.id,
      productId: assignment.product.id,
      productName: assignment.product.name,
      employeeId: assignment.employee.id,
      employeeName: assignment.employee.name,
      assignedAt: assignment.assignedAt,
      revokedAt: assignment.revokedAt,
      revokeReason: assignment.revokeReason,
    };
  }
}

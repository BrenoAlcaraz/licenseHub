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
import { LicenseAssignment } from '../licenses/license-assignment.entity';
import { RevokeReason } from '../licenses/revoke-reason.enum';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeDetailResponseDto } from './dto/employee-detail-response.dto';
import { EmployeeResponseDto } from './dto/employee-response.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { OffboardResponseDto } from './dto/offboard-response.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { EmployeeStatus } from './employee-status.enum';
import { Employee } from './employee.entity';

function sumMonthlyCost(assignments: LicenseAssignment[]): number {
  return assignments.reduce(
    (total, assignment) => total + assignment.product.monthlyCostCents,
    0,
  );
}

@Injectable()
export class EmployeesService {
  constructor(private readonly em: EntityManager) {}

  async create(dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    await this.ensureEmailIsAvailable(dto.email);

    const employee = this.em.create(Employee, dto);
    await this.flushWithDuplicateEmailHandling(dto.email);

    return this.toResponse(employee);
  }

  async findAll(query: ListEmployeesQueryDto): Promise<EmployeeResponseDto[]> {
    const where: FilterQuery<Employee> = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.department) {
      where.department = query.department;
    }

    const employees = await this.em.find(Employee, where, {
      orderBy: { name: 'ASC' },
    });
    return employees.map((employee) => this.toResponse(employee));
  }

  async findOne(id: string): Promise<EmployeeDetailResponseDto> {
    const employee = await this.findEmployeeOrFail(id);
    const activeAssignments = await this.em.find(
      LicenseAssignment,
      { employee, revokedAt: null },
      { populate: ['product'], orderBy: { assignedAt: 'ASC' } },
    );

    return {
      ...this.toResponse(employee),
      activeLicenses: activeAssignments.map((assignment) => ({
        assignmentId: assignment.id,
        productId: assignment.product.id,
        productName: assignment.product.name,
        assignedAt: assignment.assignedAt,
      })),
    };
  }

  updateStatus(
    id: string,
    dto: UpdateEmployeeStatusDto,
  ): Promise<EmployeeResponseDto> {
    return this.em.transactional(async () => {
      // FOR UPDATE: a concurrent offboarding cannot be overwritten (EMP-AC15).
      const employee = await this.findEmployeeOrFail(
        id,
        LockMode.PESSIMISTIC_WRITE,
      );
      this.ensureCanChangeStatus(employee);

      // RN08: going ON_LEAVE keeps the current licenses; nothing is revoked.
      employee.status = dto.status;
      await this.em.flush();

      return this.toResponse(employee);
    });
  }

  // RN04: status, offboardedAt and every revocation are saved together or not
  // at all, because they run inside one transaction.
  offboard(id: string): Promise<OffboardResponseDto> {
    return this.em.transactional(async () => {
      // FOR UPDATE: concurrent offboard/assign/status change wait (EMP-AC15).
      const employee = await this.findEmployeeOrFail(
        id,
        LockMode.PESSIMISTIC_WRITE,
      );
      this.ensureIsNotAlreadyOffboarded(employee);

      const activeAssignments =
        await this.findActiveAssignmentsForUpdate(employee);
      for (const assignment of activeAssignments) {
        assignment.revoke(RevokeReason.OFFBOARDING);
      }
      employee.status = EmployeeStatus.OFFBOARDED;
      employee.offboardedAt = new Date();
      await this.em.flush();

      return {
        employeeId: employee.id,
        status: employee.status,
        revokedLicenses: activeAssignments.length,
        monthlySavingsCents: sumMonthlyCost(activeAssignments),
      };
    });
  }

  /**
   * @param lockMode pass LockMode.PESSIMISTIC_WRITE (inside a transaction) to
   * read the row with SELECT ... FOR UPDATE.
   */
  async findEmployeeOrFail(id: string, lockMode?: LockMode): Promise<Employee> {
    const employee = await this.em.findOne(Employee, { id }, { lockMode });
    if (!employee) {
      throw new NotFoundException(`Employee '${id}' not found`);
    }
    return employee;
  }

  private async ensureEmailIsAvailable(email: string): Promise<void> {
    const existing = await this.em.findOne(Employee, { email });
    if (existing) {
      throw new ConflictException(
        `Employee with email '${email}' already exists`,
      );
    }
  }

  private async flushWithDuplicateEmailHandling(email: string): Promise<void> {
    try {
      await this.em.flush();
    } catch (error) {
      // RN09 under concurrency: the unique constraint is the final guard when
      // two requests pass the availability check before either one commits.
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException(
          `Employee with email '${email}' already exists`,
        );
      }
      throw error;
    }
  }

  private ensureCanChangeStatus(employee: Employee): void {
    if (employee.status === EmployeeStatus.OFFBOARDED) {
      throw new ConflictException(
        `Employee '${employee.name}' is offboarded and cannot change status`,
      );
    }
  }

  // RN05: offboarding happens only once.
  private ensureIsNotAlreadyOffboarded(employee: Employee): void {
    if (employee.status === EmployeeStatus.OFFBOARDED) {
      throw new ConflictException(
        `Employee '${employee.name}' is already offboarded`,
      );
    }
  }

  private async findActiveAssignmentsForUpdate(
    employee: Employee,
  ): Promise<LicenseAssignment[]> {
    const assignments = await this.em.find(
      LicenseAssignment,
      { employee, revokedAt: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    // Products are loaded in a separate query so the lock stays on the
    // assignment rows only.
    await this.em.populate(assignments, ['product']);
    return assignments;
  }

  private toResponse(employee: Employee): EmployeeResponseDto {
    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      department: employee.department,
      status: employee.status,
      offboardedAt: employee.offboardedAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };
  }
}

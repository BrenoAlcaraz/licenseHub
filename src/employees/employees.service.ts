import { FilterQuery, LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LicenseAssignment } from '../licenses/license-assignment.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeDetailResponseDto } from './dto/employee-detail-response.dto';
import { EmployeeResponseDto } from './dto/employee-response.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { EmployeeStatus } from './employee-status.enum';
import { Employee } from './employee.entity';

@Injectable()
export class EmployeesService {
  constructor(private readonly em: EntityManager) {}

  async create(dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    await this.ensureEmailIsAvailable(dto.email);

    const employee = this.em.create(Employee, dto);
    await this.em.flush();

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

  async updateStatus(
    id: string,
    dto: UpdateEmployeeStatusDto,
  ): Promise<EmployeeResponseDto> {
    const employee = await this.findEmployeeOrFail(id);
    this.ensureIsNotOffboarded(employee);

    // RN08: going ON_LEAVE keeps the current licenses; nothing is revoked here.
    employee.status = dto.status;
    await this.em.flush();

    return this.toResponse(employee);
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

  private ensureIsNotOffboarded(employee: Employee): void {
    if (employee.status === EmployeeStatus.OFFBOARDED) {
      throw new ConflictException(
        `Employee '${employee.name}' is offboarded and cannot change status`,
      );
    }
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

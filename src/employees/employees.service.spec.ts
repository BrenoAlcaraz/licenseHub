import { LockMode, UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LicenseAssignment } from '../licenses/license-assignment.entity';
import { RevokeReason } from '../licenses/revoke-reason.enum';
import { Product } from '../products/product.entity';
import { EmployeeStatus } from './employee-status.enum';
import { Employee } from './employee.entity';
import { EmployeesService } from './employees.service';

const EMPLOYEE_ID = '3b9f6d2a-1c4e-4f8a-9b7d-5e6f7a8b9c0d';

function buildEmployee(overrides: Partial<Employee> = {}): Employee {
  return Object.assign(new Employee(), {
    id: EMPLOYEE_ID,
    name: 'Ana Souza',
    email: 'ana.souza@empresa.com',
    department: 'IT',
    ...overrides,
  });
}

describe('EmployeesService', () => {
  let service: EmployeesService;
  let em: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    flush: jest.Mock;
    populate: jest.Mock;
    transactional: jest.Mock;
  };
  // Lets tests check that the writes happened inside the transaction (RN04).
  let insideTransaction: boolean;
  let flushedInsideTransaction: boolean;

  beforeEach(async () => {
    insideTransaction = false;
    flushedInsideTransaction = false;
    em = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((_entity, data: Partial<Employee>) =>
        buildEmployee(data),
      ),
      flush: jest.fn(() => {
        flushedInsideTransaction = insideTransaction;
      }),
      populate: jest.fn(),
      transactional: jest.fn(async (work: () => Promise<unknown>) => {
        insideTransaction = true;
        try {
          return await work();
        } finally {
          insideTransaction = false;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [EmployeesService, { provide: EntityManager, useValue: em }],
    }).compile();

    service = moduleRef.get(EmployeesService);
  });

  describe('create', () => {
    const dto = {
      name: 'Ana Souza',
      email: 'ana.souza@empresa.com',
      department: 'IT',
    };

    it('EMP-AC01 creates an ACTIVE employee', async () => {
      em.findOne.mockResolvedValue(null);

      const result = await service.create(dto);

      expect(em.create).toHaveBeenCalledWith(Employee, dto);
      expect(em.flush).toHaveBeenCalled();
      expect(result).toMatchObject({
        ...dto,
        status: EmployeeStatus.ACTIVE,
        offboardedAt: null,
      });
    });

    it('EMP-AC02 (RN09) rejects a duplicated email', async () => {
      em.findOne.mockResolvedValue(buildEmployee());

      await expect(service.create(dto)).rejects.toThrow(
        new ConflictException(
          "Employee with email 'ana.souza@empresa.com' already exists",
        ),
      );
      expect(em.flush).not.toHaveBeenCalled();
    });

    it('EMP-AC16 (RN09) returns 409 when a concurrent create wins after the availability check', async () => {
      em.findOne.mockResolvedValue(null);
      em.flush.mockRejectedValue(
        new UniqueConstraintViolationException(new Error('duplicate key')),
      );

      await expect(service.create(dto)).rejects.toThrow(
        new ConflictException(
          "Employee with email 'ana.souza@empresa.com' already exists",
        ),
      );
    });
  });

  describe('findAll', () => {
    beforeEach(() => em.find.mockResolvedValue([buildEmployee()]));

    it('EMP-AC04 filters by status and department', async () => {
      const result = await service.findAll({
        status: EmployeeStatus.ACTIVE,
        department: 'IT',
      });

      expect(em.find).toHaveBeenCalledWith(
        Employee,
        { status: EmployeeStatus.ACTIVE, department: 'IT' },
        expect.anything(),
      );
      expect(result).toHaveLength(1);
    });

    it('EMP-AC04 returns everyone when no filter is given', async () => {
      await service.findAll({});

      expect(em.find).toHaveBeenCalledWith(Employee, {}, expect.anything());
    });
  });

  describe('findOne', () => {
    it('EMP-AC05 returns the employee with only the active licenses', async () => {
      const employee = buildEmployee();
      const assignedAt = new Date('2026-09-01T00:00:00Z');
      const slack = Object.assign(new Product(), {
        id: 'slack-id',
        name: 'Slack Pro',
      });
      em.findOne.mockResolvedValue(employee);
      em.find.mockResolvedValue([
        Object.assign(new LicenseAssignment(), {
          id: 'assignment-id',
          product: slack,
          employee,
          assignedAt,
        }),
      ]);

      const result = await service.findOne(EMPLOYEE_ID);

      expect(em.find).toHaveBeenCalledWith(
        LicenseAssignment,
        { employee, revokedAt: null },
        expect.objectContaining({ populate: ['product'] }),
      );
      expect(result).toMatchObject({ id: EMPLOYEE_ID, name: 'Ana Souza' });
      expect(result.activeLicenses).toEqual([
        {
          assignmentId: 'assignment-id',
          productId: 'slack-id',
          productName: 'Slack Pro',
          assignedAt,
        },
      ]);
    });

    it('EMP-AC06 (RN10) throws 404 when the employee does not exist', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.findOne(EMPLOYEE_ID)).rejects.toThrow(
        new NotFoundException(`Employee '${EMPLOYEE_ID}' not found`),
      );
    });
  });

  describe('updateStatus', () => {
    it('EMP-AC07 (RN08) puts an ACTIVE employee ON_LEAVE', async () => {
      em.findOne.mockResolvedValue(buildEmployee());

      const result = await service.updateStatus(EMPLOYEE_ID, {
        status: EmployeeStatus.ON_LEAVE,
      });

      expect(em.flush).toHaveBeenCalled();
      expect(result.status).toBe(EmployeeStatus.ON_LEAVE);
      // RN08: licenses are not even looked up, so none can be revoked.
      expect(em.find).not.toHaveBeenCalled();
    });

    it('EMP-AC08 brings an ON_LEAVE employee back to ACTIVE', async () => {
      em.findOne.mockResolvedValue(
        buildEmployee({ status: EmployeeStatus.ON_LEAVE }),
      );

      const result = await service.updateStatus(EMPLOYEE_ID, {
        status: EmployeeStatus.ACTIVE,
      });

      expect(result.status).toBe(EmployeeStatus.ACTIVE);
    });

    it('EMP-AC06 (RN10) throws 404 when the employee does not exist', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus(EMPLOYEE_ID, { status: EmployeeStatus.ACTIVE }),
      ).rejects.toThrow(NotFoundException);
    });

    it('EMP-AC15 reads the employee with a row lock inside a transaction', async () => {
      em.findOne.mockResolvedValue(buildEmployee());

      await service.updateStatus(EMPLOYEE_ID, {
        status: EmployeeStatus.ON_LEAVE,
      });

      expect(em.findOne).toHaveBeenCalledWith(
        Employee,
        { id: EMPLOYEE_ID },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      expect(flushedInsideTransaction).toBe(true);
    });

    it('EMP-AC10 rejects status changes of an OFFBOARDED employee', async () => {
      em.findOne.mockResolvedValue(
        buildEmployee({ status: EmployeeStatus.OFFBOARDED }),
      );

      await expect(
        service.updateStatus(EMPLOYEE_ID, { status: EmployeeStatus.ACTIVE }),
      ).rejects.toThrow(
        new ConflictException(
          "Employee 'Ana Souza' is offboarded and cannot change status",
        ),
      );
      expect(em.flush).not.toHaveBeenCalled();
    });
  });
  describe('offboard', () => {
    function buildActiveAssignment(name: string, monthlyCostCents: number) {
      return Object.assign(new LicenseAssignment(), {
        id: `assignment-${name}`,
        product: Object.assign(new Product(), { name, monthlyCostCents }),
      });
    }

    it('EMP-AC11 (RN04) offboards and revokes every active license in one transaction', async () => {
      const employee = buildEmployee();
      const assignments = [
        buildActiveAssignment('Microsoft 365 E3', 18900),
        buildActiveAssignment('Slack Pro', 4500),
        buildActiveAssignment('Jira Software', 4000),
      ];
      em.findOne.mockResolvedValue(employee);
      em.find.mockResolvedValue(assignments);

      const result = await service.offboard(EMPLOYEE_ID);

      expect(result).toEqual({
        employeeId: EMPLOYEE_ID,
        status: EmployeeStatus.OFFBOARDED,
        revokedLicenses: 3,
        monthlySavingsCents: 27400,
      });
      expect(employee.status).toBe(EmployeeStatus.OFFBOARDED);
      expect(employee.offboardedAt).toBeInstanceOf(Date);
      for (const assignment of assignments) {
        expect(assignment.revokedAt).toBeInstanceOf(Date);
        expect(assignment.revokeReason).toBe(RevokeReason.OFFBOARDING);
      }
      expect(em.find).toHaveBeenCalledWith(
        LicenseAssignment,
        { employee, revokedAt: null },
        expect.anything(),
      );
      expect(em.transactional).toHaveBeenCalledTimes(1);
      expect(flushedInsideTransaction).toBe(true);
    });

    it('EMP-AC12 (RN04) offboards an employee without licenses', async () => {
      em.findOne.mockResolvedValue(buildEmployee());
      em.find.mockResolvedValue([]);

      const result = await service.offboard(EMPLOYEE_ID);

      expect(result).toMatchObject({
        status: EmployeeStatus.OFFBOARDED,
        revokedLicenses: 0,
        monthlySavingsCents: 0,
      });
    });

    it('EMP-AC13 (RN04) offboards an employee who is ON_LEAVE', async () => {
      const employee = buildEmployee({ status: EmployeeStatus.ON_LEAVE });
      em.findOne.mockResolvedValue(employee);
      em.find.mockResolvedValue([buildActiveAssignment('Slack Pro', 4500)]);

      const result = await service.offboard(EMPLOYEE_ID);

      expect(result.revokedLicenses).toBe(1);
      expect(employee.status).toBe(EmployeeStatus.OFFBOARDED);
    });

    it('EMP-AC14 (RN05) rejects offboarding an already OFFBOARDED employee', async () => {
      em.findOne.mockResolvedValue(
        buildEmployee({ status: EmployeeStatus.OFFBOARDED }),
      );

      await expect(service.offboard(EMPLOYEE_ID)).rejects.toThrow(
        new ConflictException("Employee 'Ana Souza' is already offboarded"),
      );
      expect(em.find).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });

    it('EMP-AC06 (RN10) throws 404 when the employee does not exist', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.offboard(EMPLOYEE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('EMP-AC15 reads the employee and its assignments with row locks', async () => {
      em.findOne.mockResolvedValue(buildEmployee());
      em.find.mockResolvedValue([]);

      await service.offboard(EMPLOYEE_ID);

      expect(em.findOne).toHaveBeenCalledWith(
        Employee,
        { id: EMPLOYEE_ID },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      expect(em.find).toHaveBeenCalledWith(
        LicenseAssignment,
        expect.anything(),
        expect.objectContaining({ lockMode: LockMode.PESSIMISTIC_WRITE }),
      );
    });
  });
});

import { LockMode, UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EmployeeStatus } from '../employees/employee-status.enum';
import { Employee } from '../employees/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { Product } from '../products/product.entity';
import { ProductsService } from '../products/products.service';
import { LicenseAssignment } from './license-assignment.entity';
import { LicensesService } from './licenses.service';
import { RevokeReason } from './revoke-reason.enum';
import { SeatsThresholdGateway } from './seats-threshold.gateway';

const PRODUCT_ID = '6f1c2a3e-8a4b-4c1d-9e2f-0a1b2c3d4e5f';
const EMPLOYEE_ID = '3b9f6d2a-1c4e-4f8a-9b7d-5e6f7a8b9c0d';
const ASSIGNMENT_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function buildProduct(): Product {
  return Object.assign(new Product(), {
    id: PRODUCT_ID,
    name: 'Slack Pro',
    vendor: 'Slack',
    monthlyCostCents: 4500,
    totalSeats: 5,
  });
}

function buildEmployee(status = EmployeeStatus.ACTIVE): Employee {
  return Object.assign(new Employee(), {
    id: EMPLOYEE_ID,
    name: 'Ana Souza',
    email: 'ana.souza@empresa.com',
    department: 'IT',
    status,
  });
}

function buildAssignment(
  overrides: Partial<LicenseAssignment> = {},
): LicenseAssignment {
  return Object.assign(new LicenseAssignment(), {
    id: ASSIGNMENT_ID,
    product: buildProduct(),
    employee: buildEmployee(),
    ...overrides,
  });
}

describe('LicensesService', () => {
  let service: LicensesService;
  let em: {
    count: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    flush: jest.Mock;
    populate: jest.Mock;
    transactional: jest.Mock;
  };
  let productsService: {
    findProductOrFail: jest.Mock;
    countSeatsInUse: jest.Mock;
  };
  let employeesService: { findEmployeeOrFail: jest.Mock };
  let seatsGateway: { notifySeatsThreshold: jest.Mock };
  // Lets RT-AC06 check that the event is sent after the transaction ends.
  let insideTransaction: boolean;
  let product: Product;
  let employee: Employee;

  const dto = { productId: PRODUCT_ID, employeeId: EMPLOYEE_ID };

  beforeEach(async () => {
    product = buildProduct();
    employee = buildEmployee();
    em = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((_entity, data: Partial<LicenseAssignment>) =>
        buildAssignment(data),
      ),
      find: jest.fn(),
      findOne: jest.fn(),
      flush: jest.fn(),
      populate: jest.fn(),
      // Runs the callback right away, like a transaction that commits.
      transactional: jest.fn(async (work: () => Promise<unknown>) => {
        insideTransaction = true;
        try {
          return await work();
        } finally {
          insideTransaction = false;
        }
      }),
    };
    productsService = {
      findProductOrFail: jest.fn().mockResolvedValue(product),
      countSeatsInUse: jest.fn().mockResolvedValue(4),
    };
    employeesService = {
      findEmployeeOrFail: jest.fn().mockResolvedValue(employee),
    };
    insideTransaction = false;
    seatsGateway = { notifySeatsThreshold: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LicensesService,
        { provide: EntityManager, useValue: em },
        { provide: ProductsService, useValue: productsService },
        { provide: EmployeesService, useValue: employeesService },
        { provide: SeatsThresholdGateway, useValue: seatsGateway },
      ],
    }).compile();

    service = moduleRef.get(LicensesService);
  });

  describe('assign', () => {
    it('LIC-AC01 assigns a license when there is a free seat and the employee is ACTIVE', async () => {
      const result = await service.assign(dto);

      expect(em.create).toHaveBeenCalledWith(LicenseAssignment, {
        product,
        employee,
      });
      expect(em.flush).toHaveBeenCalled();
      expect(result).toMatchObject({
        productId: PRODUCT_ID,
        productName: 'Slack Pro',
        employeeId: EMPLOYEE_ID,
        employeeName: 'Ana Souza',
        revokedAt: null,
        revokeReason: null,
      });
      expect(result.assignedAt).toBeInstanceOf(Date);
    });

    it('LIC-AC02 (RN10) fails with 404 when the product does not exist', async () => {
      productsService.findProductOrFail.mockRejectedValue(
        new NotFoundException(`Product '${PRODUCT_ID}' not found`),
      );

      await expect(service.assign(dto)).rejects.toThrow(NotFoundException);
      expect(em.create).not.toHaveBeenCalled();
    });

    it('LIC-AC03 (RN10) fails with 404 when the employee does not exist', async () => {
      employeesService.findEmployeeOrFail.mockRejectedValue(
        new NotFoundException(`Employee '${EMPLOYEE_ID}' not found`),
      );

      await expect(service.assign(dto)).rejects.toThrow(NotFoundException);
      expect(em.create).not.toHaveBeenCalled();
    });

    it.each([EmployeeStatus.ON_LEAVE, EmployeeStatus.OFFBOARDED])(
      'LIC-AC04 (RN02) fails with 409 when the employee is %s',
      async (status) => {
        employeesService.findEmployeeOrFail.mockResolvedValue(
          buildEmployee(status),
        );

        await expect(service.assign(dto)).rejects.toThrow(
          new ConflictException(
            `Employee 'Ana Souza' is ${status}; only ACTIVE employees can receive licenses`,
          ),
        );
        expect(em.create).not.toHaveBeenCalled();
      },
    );

    it('LIC-AC05 (RN03) fails with 409 when the employee already has an active license of the product', async () => {
      em.count.mockResolvedValue(1);

      await expect(service.assign(dto)).rejects.toThrow(
        new ConflictException(
          "Employee 'Ana Souza' already has an active 'Slack Pro' license",
        ),
      );
      expect(em.create).not.toHaveBeenCalled();
    });

    it('LIC-AC06 (RN03) only active assignments count as duplicates', async () => {
      await service.assign(dto);

      expect(em.count).toHaveBeenCalledWith(LicenseAssignment, {
        product,
        employee,
        revokedAt: null,
      });
      expect(em.create).toHaveBeenCalled();
    });

    it('LIC-AC07 (RN01) fails with 409 when the product has no available seats', async () => {
      productsService.countSeatsInUse.mockResolvedValue(5);

      await expect(service.assign(dto)).rejects.toThrow(
        new ConflictException(
          "Product 'Slack Pro' has no available seats (5/5 in use)",
        ),
      );
      expect(em.create).not.toHaveBeenCalled();
    });

    it('LIC-AC14 (RN01) reads product and employee with a row lock inside a transaction', async () => {
      await service.assign(dto);

      expect(em.transactional).toHaveBeenCalledTimes(1);
      expect(productsService.findProductOrFail).toHaveBeenCalledWith(
        PRODUCT_ID,
        LockMode.PESSIMISTIC_WRITE,
      );
      expect(employeesService.findEmployeeOrFail).toHaveBeenCalledWith(
        EMPLOYEE_ID,
        LockMode.PESSIMISTIC_WRITE,
      );
    });

    it('LIC-AC13 (RN03) maps a concurrent duplicate caught by the unique index to 409', async () => {
      em.flush.mockRejectedValue(
        new UniqueConstraintViolationException(new Error('duplicate key')),
      );

      await expect(service.assign(dto)).rejects.toThrow(
        new ConflictException(
          "Employee 'Ana Souza' already has an active 'Slack Pro' license",
        ),
      );
    });
  });

  describe('findAll', () => {
    beforeEach(() => em.find.mockResolvedValue([buildAssignment()]));

    it('LIC-AC09 filters by product and active assignments', async () => {
      const result = await service.findAll({
        productId: PRODUCT_ID,
        active: true,
      });

      expect(em.find).toHaveBeenCalledWith(
        LicenseAssignment,
        { product: PRODUCT_ID, revokedAt: null },
        expect.anything(),
      );
      expect(result).toHaveLength(1);
    });

    it('LIC-AC09 active=false returns only revoked assignments', async () => {
      await service.findAll({ employeeId: EMPLOYEE_ID, active: false });

      expect(em.find).toHaveBeenCalledWith(
        LicenseAssignment,
        { employee: EMPLOYEE_ID, revokedAt: { $ne: null } },
        expect.anything(),
      );
    });

    it('LIC-AC09 returns everything when no filter is given', async () => {
      await service.findAll({});

      expect(em.find).toHaveBeenCalledWith(
        LicenseAssignment,
        {},
        expect.anything(),
      );
    });
  });

  describe('revoke', () => {
    it('LIC-AC10 revokes an active assignment with reason MANUAL', async () => {
      em.findOne.mockResolvedValue(buildAssignment());

      const result = await service.revoke(ASSIGNMENT_ID);

      expect(em.flush).toHaveBeenCalled();
      expect(result.revokedAt).toBeInstanceOf(Date);
      expect(result.revokeReason).toBe(RevokeReason.MANUAL);
    });

    it('LIC-AC15 (RN06) reads the assignment with a row lock inside a transaction', async () => {
      em.findOne.mockResolvedValue(buildAssignment());

      await service.revoke(ASSIGNMENT_ID);

      expect(em.transactional).toHaveBeenCalledTimes(1);
      expect(em.findOne).toHaveBeenCalledWith(
        LicenseAssignment,
        { id: ASSIGNMENT_ID },
        expect.objectContaining({ lockMode: LockMode.PESSIMISTIC_WRITE }),
      );
    });

    it('LIC-AC11 (RN06) fails with 409 when the assignment is already revoked', async () => {
      const revokedAt = new Date('2026-01-01T00:00:00Z');
      const assignment = buildAssignment({
        revokedAt,
        revokeReason: RevokeReason.OFFBOARDING,
      });
      em.findOne.mockResolvedValue(assignment);

      await expect(service.revoke(ASSIGNMENT_ID)).rejects.toThrow(
        new ConflictException(
          `License assignment '${ASSIGNMENT_ID}' is already revoked`,
        ),
      );
      expect(assignment.revokedAt).toBe(revokedAt);
      expect(assignment.revokeReason).toBe(RevokeReason.OFFBOARDING);
      expect(em.flush).not.toHaveBeenCalled();
    });

    it('LIC-AC12 (RN10) fails with 404 when the assignment does not exist', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.revoke(ASSIGNMENT_ID)).rejects.toThrow(
        new NotFoundException(
          `License assignment '${ASSIGNMENT_ID}' not found`,
        ),
      );
    });
  });
  describe('seats.threshold event', () => {
    function givenProduct(totalSeats: number, seatsInUseBefore: number) {
      product.totalSeats = totalSeats;
      productsService.countSeatsInUse.mockResolvedValue(seatsInUseBefore);
    }

    it('RT-AC01 notifies when an assignment reaches 90% of the seats', async () => {
      givenProduct(10, 8);

      await service.assign(dto);

      expect(seatsGateway.notifySeatsThreshold).toHaveBeenCalledWith({
        productId: PRODUCT_ID,
        productName: 'Slack Pro',
        seatsInUse: 9,
        totalSeats: 10,
      });
    });

    it('RT-AC02 does not notify below 90%', async () => {
      givenProduct(10, 7);

      await service.assign(dto);

      expect(seatsGateway.notifySeatsThreshold).not.toHaveBeenCalled();
    });

    it('RT-AC03 keeps notifying above 90%', async () => {
      givenProduct(10, 9);

      await service.assign(dto);

      expect(seatsGateway.notifySeatsThreshold).toHaveBeenCalledWith(
        expect.objectContaining({ seatsInUse: 10, totalSeats: 10 }),
      );
    });

    it('RT-AC04 notifies at exactly 90% (63/70)', async () => {
      givenProduct(70, 62);

      await service.assign(dto);

      expect(seatsGateway.notifySeatsThreshold).toHaveBeenCalledWith(
        expect.objectContaining({ seatsInUse: 63, totalSeats: 70 }),
      );
    });

    it('RT-AC05 does not notify when the assignment is refused', async () => {
      givenProduct(10, 8);
      em.count.mockResolvedValue(1); // RN03: already assigned

      await expect(service.assign(dto)).rejects.toThrow(ConflictException);
      expect(seatsGateway.notifySeatsThreshold).not.toHaveBeenCalled();
    });

    it('RT-AC06 notifies only after the transaction has finished', async () => {
      givenProduct(10, 8);
      let notifiedInsideTransaction: boolean | undefined;
      seatsGateway.notifySeatsThreshold.mockImplementation(() => {
        notifiedInsideTransaction = insideTransaction;
      });

      await service.assign(dto);

      expect(notifiedInsideTransaction).toBe(false);
    });
  });
});

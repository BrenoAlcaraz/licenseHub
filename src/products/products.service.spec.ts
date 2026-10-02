import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LicenseAssignment } from '../licenses/license-assignment.entity';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

const PRODUCT_ID = '6f1c2a3e-8a4b-4c1d-9e2f-0a1b2c3d4e5f';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return Object.assign(new Product(), {
    id: PRODUCT_ID,
    name: 'Microsoft 365 E3',
    vendor: 'Microsoft',
    monthlyCostCents: 18900,
    totalSeats: 10,
    ...overrides,
  });
}

describe('ProductsService', () => {
  let service: ProductsService;
  let em: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    assign: jest.Mock;
    flush: jest.Mock;
    count: jest.Mock;
  };

  beforeEach(async () => {
    em = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((_entity, data: Partial<Product>) => buildProduct(data)),
      assign: jest.fn((entity: Product, data: Partial<Product>) =>
        Object.assign(entity, data),
      ),
      flush: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ProductsService, { provide: EntityManager, useValue: em }],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  describe('create', () => {
    const dto = {
      name: 'Microsoft 365 E3',
      vendor: 'Microsoft',
      monthlyCostCents: 18900,
      totalSeats: 10,
    };

    it('PRD-AC01 creates a product with all seats available', async () => {
      em.findOne.mockResolvedValue(null);

      const result = await service.create(dto);

      expect(em.create).toHaveBeenCalledWith(Product, dto);
      expect(em.flush).toHaveBeenCalled();
      expect(result).toMatchObject({
        ...dto,
        seatsInUse: 0,
        seatsAvailable: 10,
      });
    });

    it('PRD-AC02 (RN09) rejects a duplicated name', async () => {
      em.findOne.mockResolvedValue(buildProduct());

      await expect(service.create(dto)).rejects.toThrow(
        new ConflictException("Product 'Microsoft 365 E3' already exists"),
      );
      expect(em.create).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('PRD-AC05 returns the product with seat counters', async () => {
      em.findOne.mockResolvedValue(buildProduct());

      const result = await service.findOne(PRODUCT_ID);

      expect(result).toEqual({
        id: PRODUCT_ID,
        name: 'Microsoft 365 E3',
        vendor: 'Microsoft',
        monthlyCostCents: 18900,
        totalSeats: 10,
        seatsInUse: 0,
        seatsAvailable: 10,
      });
    });

    it('PRD-AC06 (RN10) throws 404 when the product does not exist', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.findOne(PRODUCT_ID)).rejects.toThrow(
        new NotFoundException(`Product '${PRODUCT_ID}' not found`),
      );
    });
  });

  describe('findAll', () => {
    it('PRD-AC04 computes seats from active assignments only', async () => {
      const product = buildProduct();
      em.find.mockResolvedValue([product]);
      em.count.mockResolvedValue(7);

      const result = await service.findAll();

      expect(em.count).toHaveBeenCalledWith(LicenseAssignment, {
        product,
        revokedAt: null,
      });
      expect(result[0]).toMatchObject({ seatsInUse: 7, seatsAvailable: 3 });
    });
  });

  describe('update', () => {
    it('PRD-AC07 updates only the given fields', async () => {
      const product = buildProduct();
      em.findOne.mockResolvedValueOnce(product);

      const result = await service.update(PRODUCT_ID, {
        monthlyCostCents: 19900,
      });

      expect(em.flush).toHaveBeenCalled();
      expect(result).toMatchObject({
        name: 'Microsoft 365 E3',
        monthlyCostCents: 19900,
        totalSeats: 10,
      });
    });

    it('PRD-AC06 (RN10) throws 404 when the product does not exist', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(
        service.update(PRODUCT_ID, { monthlyCostCents: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('PRD-AC08 (RN09) rejects renaming to a name already in use', async () => {
      em.findOne
        .mockResolvedValueOnce(buildProduct({ name: 'Jira Software' }))
        .mockResolvedValueOnce(
          buildProduct({ id: 'slack-id', name: 'Slack Pro' }),
        );

      await expect(
        service.update(PRODUCT_ID, { name: 'Slack Pro' }),
      ).rejects.toThrow(
        new ConflictException("Product 'Slack Pro' already exists"),
      );
      expect(em.flush).not.toHaveBeenCalled();
    });

    it('PRD-AC08 (RN09) allows keeping its own name', async () => {
      em.findOne.mockResolvedValueOnce(buildProduct());

      await service.update(PRODUCT_ID, { name: 'Microsoft 365 E3' });

      expect(em.findOne).toHaveBeenCalledTimes(1);
      expect(em.flush).toHaveBeenCalled();
    });
  });
});

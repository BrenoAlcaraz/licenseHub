import { LockMode, UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LicenseAssignment } from '../licenses/license-assignment.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(private readonly em: EntityManager) {}

  async create(dto: CreateProductDto): Promise<ProductResponseDto> {
    await this.ensureNameIsAvailable(dto.name);

    const product = this.em.create(Product, dto);
    await this.flushWithDuplicateNameHandling(dto.name);

    return this.toResponse(product);
  }

  async findAll(): Promise<ProductResponseDto[]> {
    const products = await this.em.find(
      Product,
      {},
      { orderBy: { name: 'ASC' } },
    );
    return Promise.all(products.map((product) => this.toResponse(product)));
  }

  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.findProductOrFail(id);
    return this.toResponse(product);
  }

  update(id: string, dto: UpdateProductDto): Promise<ProductResponseDto> {
    return this.em.transactional(async () => {
      // FOR UPDATE: a concurrent assignment waits, so the seats counted below
      // cannot change before this update is saved (PRD-AC11).
      const product = await this.findProductOrFail(
        id,
        LockMode.PESSIMISTIC_WRITE,
      );

      if (dto.name !== undefined && dto.name !== product.name) {
        await this.ensureNameIsAvailable(dto.name);
      }
      if (dto.totalSeats !== undefined) {
        await this.ensureSeatsCoverUsage(product, dto.totalSeats);
      }

      this.em.assign(product, dto);
      if (dto.name !== undefined) {
        await this.flushWithDuplicateNameHandling(dto.name);
      } else {
        await this.em.flush();
      }

      return this.toResponse(product);
    });
  }

  /**
   * @param lockMode pass LockMode.PESSIMISTIC_WRITE (inside a transaction) to
   * read the row with SELECT ... FOR UPDATE.
   */
  async findProductOrFail(id: string, lockMode?: LockMode): Promise<Product> {
    const product = await this.em.findOne(Product, { id }, { lockMode });
    if (!product) {
      throw new NotFoundException(`Product '${id}' not found`);
    }
    return product;
  }

  /** Seats in use = active (not revoked) assignments of the product. */
  countSeatsInUse(product: Product): Promise<number> {
    return this.em.count(LicenseAssignment, { product, revokedAt: null });
  }

  // RN07: totalSeats cannot go below the seats currently in use.
  private async ensureSeatsCoverUsage(
    product: Product,
    totalSeats: number,
  ): Promise<void> {
    const seatsInUse = await this.countSeatsInUse(product);
    if (totalSeats < seatsInUse) {
      throw new ConflictException(
        `Cannot reduce totalSeats of '${product.name}' to ${totalSeats}: ${seatsInUse} seats in use`,
      );
    }
  }

  private async ensureNameIsAvailable(name: string): Promise<void> {
    const existing = await this.em.findOne(Product, { name });
    if (existing) {
      throw new ConflictException(`Product '${name}' already exists`);
    }
  }

  private async flushWithDuplicateNameHandling(name: string): Promise<void> {
    try {
      await this.em.flush();
    } catch (error) {
      // RN09 under concurrency: the unique constraint is the final guard when
      // two requests pass the availability check before either one commits.
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException(`Product '${name}' already exists`);
      }
      throw error;
    }
  }

  private async toResponse(product: Product): Promise<ProductResponseDto> {
    const seatsInUse = await this.countSeatsInUse(product);
    return {
      id: product.id,
      name: product.name,
      vendor: product.vendor,
      monthlyCostCents: product.monthlyCostCents,
      totalSeats: product.totalSeats,
      seatsInUse,
      seatsAvailable: product.totalSeats - seatsInUse,
    };
  }
}

import { EntityManager } from '@mikro-orm/postgresql';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    await this.em.flush();

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

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponseDto> {
    const product = await this.findProductOrFail(id);

    if (dto.name !== undefined && dto.name !== product.name) {
      await this.ensureNameIsAvailable(dto.name);
    }

    this.em.assign(product, dto);
    await this.em.flush();

    return this.toResponse(product);
  }

  async findProductOrFail(id: string): Promise<Product> {
    const product = await this.em.findOne(Product, { id });
    if (!product) {
      throw new NotFoundException(`Product '${id}' not found`);
    }
    return product;
  }

  // Seats start being used in step 5, when license assignments exist.
  countSeatsInUse(): Promise<number> {
    return Promise.resolve(0);
  }

  private async ensureNameIsAvailable(name: string): Promise<void> {
    const existing = await this.em.findOne(Product, { name });
    if (existing) {
      throw new ConflictException(`Product '${name}' already exists`);
    }
  }

  private async toResponse(product: Product): Promise<ProductResponseDto> {
    const seatsInUse = await this.countSeatsInUse();
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

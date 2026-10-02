import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createMikroOrmConfig } from './mikro-orm.config';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      useFactory: createMikroOrmConfig,
    }),
    ProductsModule,
  ],
})
export class AppModule {}

import { MikroORM } from '@mikro-orm/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The schema is created only by migrations: apply pending ones before
  // serving requests (no schema:update / synchronize).
  const appliedMigrations = await app.get(MikroORM).migrator.up();
  Logger.log(
    `${appliedMigrations.length} pending migration(s) applied`,
    'Migrations',
  );

  configureApp(app);

  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
}
void bootstrap();

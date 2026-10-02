import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

// HTTP configuration shared by main.ts and the e2e tests, so validation,
// documentation and static assets use the same production path.
export function configureApp(app: NestExpressApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const webRoot =
    process.env.NODE_ENV === 'test'
      ? join(process.cwd(), 'dist', 'web')
      : join(__dirname, 'web');
  app.useStaticAssets(webRoot);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LicenseHub')
    .setDescription('Software license seats, offboarding and cost reports')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, swaggerConfig),
  );
}

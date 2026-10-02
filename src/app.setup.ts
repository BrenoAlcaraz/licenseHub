import { INestApplication, ValidationPipe } from '@nestjs/common';

// HTTP configuration shared by main.ts and the e2e tests, so both run the app
// with exactly the same validation.
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

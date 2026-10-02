import { Migrator } from '@mikro-orm/migrations';
import { existsSync } from 'node:fs';
import { defineConfig } from '@mikro-orm/postgresql';

// Single source of database settings, shared by the app (AppModule) and the
// MikroORM CLI (migrations). It is a function so the app can call it only after
// ConfigModule has loaded `.env` into process.env.
export function createMikroOrmConfig() {
  return defineConfig({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dbName: process.env.DB_NAME,
    entities: ['dist/**/*.entity.js'],
    entitiesTs: ['src/**/*.entity.ts'],
    discovery: { warnWhenNoEntities: false },
    extensions: [Migrator],
    migrations: {
      path: 'dist/database/migrations',
      pathTs: 'src/database/migrations',
    },
  });
}

// Used by the MikroORM CLI (migrations). The CLI only reads MIKRO_ORM_* keys
// from `.env`, so we load our DB_* keys with Node's built-in loader.
// Variables already set in the environment (e.g. by Docker) are not overridden.
if (existsSync('.env')) {
  process.loadEnvFile();
}
export default createMikroOrmConfig();

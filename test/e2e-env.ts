// Runs before the e2e tests import anything: point the app to a separate
// database so the development data (seed) is never touched. Variables that
// are already set are not overridden by `.env`.
process.env.DB_NAME = process.env.DB_NAME_E2E ?? 'licensehub_e2e';

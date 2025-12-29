export type {
  UserStore,
  ChallengeStore,
  SessionStore,
  SeedKeyStores,
} from '@seedkey/sdk-server';

export {
  Database,
  getDatabase,
  createDatabaseFromEnv,
  PostgresUserStore,
  PostgresSessionStore,
  PostgresChallengeStore,
  createPostgresStores,
} from './postgres/index.js';
export type { DatabaseConfig } from './postgres/index.js';

export { Database, getDatabase, createDatabaseFromEnv } from './db.js';
export type { DatabaseConfig } from './db.js';

export { PostgresUserStore } from './users.js';
export { PostgresSessionStore } from './sessions.js';
export { PostgresChallengeStore } from './challenges.js';

import type { SeedKeyStores } from '@seedkey/sdk-server';
import { Database } from './db.js';
import { PostgresUserStore } from './users.js';
import { PostgresSessionStore } from './sessions.js';
import { PostgresChallengeStore } from './challenges.js';

/**
 * Create all PostgreSQL stores
 */
export function createPostgresStores(db: Database): SeedKeyStores {
  return {
    users: new PostgresUserStore(db),
    challenges: new PostgresChallengeStore(db),
    sessions: new PostgresSessionStore(db),
  };
}

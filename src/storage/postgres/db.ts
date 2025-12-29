/**
 * PostgreSQL Database Connection
 * 
 * Backend stores only core protocol entities:
 * - Users (with public keys)
 * - Sessions
 * - Challenges
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export class Database {
  private pool: Pool;
  private isConnected = false;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.max ?? 20,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10000,
    });

    // Error handler for the pool
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Initialize database connection and verify schema
   */
  async initialize(): Promise<void> {
    await this.query('SELECT 1');
      
      // Check if the required tables exist
    const result = await this.query<{ table_name: string }>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('users', 'public_keys', 'sessions', 'challenges')
    `);
    
    const existingTables = new Set(result.rows.map(r => r.table_name));
    const requiredTables = ['users', 'public_keys', 'sessions', 'challenges'];
    const missingTables = requiredTables.filter(t => !existingTables.has(t));
    
    if (missingTables.length > 0) {
      throw new Error(
        `Database schema is not initialized. Missing tables: ${missingTables.join(', ')}. ` +
        `Please run migrations from seedkey-db-migrations first.`
      );
    }

    this.isConnected = true;
    console.log('Database connection verified, schema is valid');
  }

  /**
   * Execute a query
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  /**
   * Get a client from the pool (for transactions)
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Check if database is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close the pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
  }

  /**
   * Get connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

// Global database instance
let db: Database | null = null;

/**
 * Get or create database instance
 */
export function getDatabase(config?: DatabaseConfig): Database {
  if (!db && config) {
    db = new Database(config);
  }
  if (!db) {
    throw new Error('Database not initialized. Call getDatabase(config) first.');
  }
  return db;
}

/**
 * Create database instance from environment variables
 */
export function createDatabaseFromEnv(): Database {
  const config: DatabaseConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'seedkey',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    ssl: process.env.POSTGRES_SSL === 'true',
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20', 10),
  };

  return getDatabase(config);
}

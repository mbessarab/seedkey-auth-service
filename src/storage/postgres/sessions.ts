/**
 * PostgreSQL Session Store
 */

import type { Session, SessionStore } from '@seedkey/sdk-server';
import { generateId } from '@seedkey/sdk-server';
import { Database } from './db.js';

export class PostgresSessionStore implements SessionStore {
  constructor(private db: Database) {}

  async create(userId: string, publicKeyId: string, expiresInSeconds?: number): Promise<Session> {
    const sessionId = generateId('ses');
    const now = Date.now();
    const expiresAt = expiresInSeconds
      ? now + expiresInSeconds * 1000
      : now + 30 * 24 * 60 * 60 * 1000; // 30 days default

    await this.db.query(
      `INSERT INTO sessions (id, user_id, public_key_id, created_at, expires_at, invalidated)
       VALUES ($1, $2, $3, $4, $5, FALSE)`,
      [sessionId, userId, publicKeyId, now, expiresAt]
    );

    return {
      id: sessionId,
      userId,
      publicKeyId,
      createdAt: now,
      expiresAt: expiresAt,
      invalidated: false,
    };
  }

  async findById(id: string): Promise<Session | null> {
    const result = await this.db.query<{
      id: string;
      user_id: string;
      public_key_id: string;
      created_at: number;
      expires_at: number;
      invalidated: boolean;
    }>(
      'SELECT * FROM sessions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      publicKeyId: row.public_key_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      invalidated: row.invalidated,
    };
  }

  async invalidate(id: string): Promise<boolean> {
    const result = await this.db.query(
      'UPDATE sessions SET invalidated = TRUE WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE sessions SET invalidated = TRUE WHERE user_id = $1',
      [userId]
    );
  }

  async isValid(id: string): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.query<{ is_valid: boolean }>(
      `SELECT 
        invalidated = FALSE AND expires_at > $2 AS is_valid
       FROM sessions WHERE id = $1`,
      [id, now]
    );

    if (result.rows.length === 0) return false;
    return result.rows[0].is_valid;
  }

  /**
   * Cleanup expired sessions (can be called periodically)
   */
  async cleanup(): Promise<number> {
    const now = Date.now(); 
    const result = await this.db.query(
      'DELETE FROM sessions WHERE expires_at < $1',
      [now]
    );
    return result.rowCount ?? 0;
  }
}


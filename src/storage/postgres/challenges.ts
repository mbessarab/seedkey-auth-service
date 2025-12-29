/**
 * PostgreSQL Challenge Store
 */

import type { StoredChallenge, ChallengeAction, ChallengeStore } from '@seedkey/sdk-server';
import { Database } from './db.js';

export class PostgresChallengeStore implements ChallengeStore {
  constructor(private db: Database) {}

  async save(challenge: StoredChallenge): Promise<void> {
    // Serialize challenge data to JSON for storage
    const challengeJson = JSON.stringify({
      nonce: challenge.nonce,
      timestamp: challenge.timestamp,
      domain: challenge.domain,
      action: challenge.action,
      expiresAt: challenge.expiresAt,
    });

    await this.db.query(
      `INSERT INTO challenges (id, challenge, nonce, public_key, action, domain, created_at, expires_at, used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET used = EXCLUDED.used`,
      [
        challenge.id,
        challengeJson,
        challenge.nonce,
        challenge.publicKey || null,
        challenge.action,
        challenge.domain,
        challenge.createdAt,
        challenge.expiresAt,
        challenge.used,
      ]
    );
  }

  async findById(id: string): Promise<StoredChallenge | null> {
    const result = await this.db.query<{
      id: string;
      challenge: string;
      nonce: string;
      public_key: string | null;
      action: string;
      domain: string;
      created_at: number;
      expires_at: number;
      used: boolean;
    }>(
      'SELECT * FROM challenges WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    // Parse challenge JSON if stored, or reconstruct from columns
    let timestamp: number;
    try {
      const parsed = JSON.parse(row.challenge);
      timestamp = parsed.timestamp;
    } catch {
      timestamp = row.created_at;
    }

    return {
      id: row.id,
      nonce: row.nonce,
      timestamp,
      domain: row.domain,
      action: row.action as ChallengeAction,
      expiresAt: row.expires_at,
      publicKey: row.public_key || undefined,
      createdAt: row.created_at,
      used: row.used,
    };
  }

  async markAsUsed(id: string): Promise<boolean> {
    const result = await this.db.query(
      'UPDATE challenges SET used = TRUE WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async isNonceUsed(nonce: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM challenges WHERE nonce = $1 AND used = TRUE',
      [nonce]
    );
    return result.rows.length > 0;
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM challenges WHERE id = $1', [id]);
  }

  /**
   * Cleanup expired challenges (can be called periodically)
   */
  async cleanup(): Promise<number> {
    const now = Date.now();
    const result = await this.db.query(
      'DELETE FROM challenges WHERE expires_at < $1',
      [now]
    );
    return result.rowCount ?? 0;
  }
}


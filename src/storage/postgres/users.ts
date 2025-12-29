import type { PublicKeyInfo, UserMetadata, KeyMetadata, UserStore, User } from '@seedkey/sdk-server';
import { generateId } from '@seedkey/sdk-server';
import { Database } from './db.js';

export class PostgresUserStore implements UserStore {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User | null> {
    const userResult = await this.db.query<{
      id: string;
      created_at: number;
      last_login: number | null;
    }>('SELECT * FROM users WHERE id = $1', [id]);

    if (userResult.rows.length === 0) return null;

    const row = userResult.rows[0];
    const publicKey = await this.getPublicKey(id);

    if (!publicKey) return null;

    return {
      id: row.id,
      publicKey,
      createdAt: row.created_at,
      lastLogin: row.last_login || undefined,
    };
  }

  async findByPublicKey(publicKey: string): Promise<User | null> {
    const result = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM public_keys WHERE public_key = $1',
      [publicKey]
    );

    if (result.rows.length === 0) return null;
    return this.findById(result.rows[0].user_id);
  }

  async create(publicKey: string, metadata?: UserMetadata): Promise<User> {
    const userId = generateId('user');
    const keyId = generateId('key');
    const now = Date.now();

    await this.db.query(
      'INSERT INTO users (id, created_at, last_login) VALUES ($1, $2, $2)',
      [userId, now]
    );

    await this.db.query(
      `INSERT INTO public_keys (id, user_id, public_key, device_name, added_at, last_used)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [keyId, userId, publicKey, metadata?.deviceName || null, now]
    );

    const keyInfo: PublicKeyInfo = {
      id: keyId,
      publicKey,
      deviceName: metadata?.deviceName,
      addedAt: now,
      lastUsed: now,
    };

    return {
      id: userId,
      publicKey: keyInfo,
      createdAt: now,
      lastLogin: now,
    };
  }

  async updateLastLogin(userId: string, publicKey: string): Promise<void> {
    const now = Date.now();

    await this.db.query(
      'UPDATE users SET last_login = $1 WHERE id = $2',
      [now, userId]
    );

    await this.db.query(
      'UPDATE public_keys SET last_used = $1 WHERE user_id = $2 AND public_key = $3',
      [now, userId, publicKey]
    );
  }

  async publicKeyExists(publicKey: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM public_keys WHERE public_key = $1',
      [publicKey]
    );
    return result.rows.length > 0;
  }

  async replacePublicKey(userId: string, newPublicKey: string, metadata?: KeyMetadata): Promise<PublicKeyInfo | null> {
    const userExists = await this.db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userExists.rows.length === 0) return null;

    // Delete existing key
    await this.db.query('DELETE FROM public_keys WHERE user_id = $1', [userId]);

    // Add new key
    const keyId = generateId('key');
    const now = Date.now();

    await this.db.query(
      `INSERT INTO public_keys (id, user_id, public_key, device_name, added_at, last_used)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [keyId, userId, newPublicKey, metadata?.deviceName || null, now]
    );

    return {
      id: keyId,
      publicKey: newPublicKey,
      deviceName: metadata?.deviceName,
      addedAt: now,
      lastUsed: now,
    };
  }

  private async getPublicKey(userId: string): Promise<PublicKeyInfo | null> {
    const result = await this.db.query<{
      id: string;
      public_key: string;
      device_name: string | null;
      added_at: number;
      last_used: number;
    }>(
      'SELECT * FROM public_keys WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      publicKey: row.public_key,
      deviceName: row.device_name || undefined,
      addedAt: row.added_at,
      lastUsed: row.last_used,
    };
  }
}

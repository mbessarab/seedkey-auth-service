/**
 * Backend Configuration Types
 * Extended configuration with backend-specific settings
 */

import type { SeedKeyConfig, ResolvedConfig as CoreResolvedConfig } from '@seedkey/sdk-server';

/**
 * Backend configuration (extends core config)
 */
export interface BackendConfig extends SeedKeyConfig {
  /** JWT secret for signing tokens */
  jwtSecret: string;

  /** Access token TTL in seconds (default: 3600 = 1 hour) */
  accessTokenTTL?: number;

  /** Refresh token TTL in seconds (default: 2592000 = 30 days) */
  refreshTokenTTL?: number;

  /** Session TTL in seconds (default: 2592000 = 30 days) */
  sessionTTL?: number;
}

/**
 * Default backend configuration values
 */
export const DEFAULT_BACKEND_CONFIG = {
  accessTokenTTL: 3600, // 1 hour
  refreshTokenTTL: 30 * 24 * 60 * 60, // 30 days
  sessionTTL: 30 * 24 * 60 * 60, // 30 days
} as const;

/**
 * Resolved backend configuration
 */
export interface ResolvedBackendConfig extends CoreResolvedConfig {
  jwtSecret: string;
  accessTokenTTL: number;
  refreshTokenTTL: number;
  sessionTTL: number;
}

/**
 * Resolve backend configuration with defaults
 */
export function resolveBackendConfig(config: BackendConfig): ResolvedBackendConfig {
  return {
    jwtSecret: config.jwtSecret,
    allowedDomains: config.allowedDomains,
    challengeTTL: config.challengeTTL ?? 5 * 60 * 1000, // 5 minutes
    currentDomain: config.currentDomain ?? config.allowedDomains[0],
    accessTokenTTL: config.accessTokenTTL ?? DEFAULT_BACKEND_CONFIG.accessTokenTTL,
    refreshTokenTTL: config.refreshTokenTTL ?? DEFAULT_BACKEND_CONFIG.refreshTokenTTL,
    sessionTTL: config.sessionTTL ?? DEFAULT_BACKEND_CONFIG.sessionTTL,
  };
}

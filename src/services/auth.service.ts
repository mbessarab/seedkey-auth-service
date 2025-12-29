/**
 * Authentication Service
 * Backend wrapper for SDK's AuthService
 * Provides backend-specific configuration handling
 */

import {
  AuthService as CoreAuthService,
  type AuthServiceDeps as CoreAuthServiceDeps,
  type RegisterResult,
  type VerifyResult,
  type ChallengeRequest,
  type ChallengeResult,
  type RegisterRequest,
  type VerifyRequest,
  type TokenPair,
  type User,
  type UserStore,
  type ChallengeStore,
  type SessionStore,
} from '@seedkey/sdk-server';
import type { ResolvedBackendConfig } from '../types/index.js';

/**
 * Token generator function type
 */
export type TokenGenerator = (
  userId: string,
  publicKeyId: string,
  sessionId: string
) => Promise<TokenPair>;

/**
 * Dependencies for AuthService
 */
export interface AuthServiceDeps {
  config: ResolvedBackendConfig;
  users: UserStore;
  challenges: ChallengeStore;
  sessions: SessionStore;
  generateTokens: TokenGenerator;
}

export type { RegisterResult, VerifyResult };

/**
 * Backend Authentication Service
 * Thin wrapper over SDK's AuthService with backend config adaptation
 */
export class AuthService extends CoreAuthService {
  constructor(deps: AuthServiceDeps) {
    // Adapt backend config to core config
    const coreDeps: CoreAuthServiceDeps = {
      config: {
        allowedDomains: deps.config.allowedDomains,
        challengeTTL: deps.config.challengeTTL,
        currentDomain: deps.config.currentDomain,
      },
      users: deps.users,
      challenges: deps.challenges,
      sessions: deps.sessions,
      generateTokens: deps.generateTokens,
    };
    
    super(coreDeps);
  }
}

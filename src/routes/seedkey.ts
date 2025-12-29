/**
 * Fastify Routes for SeedKey Auth
 * Core protocol routes only
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ERROR_CODES,
  SeedKeyError,
  type ChallengeRequest,
  type RegisterRequest,
  type VerifyRequest,
  type RefreshRequest,
  type TokenPayload,
} from '@seedkey/sdk-server';
import type { SeedKeyStores } from '../storage/index.js';
import type { AuthService } from '../services/index.js';

export interface SeedKeyServices {
  auth: AuthService;
  stores: SeedKeyStores;
}

declare module 'fastify' {
  interface FastifyInstance {
    seedkey: SeedKeyServices;
  }
}

/**
 * middleware
 */
export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    
    const payload = request.user as TokenPayload;
    
    // Check token type
    if (payload.type !== 'access') {
      return reply.status(401).send({
        error: ERROR_CODES.INVALID_TOKEN,
        message: 'Invalid token type',
      });
    }

    // Check session validity
    const isValid = await request.server.seedkey.stores.sessions.isValid(payload.sessionId);
    
    if (!isValid) {
      return reply.status(401).send({
        error: ERROR_CODES.INVALID_TOKEN,
        message: 'Session is invalid or expired',
      });
    }
  } catch {
    return reply.status(401).send({
      error: ERROR_CODES.UNAUTHORIZED,
      message: 'Authentication required',
    });
  }
}

/**
 * Error handler helper
 */
function handleError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof SeedKeyError) {
    return reply.status(error.statusCode).send(error.toJSON());
  }
  console.error('Unexpected error:', error);
  return reply.status(500).send({
    error: ERROR_CODES.INTERNAL_ERROR,
    message: 'An internal error occurred',
  });
}

/**
 * Register all routes
 */
export async function seedkeyRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /challenge
  fastify.post<{ Body: ChallengeRequest }>('/challenge', async (request, reply) => {
    const result = await fastify.seedkey.auth.createChallenge(request.body);

    if (!result.success) {
      const statusCode = result.error === 'USER_NOT_FOUND' ? 404 : result.error === 'USER_EXISTS' ? 409 : 400;
      return reply.status(statusCode).send({
        error: result.error,
        message: result.error,
        hint: result.hint,
      });
    }

    return reply.status(200).send({
      challenge: result.challenge,
      challengeId: result.challengeId,
    });
  });

  // POST /register
  fastify.post<{ Body: RegisterRequest }>('/register', async (request, reply) => {
    try {
      const result = await fastify.seedkey.auth.register(request.body);

      return reply.status(201).send({
        success: true,
        action: 'register',
        user: {
          id: result.user.id,
          publicKey: result.keyInfo.publicKey,
          createdAt: result.user.createdAt, 
        },
        token: result.tokens,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // POST /verify
  fastify.post<{ Body: VerifyRequest }>('/verify', async (request, reply) => {
    try {
      const result = await fastify.seedkey.auth.verify(request.body);

      return reply.status(200).send({
        success: true,
        action: 'login',
        user: {
          id: result.user.id,
          publicKey: result.keyInfo.publicKey,
          createdAt: result.user.createdAt, // milliseconds
          lastLogin: result.user.lastLogin ?? Date.now(), // milliseconds
        },
        token: result.tokens,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // POST /logout
  fastify.post('/logout', {
    preHandler: [authenticateRequest],
  }, async (request, reply) => {
    const payload = request.user as TokenPayload;
    await fastify.seedkey.auth.logout(payload.sessionId);

    return reply.status(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  // POST /refresh
  fastify.post<{ Body: RefreshRequest }>('/refresh', async (request, reply) => {
    const { refreshToken } = request.body;

    if (!refreshToken) {
      return reply.status(400).send({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: 'refreshToken is required',
      });
    }

    try {
      const payload = fastify.jwt.verify<TokenPayload>(refreshToken);

      if (payload.type !== 'refresh') {
        return reply.status(401).send({
          error: ERROR_CODES.INVALID_TOKEN,
          message: 'Invalid token type',
        });
      }

      const isValid = await fastify.seedkey.stores.sessions.isValid(payload.sessionId);
      if (!isValid) {
        return reply.status(401).send({
          error: ERROR_CODES.INVALID_TOKEN,
          message: 'Session is invalid or expired',
        });
      }

      const user = await fastify.seedkey.stores.users.findById(payload.sub);
      if (!user) {
        return reply.status(404).send({
          error: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        });
      }

      // Generate new tokens
      const accessToken = fastify.jwt.sign(
        { sub: payload.sub, type: 'access', publicKeyId: payload.publicKeyId, sessionId: payload.sessionId } as TokenPayload,
        { expiresIn: 3600 }
      );
      const newRefreshToken = fastify.jwt.sign(
        { sub: payload.sub, type: 'refresh', publicKeyId: payload.publicKeyId, sessionId: payload.sessionId } as TokenPayload,
        { expiresIn: 30 * 24 * 60 * 60 }
      );

      return reply.status(200).send({
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600,
      });
    } catch {
      return reply.status(401).send({
        error: ERROR_CODES.INVALID_TOKEN,
        message: 'Invalid or expired refresh token',
      });
    }
  });

  // GET /user
  fastify.get('/user', {
    preHandler: [authenticateRequest],
  }, async (request, reply) => {
    const payload = request.user as TokenPayload;

    try {
      const user = await fastify.seedkey.auth.getUser(payload.sub);
      if (!user) {
        return reply.status(404).send({
          error: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        });
      }

      const publicKey = user.publicKey;

      return reply.status(200).send({
        user: {
          id: user.id,
          publicKey: publicKey ? {
            id: publicKey.id,
            publicKey: publicKey.publicKey,
            deviceName: publicKey.deviceName,
            addedAt: publicKey.addedAt, 
            lastUsed: publicKey.lastUsed,
          } : null,
          createdAt: user.createdAt, 
          lastLogin: user.lastLogin, 
        },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}

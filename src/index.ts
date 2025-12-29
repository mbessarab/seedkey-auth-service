/**
 * SeedKey Auth Backend
 * Self-hosted implementation with Kubernetes/Helm support
 * Core protocol only - no OAuth (OAuth should be in business layer)
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import type { TokenPayload, TokenPair } from '@seedkey/sdk-server';
import { resolveBackendConfig } from './types/config.js';
import { createPostgresStores, createDatabaseFromEnv, type Database } from './storage/index.js';
import type { SeedKeyStores } from './storage/index.js';
import { AuthService } from './services/index.js';
import { seedkeyRoutes, type SeedKeyServices } from './routes/seedkey.js';

// ============================================================================
// Application State (for graceful shutdown and health checks)
// ============================================================================

interface AppState {
  isReady: boolean;
  isShuttingDown: boolean;
  startTime: Date;
  version: string;
}

const appState: AppState = {
  isReady: false,
  isShuttingDown: false,
  startTime: new Date(),
  version: process.env.APP_VERSION || '0.0.2',
};

// Metrics counters (simple implementation)
const metrics = {
  requestsTotal: 0,
  requestsActive: 0,
  requestsDuration: [] as number[],
  errorsTotal: 0,
};

// ============================================================================
// Configuration
// ============================================================================

const isProduction = process.env.NODE_ENV === 'production';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && isProduction) {
  console.error('FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}

const allowedDomains = (process.env.ALLOWED_DOMAINS || process.env.DOMAIN || 'localhost')
  .split(',')
  .map(d => d.trim())
  .filter(Boolean);

const config = resolveBackendConfig({
  jwtSecret: jwtSecret || 'dev-secret-key-not-for-production',
  allowedDomains,
  accessTokenTTL: parseInt(process.env.ACCESS_TOKEN_TTL || '3600', 10),
  refreshTokenTTL: parseInt(process.env.REFRESH_TOKEN_TTL || '2592000', 10),
  sessionTTL: parseInt(process.env.SESSION_TTL || '2592000', 10),
});

// Augment Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    seedkey: SeedKeyServices;
  }
}

// ============================================================================
// Create Fastify Instance
// ============================================================================

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    ...(isProduction
      ? {
          // JSON logging for prod
          formatters: {
            level: (label: string) => ({ level: label }),
            bindings: () => ({
              service: 'seedkey-backend',
              version: appState.version,
            }),
          },
        }
      : {
          // Pretty logging for dev
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }),
  },
  // Request timeout
  connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '30000', 10),
  // Body size limit
  bodyLimit: parseInt(process.env.BODY_LIMIT || '1048576', 10), // 1MB default
});

// ============================================================================
// Plugins
// ============================================================================

// Allow empty body when Content-Type is application/json.
// Some clients send Content-Type by default even for requests without a body (e.g. POST /logout),
// and Fastify's default JSON parser throws FST_ERR_CTP_EMPTY_JSON_BODY.
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (request, body, done) => {
    if (body === '' || body === undefined || body === null) {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean);
await fastify.register(cors, {
  origin: corsOrigins || true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400,
});

// JWT configuration
await fastify.register(jwt, {
  secret: config.jwtSecret,
  sign: {
    algorithm: 'HS256',
  },
});

// ============================================================================
// Request Tracking Hooks
// ============================================================================

fastify.addHook('onRequest', async (request) => {
  metrics.requestsTotal++;
  metrics.requestsActive++;
  // Add request start time for duration tracking
  (request as any).startTime = Date.now();
});

fastify.addHook('onResponse', async (request, reply) => {
  metrics.requestsActive--;
  const duration = Date.now() - ((request as any).startTime || Date.now());
  metrics.requestsDuration.push(duration);
  // Keep only last 1000 measurements
  if (metrics.requestsDuration.length > 1000) {
    metrics.requestsDuration.shift();
  }
});

// ============================================================================
// Storage and Services
// ============================================================================

let db: Database | null = null;
let stores: SeedKeyStores;

fastify.log.info('Initializing PostgreSQL storage...');
db = createDatabaseFromEnv();
await db.initialize();
stores = createPostgresStores(db);
fastify.log.info('PostgreSQL storage initialized');

const generateTokens = async (
  userId: string,
  publicKeyId: string,
  sessionId: string
): Promise<TokenPair> => {
  const accessToken = fastify.jwt.sign(
    {
      sub: userId,
      type: 'access',
      publicKeyId,
      sessionId,
    } as TokenPayload,
    { expiresIn: config.accessTokenTTL }
  );

  const refreshToken = fastify.jwt.sign(
    {
      sub: userId,
      type: 'refresh',
      publicKeyId,
      sessionId,
    } as TokenPayload,
    { expiresIn: config.refreshTokenTTL }
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: config.accessTokenTTL,
  };
};

const authService = new AuthService({
  config,
  users: stores.users,
  challenges: stores.challenges,
  sessions: stores.sessions,
  generateTokens,
});

fastify.decorate('seedkey', {
  auth: authService,
  stores,
});

// ============================================================================
// Health Check Routes (Kubernetes probes)
// ============================================================================

// Root endpoint - basic info
fastify.get('/', async () => ({
  name: 'SeedKey Auth Backend',
  version: appState.version,
  status: appState.isShuttingDown ? 'shutting_down' : 'running',
}));

// Liveness probe 
fastify.get('/health/live', async (request, reply) => {
  if (appState.isShuttingDown) {
    return reply.status(503).send({
      status: 'shutting_down',
      timestamp: new Date().toISOString(),
    });
  }
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
});

// Readiness probe 
fastify.get('/health/ready', async (request, reply) => {
  if (!appState.isReady || appState.isShuttingDown) {
    return reply.status(503).send({
      status: 'not_ready',
      ready: appState.isReady,
      shuttingDown: appState.isShuttingDown,
      timestamp: new Date().toISOString(),
    });
  }
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - appState.startTime.getTime()) / 1000),
  };
});

// Startup probe 
fastify.get('/health/startup', async (request, reply) => {
  if (!appState.isReady) {
    return reply.status(503).send({
      status: 'starting',
      timestamp: new Date().toISOString(),
    });
  }
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
});

// ============================================================================
// Metrics Endpoint 
// ============================================================================

fastify.get('/metrics', async (request, reply) => {
  const avgDuration = metrics.requestsDuration.length > 0
    ? Math.round(metrics.requestsDuration.reduce((a, b) => a + b, 0) / metrics.requestsDuration.length)
    : 0;

  const uptime = Math.floor((Date.now() - appState.startTime.getTime()) / 1000);

  // Prometheus text format
  const metricsOutput = `# HELP seedkey_requests_total Total number of HTTP requests
# TYPE seedkey_requests_total counter
seedkey_requests_total ${metrics.requestsTotal}

# HELP seedkey_requests_active Current number of active requests
# TYPE seedkey_requests_active gauge
seedkey_requests_active ${metrics.requestsActive}

# HELP seedkey_request_duration_avg_ms Average request duration in milliseconds
# TYPE seedkey_request_duration_avg_ms gauge
seedkey_request_duration_avg_ms ${avgDuration}

# HELP seedkey_errors_total Total number of errors
# TYPE seedkey_errors_total counter
seedkey_errors_total ${metrics.errorsTotal}

# HELP seedkey_uptime_seconds Server uptime in seconds
# TYPE seedkey_uptime_seconds gauge
seedkey_uptime_seconds ${uptime}

# HELP seedkey_info Application information
# TYPE seedkey_info gauge
seedkey_info{version="${appState.version}"} 1
`;

  reply.header('Content-Type', 'text/plain; version=0.0.4');
  return metricsOutput;
});

// ============================================================================
// API Routes
// ============================================================================

await fastify.register(seedkeyRoutes, { prefix: '/api/v1/seedkey/' });

// ============================================================================
// Error Handler
// ============================================================================

fastify.setErrorHandler((error: Error & { code?: string; validation?: unknown }, request, reply) => {
  metrics.errorsTotal++;
  fastify.log.error({ err: error, requestId: request.id }, 'Request error');

  // JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authorization header is required',
    });
  }

  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    return reply.status(401).send({
      error: 'TOKEN_EXPIRED',
      message: 'Token has expired',
    });
  }

  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    return reply.status(401).send({
      error: 'INVALID_TOKEN',
      message: 'Invalid token',
    });
  }

  // Validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  return reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: isProduction ? 'An internal error occurred' : error.message,
  });
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT || '30000', 10);

async function gracefulShutdown(signal: string): Promise<void> {
  if (appState.isShuttingDown) {
    fastify.log.warn('Shutdown already in progress');
    return;
  }

  fastify.log.info({ signal }, 'Received shutdown signal, starting graceful shutdown');
  appState.isShuttingDown = true;

  // Give load balancer time to stop sending new requests
  const drainDelay = parseInt(process.env.SHUTDOWN_DRAIN_DELAY || '5000', 10);
  fastify.log.info(`Waiting ${drainDelay}ms for connections to drain`);
  await new Promise(resolve => setTimeout(resolve, drainDelay));

  // Set a timeout for forced shutdown
  const forceShutdownTimer = setTimeout(() => {
    fastify.log.error('Forced shutdown due to timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    // Close the server (stop accepting new connections)
    await fastify.close();
    fastify.log.info('Server closed successfully');

    // Close database connection if using PostgreSQL
    if (db) {
      await db.close();
      fastify.log.info('Database connection closed');
    }

    // Clear the timeout
    clearTimeout(forceShutdownTimer);

    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, 'Error during shutdown');
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  fastify.log.fatal({ err }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  fastify.log.fatal({ reason }, 'Unhandled rejection');
  gracefulShutdown('unhandledRejection');
});

// ============================================================================
// Server Start
// ============================================================================

const start = async (): Promise<void> => {
  try {
    const host = process.env.HOST || '0.0.0.0';
    const port = Number(process.env.PORT) || 3000;

    await fastify.listen({ host, port });

    // Mark as ready after successful startup
    appState.isReady = true;

    if (!isProduction) {
      console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   🔐 SeedKey Auth Backend v${appState.version.padEnd(43)}║
║                                                                   ║
║   Server: http://${host}:${port}                                    ║
║   Mode:   ${(isProduction ? 'production' : 'development').padEnd(54)}║
║                                                                   ║
║   Health Endpoints:                                               ║
║   • GET  /health/live     - Liveness probe                        ║
║   • GET  /health/ready    - Readiness probe                       ║
║   • GET  /health/startup  - Startup probe                         ║
║   • GET  /metrics         - Prometheus metrics                    ║
║                                                                   ║
║   Auth Endpoints (single key per user):                           ║
║   • POST /api/v1/seedkey/challenge    - Create auth challenge     ║
║   • POST /api/v1/seedkey/register     - Register new user         ║
║   • POST /api/v1/seedkey/verify       - Verify signature & login  ║
║   • POST /api/v1/seedkey/logout       - Invalidate session        ║
║   • POST /api/v1/seedkey/refresh      - Refresh access token      ║
║   • GET  /api/v1/seedkey/user         - Get current user info     ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
      `);
    } else {
      fastify.log.info({
        host,
        port,
        version: appState.version,
      }, 'Server started');
    }
  } catch (err) {
    fastify.log.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
};

start();

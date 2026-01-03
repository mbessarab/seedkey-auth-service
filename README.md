## SeedKey Auth Service

SeedKey Auth Service is a **self-hosted** passwordless authentication service that is part of the Open Source **SeedKey** ecosystem.


### Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Routes](#routes)
- [Contributing](#contributing)
- [Related Projects](#related-projects)
- [Security Disclosure](#security)
- [License](#license)

<a name="features"></a>
## 🧩 Features

The service implements the core of the SeedKey protocol, which is based on the `@seedkey/sdk-server` library.

This allows you to focus on business logic and not worry about creating a challenge, encryption, signature verification, working with JWT tokens, etc. Finally, use the service’s ready-made endpoints for that!

Of course, if necessary you can implement authorization, account recovery, and other user-related mechanisms yourself.

<a name="quick-start"></a>
## 🚀 Quick Start

1. Prepare PostgreSQL.
   - Check the `seedkey-db-migrations` repository — it contains instructions for running migrations in a Docker container.

2. Configure environment variables:

| Variable | Description | Example |
|:--|:--|:--|
| `NODE_ENV` | Run mode. | `production` |
| `JWT_SECRET` | Secret for signing JWT. **Required in production**, otherwise the service will exit with an error. | `super-long-random-secret` |
| `ALLOWED_DOMAINS` | List of protocol domains for challenge validation. | `localhost,example.com` |
| `DOMAIN` | Protocol fallback domain if `ALLOWED_DOMAINS` is not set. | `example.com` |
| `POSTGRES_HOST` | PostgreSQL host. | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port. Default is `5432`. | `5432` |
| `POSTGRES_DB` | Database name in PostgreSQL. Default is `seedkey`. | `seedkey` |
| `POSTGRES_USER` | PostgreSQL user. Default is `postgres`. | `postgres` |
| `POSTGRES_PASSWORD` | PostgreSQL password. | `password` |
| `POSTGRES_SSL` | Use SSL for connecting to PostgreSQL (`true`/`false`). | `false` |
| `POSTGRES_MAX_CONNECTIONS` | Max connections in the pool. Default is `20`. | `20` |
| `HOST` | Host the HTTP server listens on. Default is `0.0.0.0`. | `0.0.0.0` |
| `PORT` | HTTP server port. Default is `3000`. | `3000` |
| `LOG_LEVEL` | Logging level. Default is `info`. | `debug` |
| `ACCESS_TOKEN_TTL` | Access token TTL in seconds. Default is `3600`. | `3600` |
| `REFRESH_TOKEN_TTL` | Refresh token TTL in seconds. Default is `2592000` (30 days). | `2592000` |
| `SESSION_TTL` | Session TTL in seconds. Default is `2592000` (30 days). | `2592000` |
| `CONNECTION_TIMEOUT` | Connection timeout (ms). Default is `30000`. | `30000` |

3. Use a ready-made image from GitHub Container Registry:
   - `ghcr.io/mbessarab/seedkey-auth-service:latest`
   - `ghcr.io/mbessarab/seedkey-auth-service:<tag>`

---

<a name="routes"></a>
## 🔌 Routes

All routes below have the prefix: `/api/v1/seedkey`.

### POST /api/v1/seedkey/challenge

Create a challenge.

- **Body**: `ChallengeRequest` → `{ publicKey: string, action: 'register' | 'authenticate' }`
- **200**: `{ challenge: string, challengeId: string }`
- **404**: `{ error: 'USER_NOT_FOUND', message, hint? }` (if `action='authenticate'` and the key is not registered yet)
- **409**: `{ error: 'USER_EXISTS', message, hint? }` (if `action='register'` and the key is already registered)

### POST /api/v1/seedkey/register

User registration.

- **Body**: `RegisterRequest` → `{ publicKey, challenge, signature, metadata? }`
- **201**:
  - `success: true`
  - `action: 'register'`
  - `user: { id, publicKey, createdAt }`
  - `token: { accessToken, refreshToken, expiresIn }`

### POST /api/v1/seedkey/verify

Signature verification and login.

- **Body**: `VerifyRequest` → `{ challengeId, publicKey, challenge, signature }`
- **200**:
  - `success: true`
  - `action: 'login'`
  - `user: { id, publicKey, createdAt, lastLogin }`
  - `token: { accessToken, refreshToken, expiresIn }`

### POST /api/v1/seedkey/logout

Invalidate the current session.

- **Header**: `Authorization: Bearer <accessToken>`
- **200**: `{ success: true, message: 'Logged out successfully' }`

### POST /api/v1/seedkey/refresh

Refresh the access token using a refresh token.

- **Body**: `{ refreshToken: string }`
- **200**: `{ accessToken, refreshToken, expiresIn }`
- **401**: `{ error: 'INVALID_TOKEN', message }` (if the token is invalid/expired/of the wrong type, or the session is invalid)

### GET /api/v1/seedkey/user

Get the current user.

- **Header**: `Authorization: Bearer <accessToken>`
- **200**: `{ user: { id, publicKey, createdAt, lastLogin }, publicKey: { id, publicKey, deviceName?, addedAt, lastUsed } }`
- **404**: `{ error: 'USER_NOT_FOUND', message }`

System **Kubernetes-friendly routes** are also available:

- `GET /health/live` (liveness)
- `GET /health/ready` (readiness)
- `GET /health/startup` (startup)
- `GET /metrics` (in development)

---

<a name="contributing"></a>
## 🤝 Contributing

If you have ideas and want to contribute to the project, I will be happy to see your issues or pull requests!

### Local run

```bash
npm ci
npm run dev
```

### Production build

```bash
npm ci
npm run build
npm run start:prod
```

### 🔧 Related Projects
Also check out other repositories in the ecosystem:
- `seedkey-sdk-client` — a library for working with the extension and sending requests to the backend.
- `seedkey-sdk-server` — a library for implementing the service yourself.
- `seedkey-db-migrations` — migrations for `seedkey-auth-service`.
- `seedkey-auth-service-helm-chart` — a Helm Chart for deploying `seedkey-auth-service` + `seedkey-db-migrations`.
- `seedkey-browser-extension` — a browser extension.

<a name="security"></a>
## 🛡️ Security Disclosure

Please, **do not publish** vulnerabilities in public issues. Report them privately via `maks@besssarab.ru` or create a private security advisory on GitHub.

<a name="license"></a>
## 📄 License

See `LICENSE`.

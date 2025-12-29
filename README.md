# SeedKey Auth Backend

> 🔐 **Production-ready Fastify бэкенд для беспарольной аутентификации**
>
> Self-hosted сервис с поддержкой Kubernetes, PostgreSQL и мониторинга

[![Docker](https://img.shields.io/badge/Docker-ready-blue)](https://hub.docker.com)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-ready-326CE5)](https://kubernetes.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📋 Содержание

- [Обзор](#обзор)
- [Быстрый старт](#быстрый-старт)
- [Архитектура](#архитектура)
- [API Reference](#api-reference)
- [Конфигурация](#конфигурация)
- [Хранилища данных](#хранилища-данных)
- [Аутентификация и сессии](#аутентификация-и-сессии)
- [Health Checks и Metrics](#health-checks-и-metrics)
- [Docker](#docker)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Безопасность](#безопасность)
- [Troubleshooting](#troubleshooting)

---

## Обзор

SeedKey Auth Backend — это production-ready сервис аутентификации, построенный на:

- **Fastify** — высокопроизводительный Node.js фреймворк
- **@seedkey/core** — криптографическое ядро протокола
- **PostgreSQL** — хранение пользователей, сессий, challenges
- **JWT** — access/refresh токены
- **Kubernetes** — готовые манифесты для деплоя

### Ключевые возможности

| Возможность | Описание |
|-------------|----------|
| 🔐 **Passwordless Auth** | Ed25519 криптографическая аутентификация |
| 📱 **Multi-device** | Поддержка нескольких устройств |
| 🐳 **Docker Ready** | Multi-stage Dockerfile для оптимального размера |
| ☸️ **Kubernetes Native** | HPA, PDB, ServiceMonitor, Ingress |
| 📊 **Observability** | Prometheus metrics, health probes |
| 🔄 **Graceful Shutdown** | Корректное завершение соединений |

---

## Быстрый старт

### Локальная разработка

```bash
# 1. Установка зависимостей
npm install

# 2. Запуск в dev-режиме (in-memory storage)
npm run dev

# Сервер доступен на http://localhost:3000
```

### С PostgreSQL (Docker Compose)

```bash
# 1. Запуск PostgreSQL + Backend
docker-compose up -d

# 2. Проверка
curl http://localhost:3000/health
```

### Переменные окружения

```bash
# Минимальная конфигурация
export JWT_SECRET="your-super-secret-key-min-32-chars"
export ALLOWED_DOMAINS="example.com,localhost"

# С PostgreSQL
export STORAGE_TYPE="postgres"
export DATABASE_URL="postgresql://user:pass@localhost:5432/seedkey"

npm start
```

---

## Архитектура

### Структура проекта

```
backend/
├── src/
│   ├── index.ts              # Точка входа, Fastify сервер
│   ├── routes/
│   │   └── seedkey.ts        # API роуты аутентификации
│   ├── services/
│   │   ├── auth.service.ts   # Сервис аутентификации
│   │   └── key.service.ts    # Сервис управления ключами
│   ├── storage/
│   │   ├── interfaces.ts     # Интерфейсы хранилищ
│   │   ├── users.ts          # In-memory хранилище пользователей
│   │   ├── challenges.ts     # In-memory хранилище challenges
│   │   ├── sessions.ts       # In-memory хранилище сессий
│   │   └── postgres/         # PostgreSQL реализация
│   │       ├── db.ts         # Подключение к БД
│   │       ├── users.ts      # PostgreSQL Users Store
│   │       ├── challenges.ts # PostgreSQL Challenges Store
│   │       └── sessions.ts   # PostgreSQL Sessions Store
│   └── types/
│       ├── config.ts         # Конфигурация бэкенда
│       └── user.ts           # Расширенный тип User
├── deploy/
│   └── base/                 # Kubernetes манифесты
│       ├── deployment.yaml
│       ├── service.yaml
│       ├── ingress.yaml
│       ├── hpa.yaml
│       ├── pdb.yaml
│       └── servicemonitor.yaml
├── docker-compose.yml
├── Dockerfile
└── package.json
```

### Схема взаимодействия

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SeedKey Backend                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                         Fastify Server                              │    │
│   │  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌───────────────┐   │    │
│   │  │  CORS    │  │  Logger   │  │    JWT     │  │  Error Handler │   │    │
│   │  │  Plugin  │  │  (Pino)   │  │  Plugin    │  │  Middleware    │   │    │
│   │  └──────────┘  └───────────┘  └────────────┘  └───────────────┘   │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                          API Routes                                 │    │
│   │  ┌──────────────────┐  ┌───────────────────┐  ┌────────────────┐  │    │
│   │  │ /api/v1/seedkey/ │  │ /health/*         │  │ /metrics       │  │    │
│   │  │   challenge      │  │   live            │  │ (Prometheus)   │  │    │
│   │  │   register       │  │   ready           │  │                │  │    │
│   │  │   verify         │  │   startup         │  │                │  │    │
│   │  │   logout         │  │                   │  │                │  │    │
│   │  │   refresh        │  │                   │  │                │  │    │
│   │  │   user           │  │                   │  │                │  │    │
│   │  │   add-key        │  │                   │  │                │  │    │
│   │  │   key/:keyId     │  │                   │  │                │  │    │
│   │  └──────────────────┘  └───────────────────┘  └────────────────┘  │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                           Services                                  │    │
│   │  ┌──────────────────────────┐  ┌───────────────────────────────┐  │    │
│   │  │       AuthService        │  │         KeyService            │  │    │
│   │  │  ┌────────────────────┐  │  │  ┌─────────────────────────┐  │  │    │
│   │  │  │ createChallenge()  │  │  │  │ addKey()                │  │  │    │
│   │  │  │ register()         │  │  │  │ removeKey()             │  │  │    │
│   │  │  │ verify()           │  │  │  │ getKeys()               │  │  │    │
│   │  │  │ logout()           │  │  │  └─────────────────────────┘  │  │    │
│   │  │  │ getUser()          │  │  │                               │  │    │
│   │  │  └────────────────────┘  │  │                               │  │    │
│   │  └──────────────────────────┘  └───────────────────────────────┘  │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                           Storage Layer                             │    │
│   │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │    │
│   │  │    UserStore     │  │  ChallengeStore  │  │   SessionStore   │  │    │
│   │  │  ─────────────   │  │  ─────────────   │  │  ─────────────   │  │    │
│   │  │  • Memory        │  │  • Memory        │  │  • Memory        │  │    │
│   │  │  • PostgreSQL    │  │  • PostgreSQL    │  │  • PostgreSQL    │  │    │
│   │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API Reference

### Базовый URL

```
http://localhost:3000/api/v1/seedkey/
```

### Эндпоинты

#### POST /challenge

Создаёт challenge для регистрации или аутентификации.

**Request:**
```json
{
  "publicKey": "base64-encoded-ed25519-public-key",
  "action": "register" | "authenticate"
}
```

**Response (200):**
```json
{
  "challenge": {
    "nonce": "kL3xD5R8qM2wN7hJ9vB4sT6yP1cF0gA3eZ8kL3xD5R8=",
    "timestamp": 1702500000000,
    "domain": "example.com",
    "action": "register",
    "expiresAt": 1702500300000
  },
  "challengeId": "ch_m1abc123xyz"
}
```

**Errors:**
| Code | Status | Описание |
|------|--------|----------|
| `USER_NOT_FOUND` | 404 | Пользователь не найден (для `authenticate`) |
| `USER_EXISTS` | 409 | Пользователь существует (для `register`) |

---

#### POST /register

Регистрирует нового пользователя.

**Request:**
```json
{
  "publicKey": "base64-encoded-ed25519-public-key",
  "challenge": { /* challenge object from /challenge */ },
  "signature": "base64-encoded-ed25519-signature",
  "metadata": {
    "deviceName": "Chrome on Windows"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "action": "register",
  "user": {
    "id": "user_m1abc123xyz",
    "publicKey": "base64...",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "token": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 3600
  }
}
```

**Errors:**
| Code | Status | Описание |
|------|--------|----------|
| `USER_EXISTS` | 409 | Пользователь уже существует |
| `INVALID_SIGNATURE` | 401 | Некорректная подпись |
| `CHALLENGE_EXPIRED` | 400 | Challenge истёк |
| `NONCE_REUSED` | 400 | Nonce уже использовался |

---

#### POST /verify

Аутентифицирует существующего пользователя.

**Request:**
```json
{
  "challengeId": "ch_m1abc123xyz",
  "challenge": { /* challenge object */ },
  "signature": "base64-encoded-signature",
  "publicKey": "base64-encoded-public-key"
}
```

**Response (200):**
```json
{
  "success": true,
  "action": "login",
  "user": {
    "id": "user_m1abc123xyz",
    "publicKey": "base64...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "lastLogin": "2024-01-02T12:00:00.000Z"
  },
  "token": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 3600
  }
}
```

---

#### POST /logout

🔒 **Требует авторизации**

Инвалидирует текущую сессию.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### POST /refresh

Обновляет токены доступа.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

---

#### GET /user

🔒 **Требует авторизации**

Возвращает информацию о текущем пользователе.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "user": {
    "id": "user_m1abc123xyz",
    "publicKeys": [
      {
        "id": "key_m1def456uvw",
        "publicKey": "base64...",
        "deviceName": "Chrome on Windows",
        "addedAt": "2024-01-01T00:00:00.000Z",
        "lastUsed": "2024-01-02T12:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### POST /add-key

🔒 **Требует авторизации**

Добавляет новый публичный ключ (устройство) к аккаунту.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "publicKey": "new-base64-encoded-public-key",
  "signature": "signature-of-new-key-by-current-key",
  "metadata": {
    "deviceName": "iPhone 15"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "keyId": "key_m1ghi789rst",
  "message": "New key added successfully"
}
```

---

#### DELETE /key/:keyId

🔒 **Требует авторизации**

Удаляет публичный ключ.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Key removed successfully"
}
```

**Errors:**
| Code | Status | Описание |
|------|--------|----------|
| `KEY_NOT_FOUND` | 404 | Ключ не найден |
| `CANNOT_DELETE_LAST_KEY` | 400 | Нельзя удалить последний ключ |

---

## Конфигурация

### Переменные окружения

| Переменная | Обязательна | Default | Описание |
|------------|-------------|---------|----------|
| `JWT_SECRET` | ✅ prod | `dev-secret-key-not-for-production` | Секрет для JWT подписи |
| `ALLOWED_DOMAINS` | Нет | `localhost` | Разрешённые домены (через запятую) |
| `PORT` | Нет | `3000` | Порт сервера |
| `HOST` | Нет | `0.0.0.0` | Хост для прослушивания |
| `NODE_ENV` | Нет | `development` | Режим работы |

### Хранилище

| Переменная | Обязательна | Default | Описание |
|------------|-------------|---------|----------|
| `STORAGE_TYPE` | Нет | `memory` | Тип хранилища: `memory` или `postgres` |
| `DATABASE_URL` | При postgres | - | PostgreSQL connection string |
| `DATABASE_HOST` | При postgres | `localhost` | Хост PostgreSQL |
| `DATABASE_PORT` | При postgres | `5432` | Порт PostgreSQL |
| `DATABASE_USER` | При postgres | `seedkey` | Пользователь PostgreSQL |
| `DATABASE_PASSWORD` | При postgres | - | Пароль PostgreSQL |
| `DATABASE_NAME` | При postgres | `seedkey` | Имя базы данных |
| `DATABASE_SSL` | При postgres | `false` | Использовать SSL |

### Токены

| Переменная | Обязательна | Default | Описание |
|------------|-------------|---------|----------|
| `ACCESS_TOKEN_TTL` | Нет | `3600` | Время жизни access token (сек) |
| `REFRESH_TOKEN_TTL` | Нет | `2592000` | Время жизни refresh token (сек, 30 дней) |
| `SESSION_TTL` | Нет | `2592000` | Время жизни сессии (сек) |

### Сеть

| Переменная | Обязательна | Default | Описание |
|------------|-------------|---------|----------|
| `CORS_ORIGINS` | Нет | `*` | Разрешённые CORS origins |
| `TRUST_PROXY` | Нет | `true` в prod | Доверять proxy headers |
| `CONNECTION_TIMEOUT` | Нет | `30000` | Таймаут соединения (мс) |
| `BODY_LIMIT` | Нет | `1048576` | Лимит тела запроса (байт) |

### Graceful Shutdown

| Переменная | Обязательна | Default | Описание |
|------------|-------------|---------|----------|
| `SHUTDOWN_TIMEOUT` | Нет | `30000` | Макс. время завершения (мс) |
| `SHUTDOWN_DRAIN_DELAY` | Нет | `5000` | Задержка перед shutdown (мс) |

---

## Хранилища данных

### In-Memory (по умолчанию)

Подходит для разработки и тестирования. Данные теряются при перезапуске.

```bash
# По умолчанию
export STORAGE_TYPE="memory"
npm start
```

### PostgreSQL

Для production. Автоматически создаёт таблицы при первом запуске.

```bash
export STORAGE_TYPE="postgres"
export DATABASE_URL="postgresql://user:password@localhost:5432/seedkey"
npm start
```

#### Схема базы данных

```sql
-- Пользователи
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Публичные ключи
CREATE TABLE public_keys (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  public_key VARCHAR(64) UNIQUE NOT NULL,  -- base64, 44 chars
  device_name VARCHAR(256),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenges
CREATE TABLE challenges (
  id VARCHAR(64) PRIMARY KEY,
  nonce VARCHAR(64) UNIQUE NOT NULL,
  timestamp BIGINT NOT NULL,
  domain VARCHAR(256) NOT NULL,
  action VARCHAR(32) NOT NULL,
  expires_at BIGINT NOT NULL,
  public_key VARCHAR(64),
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Сессии
CREATE TABLE sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  public_key_id VARCHAR(64) REFERENCES public_keys(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  invalidated BOOLEAN DEFAULT FALSE
);

-- Индексы
CREATE INDEX idx_public_keys_user_id ON public_keys(user_id);
CREATE INDEX idx_public_keys_public_key ON public_keys(public_key);
CREATE INDEX idx_challenges_nonce ON challenges(nonce);
CREATE INDEX idx_challenges_expires_at ON challenges(expires_at);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

---

## Аутентификация и сессии

### JWT Токены

Backend использует два типа JWT токенов:

| Тип | TTL | Использование |
|-----|-----|---------------|
| `access` | 1 час | Авторизация API запросов |
| `refresh` | 30 дней | Обновление access token |

**Структура payload:**

```typescript
interface TokenPayload {
  sub: string;       // User ID
  type: 'access' | 'refresh';
  publicKeyId: string;
  sessionId: string;
  iat: number;
  exp: number;
}
```

### Middleware аутентификации

Для защищённых эндпоинтов используется `authenticateRequest`:

```typescript
import { authenticateRequest } from './routes/seedkey.js';

fastify.get('/protected', {
  preHandler: [authenticateRequest],
}, async (request, reply) => {
  const user = request.user as TokenPayload;
  return { userId: user.sub };
});
```

**Проверки middleware:**
1. ✅ Authorization header присутствует
2. ✅ Токен валиден (не истёк, подпись верна)
3. ✅ Тип токена === 'access'
4. ✅ Сессия существует и не инвалидирована

---

## Health Checks и Metrics

### Health Endpoints

| Endpoint | Назначение | Kubernetes |
|----------|------------|------------|
| `GET /health/live` | Процесс жив | Liveness Probe |
| `GET /health/ready` | Готов к трафику | Readiness Probe |
| `GET /health/startup` | Запуск завершён | Startup Probe |
| `GET /health` | Общий статус | Legacy |

**Liveness Probe Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Readiness Probe Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

### Prometheus Metrics

```bash
GET /metrics
```

**Response (text/plain):**
```prometheus
# HELP seedkey_requests_total Total number of HTTP requests
# TYPE seedkey_requests_total counter
seedkey_requests_total 12345

# HELP seedkey_requests_active Current number of active requests
# TYPE seedkey_requests_active gauge
seedkey_requests_active 5

# HELP seedkey_request_duration_avg_ms Average request duration in milliseconds
# TYPE seedkey_request_duration_avg_ms gauge
seedkey_request_duration_avg_ms 42

# HELP seedkey_errors_total Total number of errors
# TYPE seedkey_errors_total counter
seedkey_errors_total 10

# HELP seedkey_uptime_seconds Server uptime in seconds
# TYPE seedkey_uptime_seconds gauge
seedkey_uptime_seconds 3600

# HELP seedkey_info Application information
# TYPE seedkey_info gauge
seedkey_info{version="3.0.0"} 1
```

---

## Docker

### Dockerfile

Multi-stage сборка для минимального размера образа:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Команды

```bash
# Сборка образа
docker build -t seedkey-backend:latest .

# Запуск
docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET="your-secret" \
  -e ALLOWED_DOMAINS="example.com" \
  seedkey-backend:latest

# Запуск с PostgreSQL
docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET="your-secret" \
  -e STORAGE_TYPE="postgres" \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  seedkey-backend:latest
```

### Docker Compose

```yaml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET}
      STORAGE_TYPE: postgres
      DATABASE_URL: postgresql://seedkey:seedkey@postgres:5432/seedkey
      ALLOWED_DOMAINS: localhost,example.com
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health/ready"]
      interval: 10s
      timeout: 5s
      retries: 3

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: seedkey
      POSTGRES_PASSWORD: seedkey
      POSTGRES_DB: seedkey
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U seedkey"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

---

## Kubernetes Deployment

### Структура манифестов

```
deploy/base/
├── kustomization.yaml    # Kustomize конфигурация
├── deployment.yaml       # Deployment с probes
├── service.yaml          # ClusterIP сервис
├── ingress.yaml          # Ingress с TLS
├── configmap.yaml        # Конфигурация
├── secret.yaml           # Секреты (JWT_SECRET)
├── hpa.yaml              # Horizontal Pod Autoscaler
├── pdb.yaml              # Pod Disruption Budget
├── serviceaccount.yaml   # Service Account
└── servicemonitor.yaml   # Prometheus ServiceMonitor
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: seedkey-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: seedkey-backend
  template:
    metadata:
      labels:
        app: seedkey-backend
    spec:
      containers:
        - name: backend
          image: seedkey/backend:latest
          ports:
            - containerPort: 3000
          env:
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: seedkey-secrets
                  key: jwt-secret
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          startupProbe:
            httpGet:
              path: /health/startup
              port: 3000
            failureThreshold: 30
            periodSeconds: 2
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

### HPA (Horizontal Pod Autoscaler)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: seedkey-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: seedkey-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Деплой

```bash
# С Kustomize
kubectl apply -k deploy/base/

# Проверка
kubectl get pods -l app=seedkey-backend
kubectl logs -l app=seedkey-backend
```

---

## Безопасность

### Рекомендации для Production

| Аспект | Рекомендация |
|--------|--------------|
| **JWT_SECRET** | Минимум 32 символа, криптостойкий |
| **HTTPS** | Обязательно через Ingress/Load Balancer |
| **Network Policies** | Ограничить доступ к PostgreSQL |
| **Secrets** | Использовать Kubernetes Secrets или Vault |
| **Rate Limiting** | Настроить на Ingress уровне |
| **CORS** | Указать явный список разрешённых origins |

### Пример Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: seedkey-secrets
type: Opaque
data:
  # echo -n 'your-super-secret-jwt-key-min-32-chars' | base64
  jwt-secret: eW91ci1zdXBlci1zZWNyZXQtand0LWtleS1taW4tMzItY2hhcnM=
  # echo -n 'postgresql://user:pass@host:5432/db' | base64
  database-url: cG9zdGdyZXNxbDovL3VzZXI6cGFzc0Bob3N0OjU0MzIvZGI=
```

---

## Troubleshooting

### Проверка здоровья

```bash
# Liveness
curl http://localhost:3000/health/live

# Readiness
curl http://localhost:3000/health/ready

# Metrics
curl http://localhost:3000/metrics
```

### Логи

```bash
# Docker
docker logs seedkey-backend

# Kubernetes
kubectl logs -l app=seedkey-backend --tail=100 -f
```

### Частые проблемы

| Проблема | Решение |
|----------|---------|
| `JWT_SECRET is required` | Установите переменную JWT_SECRET |
| `Connection refused` (postgres) | Проверьте DATABASE_URL и доступность БД |
| `CORS error` | Добавьте origin в CORS_ORIGINS |
| `Token expired` | Проверьте ACCESS_TOKEN_TTL |

### Debug режим

```bash
export LOG_LEVEL="debug"
npm start
```

---

## Лицензия

MIT © SeedKey Auth

---

## Связанные проекты

- [`@seedkey/core`](../sdk) — Криптографическое ядро
- [`@seedkey/sdk`](../seedkey-sdk) — SDK для браузера
- [`nextjs-seedkey-auth`](../nextjs-seedkey-auth) — Демо на Next.js

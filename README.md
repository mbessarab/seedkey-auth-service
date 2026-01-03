## SeedKey Auth Service

SeedKey Auth Service — это **self-hosted** сервис passwordless-аутентификации, который является частью Open Source экосистемы **SeedKey**.


### Содержание

- [Возможности](#features)
- [Быстрый старт](#quick-start)
- [Описание роутов](#routes)
- [Контрибьютинг](#contributing)
- [Раскрытие уязвимостей](#security)
- [Лицензия](#license)

<a name="features"></a>
## 🧩 Возможности

Сервис реализует core протокола SeedKey, в основе которого лежит библиотека `@seedkey/sdk-server`. 

Это позволяет вам сконцентрироваться на бизнес-логике и не задумываться о создании challenge, шифровании, проверке подписи, работе с JWT-токенами и т.д. Наконец, используйте для этого готовые эндпоинты сервиса!

Конечно, при необходимости вы можете самостоятельно реализовать авторизацию, восстановление доступа и другие механизмы работы с пользователем.

<a name="quick-start"></a>
## 🚀 Быстрый старт

1. Подготовьте PostgreSQL.
   - Ознакомьтесь с репозиторием `seedkey-db-migrations` — там есть инструкция по запуску миграций в Docker-контейнере.

2. Настройте переменные окружения:

| Переменная | Описание | Пример |
|:--|:--|:--|
| `NODE_ENV` | Режим запуска. | `production` |
| `JWT_SECRET` | Секрет для подписи JWT. **Обязателен в production**, иначе сервис завершится с ошибкой. | `super-long-random-secret` |
| `ALLOWED_DOMAINS` | Список доменов протокола для валидации challenge. | `localhost,example.com` |
| `DOMAIN` | Fallback-домен протокола, если `ALLOWED_DOMAINS` не задан. | `example.com` |
| `POSTGRES_HOST` | Host PostgreSQL. | `localhost` |
| `POSTGRES_PORT` | Порт PostgreSQL. По умолчанию `5432`. | `5432` |
| `POSTGRES_DB` | Имя базы в PostgreSQL. По умолчанию `seedkey`. | `seedkey` |
| `POSTGRES_USER` | Пользователь PostgreSQL. По умолчанию `postgres`. | `postgres` |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL. | `password` |
| `POSTGRES_SSL` | Использовать SSL для подключения к PostgreSQL (`true`/`false`). | `false` |
| `POSTGRES_MAX_CONNECTIONS` | Максимум соединений в пуле. По умолчанию `20`. | `20` |
| `HOST` | Host, на котором слушает HTTP-сервер. По умолчанию `0.0.0.0`. | `0.0.0.0` |
| `PORT` | Порт HTTP-сервера. По умолчанию `3000`. | `3000` |
| `LOG_LEVEL` | Уровень логирования. По умолчанию `info`. | `debug` |
| `ACCESS_TOKEN_TTL` | TTL access token в секундах. По умолчанию `3600`. | `3600` |
| `REFRESH_TOKEN_TTL` | TTL refresh token в секундах. По умолчанию `2592000` (30 дней). | `2592000` |
| `SESSION_TTL` | TTL сессии в секундах. По умолчанию `2592000` (30 дней). | `2592000` |
| `CONNECTION_TIMEOUT` | Таймаут соединения (мс). По умолчанию `30000`. | `30000` |

3. Используйте готовый образ из GitHub Container Registry:
   - `ghcr.io/mbessarab/seedkey-auth-service:latest`
   - `ghcr.io/mbessarab/seedkey-auth-service:<tag>`

---

<a name="routes"></a>
## 🔌 Описание роутов

Все роуты ниже имеют префикс: `/api/v1/seedkey`.

### POST /api/v1/seedkey/challenge

Создать challenge.

- **Body**: `ChallengeRequest` → `{ publicKey: string, action: 'register' | 'authenticate' }`
- **200**: `{ challenge: string, challengeId: string }`
- **404**: `{ error: 'USER_NOT_FOUND', message, hint? }` (если `action='authenticate'` и ключ ещё не зарегистрирован)
- **409**: `{ error: 'USER_EXISTS', message, hint? }` (если `action='register'` и ключ уже зарегистрирован)

### POST /api/v1/seedkey/register

Регистрация пользователя.

- **Body**: `RegisterRequest` → `{ publicKey, challenge, signature, metadata? }`
- **201**:
  - `success: true`
  - `action: 'register'`
  - `user: { id, publicKey, createdAt }`
  - `token: { accessToken, refreshToken, expiresIn }`

### POST /api/v1/seedkey/verify

Проверка подписи и вход.

- **Body**: `VerifyRequest` → `{ challengeId, publicKey, challenge, signature }`
- **200**:
  - `success: true`
  - `action: 'login'`
  - `user: { id, publicKey, createdAt, lastLogin }`
  - `token: { accessToken, refreshToken, expiresIn }`

### POST /api/v1/seedkey/logout

Инвалидация текущей сессии.

- **Header**: `Authorization: Bearer <accessToken>`
- **200**: `{ success: true, message: 'Logged out successfully' }`

### POST /api/v1/seedkey/refresh

Обновить access token по refresh token.

- **Body**: `{ refreshToken: string }`
- **200**: `{ accessToken, refreshToken, expiresIn }`
- **401**: `{ error: 'INVALID_TOKEN', message }` (если токен невалиден/истёк/не того типа или сессия невалидна)

### GET /api/v1/seedkey/user

Получить текущего пользователя.

- **Header**: `Authorization: Bearer <accessToken>`
- **200**: `{ user: { id, publicKey, createdAt, lastLogin }, publicKey: { id, publicKey, deviceName?, addedAt, lastUsed } }`
- **404**: `{ error: 'USER_NOT_FOUND', message }`

Также доступны системные **Kubernetes-friendly роуты**:

- `GET /health/live` (liveness)
- `GET /health/ready` (readiness)
- `GET /health/startup` (startup)
- `GET /metrics` (в разработке)

---

<a name="contributing"></a>
## 🤝 Контрибьютинг

Если у вас есть идеи и желание сделать вклад в развитие проекта, я буду рад вашим issue или pull request!

### Запуск локально

```bash
npm ci
npm run dev
```

### Production-сборка

```bash
npm ci
npm run build
npm run start:prod
```

### Связные проекты
Ознакомьтесь так же с другими репозиториями экосистемы:
- `seedkey-sdk-client` — библиотека для работы с расширением и отправки запросов на бэкенд.
- `seedkey-sdk-server` — библиотека  для самостоятельной реализации сервиса.
- `seedkey-db-migrations` — миграции для seedkey-auth-service.
- `seedkey-auth-service-helm-chart` — Helm Chart для разворачивания seedkey-auth-service +  seedkey-db-migrations.
- `seedkey-browser-extension` — браузерное расширение.

<a name="security"></a>
## 🛡️ Раскрытие уязвимостей

Пожалуйста, **не публикуйте** уязвимости в публичных issue. Сообщайте приватно через контакт `maks@besssarab.ru` или заведите приватный security advisory в GitHub.

<a name="license"></a>
## 📄 Лицензия

См. `LICENSE`.

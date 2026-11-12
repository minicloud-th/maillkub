# Maillkub / Zeramaill

React + TypeScript + Tailwind + shadcn component structure, backed by a Node.js 24 HTTP server and SQLite. No demo users, seed orders, sample reviews, simulated offers, or simulated transfers.

## Start

```sh
npm ci
cp .env.example .env
# Edit .env: set APP_ORIGIN and your own ADMIN_USERNAME / ADMIN_PASSWORD.
npm run build
npm start
```

Open the exact APP_ORIGIN, normally http://localhost:3000 for local development. Registration and login work immediately. The first administrator is created only when both ADMIN_USERNAME and ADMIN_PASSWORD are set; the password must have at least 12 characters. After the first successful start, remove ADMIN_PASSWORD from the environment. Existing admins are never overwritten by startup settings.

## Actual workflow

1. Register a username, password, and password confirmation; log in across devices.
2. Submit Gmail addresses you own, account age, notes, and payout recipient details. Never submit Gmail passwords, OTPs, or recovery codes.
3. An administrator opens **บัญชีของฉัน → จัดการรายการทั้งหมด** and submits an offer or rejects the order.
4. The submitting member accepts the offer or cancels it.
5. The administrator makes the transfer in their bank, then records its bank reference. The UI says this is a staff-recorded transfer; it does not claim automatic bank verification.

Bank execution is **manual**. There is no bank/gateway API key in this repository, no automatic transfers, and no button that manufactures a transfer. Automatic payouts require a contracted payout provider and a separately implemented verified webhook integration.

## Security and persistence

Passwords use asynchronous scrypt with a random per-account salt. Opaque sessions are stored hashed in SQLite and sent in HttpOnly, SameSite cookies, with Secure enabled for HTTPS origins. Writes check the exact Origin and JSON content type; endpoints validate inputs, enforce ownership/admin roles, rate limit authentication, and use prepared SQL. State transitions and audit events are transactional. Payout details are AES-256-GCM encrypted at rest. Never expose this server directly on public HTTP.

SQLite and the encryption key live in DATA_DIR (`data/` by default). Persist and back up the entire directory, including the key and SQLite WAL, using a consistent database backup process. Losing the key loses access to payout details. Never commit .env, databases, keys, or personal data. This release is designed for one Node server with persistent disk; do not deploy it on GitHub Pages or ephemeral/serverless disks. Additional replicas require a database architecture change.

## Production / Docker

Set APP_ORIGIN to your exact HTTPS origin (no trailing slash), use NODE_ENV=production, and put an HTTPS reverse proxy in front of port 3000. Configure its request/body limits and client-IP rate limiting; the app deliberately does not trust client-supplied forwarded IP headers.

```sh
docker compose up -d --build
```

Compose binds the app to 127.0.0.1:3000 and persists data in a Docker volume. Configure the reverse proxy and DNS on your host. GitHub stores source code; pushing this repository does not itself provision a production server or bank connection.

```sh
npm test
npm run build
```

Tests exercise actual HTTP requests, signup/login, duplicate usernames, ownership isolation, CSRF rejection, role enforcement, order transitions, encrypted payout storage, session logout, and database persistence across server restarts. Test data exists only in a temporary database and is removed afterward.

UI: rounded fixed top bar, spring Dock, press feedback, modal blur, animated forms/sheets, dark theme, responsive layout, and reduced-motion support.

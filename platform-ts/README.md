# Platform TS (Fastify + TypeScript + Postgres + Redis + BullMQ + Prisma)

## Run

1) Create env:

```
copy .env.example .env
```

2) Start stack:

```
docker compose up --build
```

## Endpoints (via gateway)

- `GET http://localhost:8080/health`
- `POST http://localhost:8080/api/auth/login`
- `GET http://localhost:8080/api/employees?limit=20&page=1`
- `POST http://localhost:8080/api/attendance/biometric/logs`
- `GET http://localhost:8080/api/attendance/days?employee_id=<id>&from=2026-03-01&to=2026-03-31`
- `POST http://localhost:8080/api/payroll/recalculate`
- `POST http://localhost:8080/api/notifications/send`
- WebSocket: `ws://localhost:8080/ws/live?token=<jwt>`

## Notes

- Postgres tables are created via `sql/001_init.sql` (includes monthly partitions for `biometric_logs`).
- Prisma schema exists under `prisma/schema.prisma`. Each service runs `prisma generate` during docker build.

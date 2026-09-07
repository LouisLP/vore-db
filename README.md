# vore-db

A reference encyclopedia of world foods and drinks. One row = one canonical dish or
ingredient. See issue #1 for the shape of the effort.

- `frontend/` — Vue 3 + Vite + Pinia (scaffolded, untouched by the schema work)
- `backend/` — Drizzle schema and migrations (TypeScript, pnpm)
- `docker-compose.yml` — local Postgres

## Local database

Postgres **18.1** (`postgres:18.1-alpine`), published on host port **5433** so it does not
collide with a system Postgres on 5432. Data lives in the named volume `vore-db_vore-db-data`.

Credentials live in a single `.env` at the repo root, read by both Docker Compose and
drizzle-kit. It is gitignored; `.env.example` is the committed template.

```sh
cp .env.example .env      # first time only
docker compose up -d --wait   # start Postgres, wait for the healthcheck
docker compose ps             # status
docker compose logs -f postgres
docker compose down           # stop, keep data
docker compose down -v        # stop and delete the volume (destroys the database)
```

A psql shell inside the container:

```sh
docker compose exec postgres psql -U vore -d vore
```

## Migrations

Run from `backend/`. The schema is authored in `backend/src/db/schema.ts`; generated SQL
lands in `backend/drizzle/` and is committed.

```sh
cd backend
pnpm install
pnpm db:generate   # diff schema.ts against the migration history, write a new .sql
pnpm db:migrate    # apply pending migrations to the running container
pnpm db:check      # print server version + tables in `public` — confirms what landed
pnpm db:studio     # browse the database in Drizzle Studio
pnpm type-check
```

The generate → migrate → check loop was verified end to end against 18.1 with a throwaway
`smoke_test` table, including an insert/select round trip through Drizzle; the table and its
migration were then removed. `backend/src/db/schema.ts` is intentionally empty until the real
schema lands.

# DentalFlow staging database migrations

This workflow applies the repository's Prisma migrations to the **DentalFlow staging**
Supabase project only. It does not target production or the integration-test project.

## One-time setup

1. In Supabase, rotate the database password that was shared in chat.
2. Copy the PostgreSQL **direct connection** string, or the **session pooler** string
   on port `5432`. Do not use the transaction pooler on port `6543`.
3. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
4. Create a secret named `STAGING_DATABASE_URL` with the rotated staging connection string.
   Never commit the connection string or paste it into an issue or pull request.

The workflow validates that the connection identifies project ref
`zlloccntplmjtmqpntiy` and uses port `5432` before it can run Prisma migrations.
It refuses other projects and transaction-pooler URLs.

## Run

1. Open **Actions → Staging Prisma Migrations → Run workflow**.
2. Select `yes` for the confirmation input.
3. Review the run logs. The URL and password are never printed.
4. Confirm the final `prisma migrate status` reports no pending migrations.

The workflow is manual-only and serialized to prevent concurrent migration runs.

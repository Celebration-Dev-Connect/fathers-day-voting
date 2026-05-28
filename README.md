# Father's Day Car Show Voting

Production-slice implementation for the Celebration Church Father's Day Car Show admin tablet registration flow.

## Local Proxmox Dry Run

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Start Postgres:
   ```sh
   docker compose up -d postgres
   ```
3. Install dependencies:
   ```sh
   npm install
   ```
4. Generate Prisma client, migrate, and seed:
   ```sh
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```
5. Run API and web locally:
   ```sh
   npm run dev:api
   npm run dev:web
   ```

For a VM-style dry run, `docker compose up --build` starts Postgres, the Fastify API, and the built tablet admin app.

## Dev Login Accounts

The seed creates local-only dev accounts:

- `admin@carshow.local` - admin
- `registrar1@carshow.local` - registrar
- `registrar2@carshow.local` - registrar

Dev login is blocked when `NODE_ENV=production`.

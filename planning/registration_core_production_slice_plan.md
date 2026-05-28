# Registration-Core Production Slice Plan

## Summary

Build the first real production slice of the Father's Day Car Show admin tablet app around registration and QR assignment. This replaces the broader mock-admin plan with a narrower event-critical workflow that persists to PostgreSQL, can dry-run locally on a Proxmox Docker VM, and can later point at hosted Neon Postgres.

## Resolved Decisions

- Use React with Vite for the admin tablet frontend.
- Use Fastify as a separate API service.
- Use PostgreSQL with Prisma for schema, migrations, and queries.
- Use Neon Postgres for hosted production database.
- Dry-run locally on one Proxmox Linux VM using Docker Compose.
- Local dry run includes app, API, and local Postgres.
- Production auth uses Planning Center OAuth.
- Local testing uses a dev-only login with 3 seeded test staff accounts.
- First slice scope is registration core only:
  - staff login
  - categories
  - vehicle registration/search/edit
  - check-in
  - QR assignment
  - QR audit log
- QR assignment supports camera scanning plus manual fallback code entry.
- QR cards are created from a seeded batch.
- Data model includes an `events` table, but the UI uses only the seeded 2026 event.
- First roles are admin and registrar.

## Implementation Shape

- Create a small monorepo-style structure:
  - `apps/admin-web`: Vite React tablet app
  - `apps/api`: Fastify API
  - `packages/db`: Prisma schema, migrations, seed scripts
  - `docker-compose.yml`: local Proxmox dry-run stack
- Core tables:
  - `events`
  - `staff_users`
  - `categories`
  - `vehicle_entries`
  - `owners`
  - `qr_cards`
  - `qr_assignment_audit_logs`
- Dev seed data:
  - 2026 Father's Day Car Show event
  - default categories
  - QR card batch
  - 1 admin test user
  - 2 registrar test users
- API routes cover:
  - current staff session
  - list/create/update categories
  - list/search/create/update vehicle registrations
  - assign QR card
  - read QR card status
  - read audit history
- Admin UI uses the existing iPad prototypes and Velocity Strike design guide as visual source of truth.

## Deferred Decisions

- Planning Center OAuth credentials and registered redirect URLs.
  - Needed before production auth can be tested.
- Exact Neon project/database connection details.
  - Needed before production deployment.
- Proxmox VM hostname, SSL, and LAN URL.
  - Needed before local device testing on iPads.
- QR card print template format.
  - Needed after seeded QR inventory exists.
- Judges, photos, voting cutoff, results, overrides, and exports.
  - Deferred until registration core is working.

## Risks

- Planning Center OAuth may take longer than expected if app credentials or callback setup are not ready.
- Camera QR scanning on iPad needs real-device testing early.
- Docker-on-Proxmox is straightforward, but LAN HTTPS/camera permissions may require extra setup.
- Narrowing to registration core means the broader admin dashboard will initially show only registration-relevant data.

## Test Plan

- Run Prisma migrations against local Docker Postgres.
- Seed event, categories, staff users, and QR cards.
- Verify dev-only login works locally and is disabled outside local/dev mode.
- Test registrar can create, search, edit, and check in a vehicle.
- Test admin can manage categories.
- Test QR assignment by camera scan and manual code entry.
- Test already-assigned and invalid QR states.
- Confirm every QR assignment writes an audit log.
- Run typecheck, API tests, and frontend build.
- Test tablet layout on iPad-sized viewport and real iPad if available.

## Decision Tree

- Admin app
  - Production slice, not frontend-only mock
  - Registration core first
  - Broader admin modules later
- Stack
  - Vite React frontend
  - Fastify API
  - Prisma + PostgreSQL
  - Neon for hosted production
  - Docker Compose on Proxmox for local dry run
- Auth
  - Planning Center OAuth in production
  - Dev-only seeded users locally
  - Roles: admin and registrar
- QR
  - Seeded QR inventory
  - Camera scan plus manual fallback
  - Assignment audit log required

## Next Action

Scaffold the Vite/Fastify/Prisma/Docker structure, implement the registration-core flow, then verify with migrations, seed data, API checks, frontend build, and tablet layout review.

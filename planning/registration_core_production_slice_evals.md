# Registration-Core Production Slice Evals

## Summary

These evals validate whether the registration-core production slice is ready to implement and operate: Vite React admin app, Fastify API, Prisma/Postgres, local Proxmox Docker dry run, Neon-ready production path, Planning Center OAuth for production, and dev-only local auth.

## Architecture Evals

- Pass: Repo structure clearly separates frontend, API, and database code.
  - Expected: `apps/admin-web`, `apps/api`, `packages/db`, shared config, Docker Compose.
- Pass: The API is the only service that talks to Postgres.
  - Fail if React reads database credentials or connects directly to Postgres.
- Pass: Local and production database URLs are environment-driven.
  - Expected: local Docker Postgres and Neon can be swapped with env vars.
- Pass: Prisma migrations are the source of truth for schema.
  - Fail if schema is manually changed outside migrations.

## Local Proxmox Dry-Run Evals

- Pass: A fresh Proxmox Docker VM can run the app from documented commands.
  - Expected: clone repo, configure env, run Docker Compose, migrate, seed, open admin app.
- Pass: Docker Compose starts frontend, API, and Postgres.
- Pass: Seed script creates:
  - 2026 event
  - default categories
  - QR card batch
  - 1 admin user
  - 2 registrar users
- Pass: iPad/tablet on the same LAN can reach the admin app.
- Pass: Camera QR scanning is tested on a real iPad or tablet browser.
  - Fail if only desktop simulation is tested.

## Auth And Roles Evals

- Pass: Dev-only login works locally with seeded accounts.
- Pass: Dev-only login is disabled or blocked in production mode.
- Pass: Production auth path is Planning Center OAuth.
- Pass: Roles enforce permissions:
  - Admin can manage categories and QR seed/admin data.
  - Registrar can create/edit/check in registrations and assign QR cards.
  - Registrar cannot perform admin-only setup actions.

## Registration Workflow Evals

- Pass: Registrar can create a vehicle entry with required owner and vehicle fields.
- Pass: Registrar can search by owner, phone, email, vehicle, plate, entry number, and QR code.
- Pass: Registrar can edit a registration before and after check-in.
- Pass: Check-in state persists after refresh and across devices.
- Pass: Required fields block submission with clear tablet-friendly errors.
- Pass: UI remains usable at iPad/tablet dimensions with 48px touch targets.

## QR Assignment Evals

- Pass: QR card batch is seeded before assignment.
- Pass: Staff can assign QR by camera scan.
- Pass: Staff can assign QR by manual fallback code.
- Pass: System clearly distinguishes QR states:
  - unassigned
  - assigned
  - invalid
  - retired/reprinted, if included
- Pass: Already-assigned QR cannot be silently reassigned.
- Pass: Every QR assignment creates an audit log with staff user, timestamp, vehicle, QR card, and action.

## Data Integrity Evals

- Pass: A vehicle can have only one active QR assignment.
- Pass: A QR card can be actively assigned to only one vehicle.
- Pass: Category changes persist and are reflected in registration/search views.
- Pass: Event scoping exists in the database even though the UI only uses the 2026 event.
- Pass: Audit records are append-only from normal app flows.

## API Evals

- Pass: API routes exist for:
  - current session
  - categories
  - vehicle registration CRUD/search
  - QR card lookup
  - QR assignment
  - QR audit history
- Pass: API validates inputs server-side.
- Pass: API returns useful errors for invalid QR, assigned QR, missing fields, and unauthorized actions.
- Pass: API tests cover happy paths and failure paths for registration and QR assignment.

## Frontend Evals

- Pass: UI follows Velocity Strike design tokens:
  - Montserrat
  - red/black/white contrast
  - 8px spacing rhythm
  - 4-8px radii
  - tablet-friendly controls
- Pass: Existing iPad prototypes are reflected in layout and interaction style.
- Pass: Registration flow is optimized for fast event-day use.
- Pass: Manual QR fallback is visible and easy to reach.
- Pass: Loading, empty, error, and success states exist for registration and QR flows.

## Deployment Readiness Evals

- Pass: Production can point API at Neon using env config.
- Pass: No dev seed users or dev login path are available in production.
- Pass: Planning Center OAuth configuration is documented but not hard-coded.
- Pass: Build commands exist for frontend and API.
- Pass: Health check endpoint exists for the API.
- Pass: Basic deployment notes explain local Proxmox dry run versus hosted production.

## Acceptance Criteria

The plan passes when a clean local Proxmox Docker VM can run the registration-core app, staff can log in through dev-only accounts, create/search/edit/check in vehicles, assign QR cards by camera or manual code, and verify persisted data plus audit logs in Postgres.

Production readiness passes when the same API can be configured for Neon Postgres, dev auth is disabled, and Planning Center OAuth is the only production staff login path.

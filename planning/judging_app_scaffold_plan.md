# Judging App Scaffold Plan

## Goal

Build a focused judge-facing tablet/mobile web app that lets judges review eligible vehicles by category, create a top-10 ranked ballot, and submit rankings for admin tallying.

## App Shape

- New workspace app: `apps/judge-web`
- Public mount target: `/carshow/judge`
- Reuse shared design tokens, typography, components, and API patterns from `@carshow/carshow-components`
- Keep this separate from `apps/admin-web` so admin operations, registration, QR cards, and judging stay cleanly separated

## Initial Screens

- Judge login/dev session screen
- Judge dashboard with judging status and assigned categories
- Category ballot screen
  - Eligible checked-in vehicles
  - Current ranked top 10 panel
  - Save draft action
  - Submit action placeholder
- Submitted/closed states

## Backend Scaffold

Add judge-facing routes under `/judging`:

- `GET /judging/session`
  - Returns staff identity, event judging status, and category summaries.
- `GET /judging/categories`
  - Returns active categories with judge progress counts.
- `GET /judging/categories/:categoryId/vehicles`
  - Returns checked-in vehicles for the category.
- `GET /judging/categories/:categoryId/ballot`
  - Returns current saved picks for the current judge key.
- `PUT /judging/categories/:categoryId/ballot`
  - Saves a draft top-10 ordering using the existing `JudgeCategoryPick` table.
- `POST /judging/categories/:categoryId/submit`
  - Scaffolded as a placeholder until the ballot parent table exists.

## Deferred Data Model

Wait until the photo moderation branch lands before adding migrations. The likely production model is:

- `StaffRole.JUDGE`
- `JudgeCategoryAssignment`
- `JudgeBallot`
  - eventId
  - categoryId
  - staffUserId
  - status: `DRAFT | SUBMITTED`
  - submittedAt
- `JudgeBallotPick`
  - ballotId
  - vehicleEntryId
  - rank

The current scaffold can save draft picks to `JudgeCategoryPick` using `staffUser.id` as `judgeKey`, but true submitted/locked state needs the parent ballot table.

## Admin Integration Later

- Show judge completion per category
- Show which judges have submitted
- Allow admin to reopen a judge/category ballot
- Feed submitted ballots into the existing judge tally logic

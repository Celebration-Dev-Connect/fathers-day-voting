# Owner Access Email Campaigns with Amazon SES

## Summary

Add an admin-only owner email campaign workflow using Amazon SES. Campaigns
send one branded email per owner containing the generic owner-page link, their
last name, every registered vehicle, and each vehicle's five-digit access code.

Production sends real emails with full delivery tracking. Test uses mock
delivery and never contacts real owners.

## Implementation Changes

### Email Infrastructure

- Verify `celebrationedmonton.com` with SES Easy DKIM in `ca-central-1`.
- Request SES production access for transactional email.
- Send from `Father's Day Car Show <no-reply@celebrationedmonton.com>`.
- Set `Reply-To: info@celebrationedmonton.com`.
- Create an SES configuration set publishing delivery, bounce, complaint, and
  rejection events through SNS to SQS with a dead-letter queue.
- Grant the ECS task role least-privilege `ses:SendEmail` and SQS consume
  permissions.
- Configure `EMAIL_DRIVER=ses` in production and `EMAIL_DRIVER=mock` in test.

### Durable Campaign Processing

- Add email campaign and recipient records that snapshot owner name,
  destination email, vehicle details, and access codes at campaign creation.
- Recipient statuses: `QUEUED`, `SENDING`, `SENT`, `DELIVERED`, `BOUNCED`,
  `COMPLAINED`, `FAILED`, and `SKIPPED`.
- Campaign statuses: `PENDING`, `PROCESSING`, `COMPLETED`,
  `COMPLETED_WITH_ERRORS`, and `FAILED`.
- Add an email worker following the existing durable CSV-import worker pattern.
- Process recipients gradually, recover stale jobs after restarts, and support
  retrying failed recipients.
- Consume SES delivery events from SQS and match them using the stored SES
  message ID.
- Suppress addresses after hard bounces or complaints so later campaigns do not
  resend to them automatically.

### Admin Workflow

- Add an admin-only **Email Owners** action on the registrations page.
- Preview all event owners before sending:
  - Eligible owners selected by default.
  - Missing, invalid, or suppressed emails shown as excluded.
  - Previously delivered owners excluded by default but manually selectable.
  - Admins can deselect individual owners.
- Show the rendered HTML/plain-text email preview and support sending a test
  email.
- Require confirmation before creating the campaign.
- Display progress in a closeable overlay that can be reopened.
- Show campaign totals and per-owner statuses, messages, vehicles, and previous
  delivery history.
- Provide retry-failed and explicit resend actions.
- Registrar and Judge accounts cannot preview or send campaigns.

### Email Content

- Subject: `Manage your Father's Day Car Show registration`
- Include:
  - Owner greeting.
  - Link to `https://visit.fathersdaycarshow.ca/owner`.
  - Instruction to log in using their last name and five-digit code.
  - Every vehicle with entry number, year/make/model, and corresponding code.
  - Explanation that owners can update contact and vehicle details, add photos,
    select the primary photo, and manage all their vehicles.
  - Reply/help instructions directing responses to
    `info@celebrationedmonton.com`.
- Provide branded HTML and accessible plain-text versions.
- Do not use magic links or place credentials in URL query parameters.

## Interfaces

- Add admin-only endpoints to:
  - Preview eligible campaign recipients.
  - Send a test email.
  - Create a campaign from selected owner IDs.
  - Fetch latest or specific campaign progress.
  - Retry failed recipients.
- Preview responses identify eligibility, exclusions, suppression state, and
  previous successful delivery.
- Campaign status responses expose aggregate counts and per-recipient delivery
  state without exposing other owners' access codes outside admin
  authorization.

## Test Plan

- Preview correctly groups multiple vehicles into one owner email.
- Missing, invalid, bounced, complained, and previously delivered recipients
  receive the correct default selection state.
- Selected owners and access codes are snapshotted when the campaign starts.
- Mock test campaigns complete without sending real email.
- SES send failures retry safely without duplicate successful sends.
- Delivery, bounce, complaint, and rejection events update the correct
  recipient.
- Hard-bounced and complained addresses are suppressed from later campaigns.
- Failed recipients can be retried; delivered recipients require explicit
  resend selection.
- Registrar and Judge accounts cannot access campaign APIs or controls.
- HTML and plain-text templates contain the correct owner link, vehicle list,
  codes, and help text.
- Verify database migration, API tests, admin build, Terraform plan, and
  production SES sandbox or production-access state.

## Assumptions

- Campaigns include every event owner record with at least one vehicle and a
  valid email, regardless of vehicle check-in status.
- One owner record receives one email; separate owner records sharing an email
  address remain separate recipients.
- SES costs are negligible at current volume: approximately US $0.10 per 1,000
  outbound emails.
- Production sending remains disabled until domain verification, DKIM, bounce
  handling, and SES production access are confirmed.

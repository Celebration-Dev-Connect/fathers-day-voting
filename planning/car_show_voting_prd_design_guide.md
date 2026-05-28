# Father’s Day Car Show Voting Site — PRD + Design Guide

## Document status

**Version:** Draft 1  
**Project:** Father’s Day Car Show / Show & Shine voting, judging, registration, and photo site  
**Target event date:** Sunday, June 21, 2026  
**Target testing date:** Sunday, June 7, 2026  
**Primary reviewers:** Caleb Huget and Celebration Church design staff  
**Parent brand/site:** Celebration Edmonton / Father’s Day Car Show  
**Proposed child site:** `carshow.celebrationedmonton.com` or confirmed event subdomain

> Note: The requested domain was written as `carshow.celebation.com`. This document assumes the intended domain is a Celebration-controlled car show subdomain. Final DNS/hosting ownership needs confirmation.

---

# Part 1 — Product Requirements Document

## 1. Purpose

Create a mobile-first website for the Father’s Day Car Show / Show & Shine that supports four distinct interface versions:

1. **Staff registration/admin interface** for onsite registration, QR card assignment, vehicle management, category management, judge management, vote cutoff, results review, exports, and overrides.
2. **Vehicle owner interface** for completing vehicle details and uploading vehicle photos after staff assigns a QR card.
3. **Visitor voting/photo interface** for scanning a vehicle QR code, viewing vehicle details, voting for one favourite per category, and optionally uploading photos.
4. **Judge scoring interface** for assigned judges to rank their top vehicles in each category, finalize category submissions, and produce automatic judging results.

The site should feel like a natural child site of Celebration Edmonton and the Father’s Day Car Show brand, while being extremely simple to use in a busy outdoor event environment.

## 2. Goals

### Primary goals

- Replace or support onsite vehicle entry registration with a reliable QR-based workflow.
- Associate each onsite vehicle with a preprinted QR car show card.
- Allow vehicle owners to enrich their entry with history, details, and up to 10 photos.
- Allow visitors to vote for one favourite vehicle per category by scanning the vehicle’s QR code.
- Allow visitors to upload optional photos of scanned vehicles.
- Allow judges to rank their top 10 vehicles per category using a secure staff/judge login.
- Automatically calculate public winners after judging and visitor vote cutoff.
- Provide post-awards public results and a possible event photo slideshow.
- Export registrations, votes, judge scores, and photo metadata from the database.

### Secondary goals

- Support future events with reusable event/category configuration.
- Support optional sponsor’s choice and kids’ choice categories.
- Allow AI-assisted photo moderation before visitor-uploaded photos are public.
- Allow staff to create extra categories if needed on event day.
- Allow staff to reprint and reassign QR codes with double-confirm protection.

## 3. Non-goals for version 1

- Full public vehicle browsing with voting from a list. Visitors may browse, but voting should only happen from the vehicle QR flow.
- Complex anti-fraud identity verification for public voters.
- Full offline voting guarantees.
- Real-time public leaderboard before awards.
- Public display of owner contact information.
- A full replacement for all Planning Center event operations unless explicitly scoped later.

## 4. Users and roles

## 4.1 Staff/admin

Staff operate registration tables and event administration from laptops, phones, and tablets.

Staff can:

- Sign in using Planning Center identity if feasible.
- Import online registrations.
- Register onsite entries.
- Scan/assign preprinted QR cards using device camera.
- Search, edit, and manage vehicle entries.
- Create/edit categories.
- Reprint QR cards.
- Reassign QR cards with strong warning and double confirmation.
- Manage judge users and category assignments.
- Run vote cutoff/tally from the admin page.
- Review calculated winners.
- Apply manual overrides if required.
- Export event data.
- Publish public results after awards.

## 4.2 Vehicle owner

Vehicle owners are linked to a vehicle entry by staff during registration.

Owners can:

- Receive a login code during/after registration.
- Open their secure owner edit link from QR/email/SMS code.
- Add or edit vehicle information.
- Add detailed history/story of the vehicle.
- Upload or take up to 10 vehicle photos.
- Add/remove their own photos.
- Opt out of public owner-name display.
- See a disclaimer that photos may be displayed publicly and contact information is internal only.

Owners cannot:

- Change their assigned QR card.
- Change final vote/judge results.
- Edit internal staff-only fields.
- View private contact data for other owners.

## 4.3 Visitor

Visitors are car show attendees using their own mobile phones.

Visitors can:

- Scan a vehicle QR card.
- View the vehicle’s public profile.
- Vote for one favourite vehicle in that vehicle’s category.
- See a warning before finalizing a category vote.
- Upload optional photos of the scanned vehicle.
- Upload photos without voting.
- Browse public vehicle entries by category after scanning or from the public site.
- View public results after the awards ceremony.

Visitors cannot:

- Vote from the browse list without scanning a vehicle QR.
- Vote for more than one favourite in a category from the same browser/session.
- See private owner contact information.
- See judge scores.

## 4.4 Judge

Judges are authenticated users, ideally via Planning Center identity.

Judges can:

- Sign in using Planning Center identity if feasible.
- See assigned categories.
- Rank their favourite 10 vehicles in each category.
- Assign ranks 1 through 10 for each category, where rank 1 is the judge’s top vehicle.
- Modify rankings before final submission.
- Final-submit a category, locking that judge’s rankings for the category.

Judges cannot:

- See other judges’ scores.
- Modify a category after final submission unless staff unlocks it.
- See calculated winners before staff/admin release.

## 5. Event configuration

Each event should be configurable so the system can be reused.

Required event fields:

- Event name
- Event date
- Venue name
- Venue address
- Public site status: draft / live / results-published / archived
- Registration open/closed status
- Voting open/closed status
- Judging open/closed status
- Results published status
- Default categories
- Terms/privacy/photo disclaimer links
- Contact email

Default 2026 event:

- **Event name:** Father’s Day Car Show / Show & Shine
- **Date:** Sunday, June 21, 2026
- **Venue:** Celebration Church
- **Address:** 7215 Argyll Road, Edmonton, AB
- **Full testing target:** Sunday, June 7, 2026

## 6. Vehicle categories

Default categories:

- Classic Car
- Modern Car
- Truck
- Motorbike
- Custom
- People’s Choice

Optional/stretch categories:

- Sponsor’s Choice
- Kids’ Choice

Category rules:

- A vehicle may belong to only one main category.
- Staff assign or confirm the category during onsite registration.
- Staff can create additional categories if needed.
- Category changes should be tracked in audit history.
- If a category is changed after votes are cast, staff must receive a warning because visitor vote eligibility and tie-break logic may be affected.

Open decision:

- Confirm whether “People’s Choice” is a separate category assigned to vehicles or a cross-category visitor award. Recommended: make People’s Choice a global visitor award, not a vehicle entry category, while keeping main vehicle categories for visitor voting.

## 7. QR card system

## 7.1 Preprinted QR cards

Each preprinted card should contain:

- Large visible vehicle entry number, for example `C-104`.
- QR code with a unique random tokenized URL.
- Short fallback URL/code for manual entry.
- Clear text: “Scan to view, vote, or upload photos.”
- Optional small sponsor/event branding.

Recommended QR URL format:

`https://carshow.celebrationedmonton.com/v/{publicQrToken}`

The QR token should be a random, non-sequential value. The visible entry number can be sequential for staff usability, but the public QR token should not be guessable.

## 7.2 QR states

Each QR card can be in one of these states:

- Printed / unassigned
- Assigned to vehicle
- Reassigned
- Retired / voided
- Reprinted

## 7.3 QR assignment flow

1. Staff opens registration page.
2. Staff searches/imports online registration or starts new onsite registration.
3. Staff collects/validates owner and vehicle information.
4. Staff scans the preprinted QR card using device camera.
5. System confirms QR status.
6. Staff assigns QR to the vehicle.
7. System sends owner login code or secure owner edit link.
8. Vehicle card is placed on/near the vehicle.

## 7.4 QR reassignment flow

Reassignment must be protected because it can accidentally move votes/photos to the wrong vehicle.

Required protections:

- Separate admin section for QR reassignment.
- Warning screen showing current assigned vehicle and new target vehicle.
- Staff must type a confirmation phrase such as `REASSIGN`.
- Staff must choose a reason.
- System stores audit log of who reassigned it, when, old vehicle, new vehicle, and reason.

## 7.5 Reprint flow

Staff can reprint a QR card if a card is lost or damaged.

Recommended behaviour:

- Reprint the same vehicle QR if the original was damaged but not compromised.
- Retire old token and generate a new token if the original was lost or may be misused.
- Preserve the vehicle entry number where possible.
- Log all reprints.

## 8. Staff registration requirements

## 8.1 Staff registration fields

Required:

- Owner name
- Owner phone
- Owner email
- Vehicle year
- Vehicle make
- Vehicle model
- Plate number
- Category
- Assigned QR card/token
- Registration source: online import / onsite

Recommended optional fields:

- Owner display name
- Owner name public? yes/no
- Vehicle nickname
- Exterior colour
- Province/state
- Internal notes
- Registration timestamp
- Registered by staff user
- Check-in status

## 8.2 Online registration import

The system should support importing existing online registrations.

Recommended MVP approach:

- Support CSV import first.
- Map CSV columns to system fields.
- Allow staff to search imported registrations during onsite check-in.
- Mark imported record as checked in once QR is assigned.

Recommended later approach:

- Planning Center Registrations API integration if event registration data is available there and access is approved.

Reasoning:

- CSV import is faster and safer for the 2026 timeline.
- Direct Planning Center registration integration depends on API access, event setup, scopes, and available data fields.

## 8.3 Staff admin dashboard

Dashboard sections:

- Event status
- Registration count
- Checked-in vehicles
- Unassigned QR cards
- Categories
- Vote status
- Judge status
- Photo moderation queue
- Results and exports
- QR reprint/reassignment

Key staff actions:

- Search by owner, phone, email, vehicle, plate, entry number, QR token.
- Edit vehicle entry.
- Assign QR.
- Reprint QR.
- Reassign QR.
- Close registration.
- Close visitor voting and run tally.
- Close judging.
- Review/override winners.
- Publish results.

## 9. Vehicle owner flow

## 9.1 Owner authentication

Recommended owner login method:

- Staff registration triggers a one-time login code sent by SMS or email.
- Owner enters the code to access their vehicle edit page.
- The owner session is tied to that vehicle only.
- Codes expire after a set time, for example 30–60 minutes.
- Staff can resend code.

Alternative fallback:

- Staff can show a temporary QR or short link on the registration device.
- Staff can generate a new code if SMS/email fails.

## 9.2 Owner editable fields

Owners can edit:

- Vehicle year/make/model confirmation
- Vehicle nickname
- Vehicle description
- Detailed vehicle history/story
- Modifications/custom work
- Interesting facts
- Owner display name
- Owner name public/private preference
- Photos, up to 10

Owners cannot edit:

- Contact email/phone without staff assistance
- Plate number after check-in, unless staff allows
- Assigned category after registration, unless staff allows
- QR code assignment

## 9.3 Owner photo uploads

Rules:

- Maximum 10 photos per vehicle owner.
- Owners can add/remove their own photos.
- Photos are public once uploaded unless the system is configured to require moderation.
- Upload screen must clearly state: “Photos you upload may be shown publicly on the event website or slideshow.”
- Recommended accepted formats: JPG, PNG, HEIC converted to JPG/WebP.
- Recommended max original file size: 10–15 MB.
- System should generate web-optimized versions and thumbnails.

## 10. Visitor voting and photo flow

## 10.1 Visitor scan flow

1. Visitor scans vehicle QR card.
2. Public vehicle profile opens.
3. Visitor sees vehicle details, category, photos, and vote button.
4. Visitor taps “Vote for this vehicle in [Category].”
5. System shows confirmation warning: “You can only vote once in this category. This cannot be changed.”
6. Visitor confirms.
7. System records vote.
8. Visitor sees success message and optional upload-photo prompt.

## 10.2 Visitor voting rules

- One visitor vote per category per browser/session.
- A vote can only be cast from a scanned vehicle QR page.
- Visitors may vote in multiple categories if they scan vehicles from each category.
- Visitors cannot vote for more than one favourite in the same category from the same browser/session.
- Staff can close voting and run final tally at a set time.

## 10.3 QR session duplicate-vote method

Recommended QR session model:

- When a visitor scans any vehicle QR, the server creates or reads an anonymous visitor session.
- The browser stores a visitor session ID in a secure cookie and/or local storage.
- The server stores which categories that session has already voted in.
- When the visitor tries to vote, the server checks whether that session has already voted in the category.
- If not, the vote is accepted and the category is marked as used for that session.
- If yes, the vote is blocked with a friendly message.

Strengths:

- Very low friction for visitors.
- No account required.
- Works well for a family-friendly event.
- Reduces accidental duplicate voting.

Limitations:

- It does not fully prevent intentional duplicate voting from multiple devices, private browsing, cleared cookies, or different browsers.
- IP/device fingerprinting can add friction and privacy concerns.
- Stronger prevention would require phone/email verification, but that may reduce participation.

Recommended compromise:

- Use anonymous QR session tracking for MVP.
- Add basic server-side rate limiting.
- Add admin anomaly reporting, such as many votes from one IP/device in a short period.
- Avoid requiring phone/email verification for public visitors unless abuse becomes a known issue.

## 10.4 Visitor photo uploads

Visitors can:

- Upload photos from the scanned vehicle page.
- Upload without voting.
- See a disclaimer that uploaded photos may be public.

Visitor photos should:

- Go into a moderation queue by default.
- Be checked by AI safety scan before public display if feasible.
- Require staff approval if flagged.
- Be linked to vehicle, uploader session, timestamp, and moderation status.

Recommended moderation statuses:

- Pending
- Auto-approved
- Needs review
- Approved
- Rejected

## 11. Judge scoring/ranking

## 11.1 Judge authentication

Recommended:

- Judges sign in through Planning Center identity using OAuth/OIDC if feasible.
- Staff assigns judge role in the car show app after Planning Center identity is confirmed.
- Judge role and category assignments are stored locally in the car show database.

Reasoning:

- Planning Center is useful for verifying staff/judge identity.
- The car show app still needs its own role, event, and category permission model.

## 11.2 Judge category assignments

Staff can:

- Add/remove judges.
- Assign judges to categories.
- View judge submission status.
- Unlock a judge submission if needed.

Default expected number of judges:

- 10 judges, configurable by staff.

## 11.3 Judge ranking model

Each judge ranks their top 10 vehicles in a category.

Recommended scoring interpretation:

- Rank 1 = 10 points
- Rank 2 = 9 points
- Rank 3 = 8 points
- Rank 4 = 7 points
- Rank 5 = 6 points
- Rank 6 = 5 points
- Rank 7 = 4 points
- Rank 8 = 3 points
- Rank 9 = 2 points
- Rank 10 = 1 point

Winner calculation:

- For each vehicle, sum all judge points in the category.
- Divide by number of judges who submitted for that category to get average score.
- Highest average score wins.

Note:

- The phrase “score 1 to 10” and “ranked favourite 10” can be interpreted two ways. This document recommends rank-to-points because it matches “picking their favourite 10 ranked vehicles.”

## 11.4 Judge submission rules

- Judges can modify rankings until final submit.
- Final submit locks that judge’s category ranking.
- Staff can unlock a final submission if there was a mistake.
- Judges cannot see other judges’ rankings.
- Judges cannot see calculated winners before staff release.

## 12. Results and awards

## 12.1 Automatic winners

System should calculate:

- Judge winner per category.
- Visitor favourite per category.
- Overall people’s choice / highest visitor vote count, if desired.
- Optional sponsor’s choice / kids’ choice if enabled.

## 12.2 Tie-breaks

Judge tie-break:

1. Highest visitor vote count for the tied vehicle within that vehicle’s category.
2. If still tied, staff/admin manual decision.

Visitor vote tie-break:

1. Staff/admin manual decision.
2. Optional: earliest vehicle to reach tied count.

## 12.3 Vote cutoff

- Staff must manually close visitor voting from the admin page.
- Once voting closes, visitor votes are tallied.
- Late votes are blocked or stored as late/non-counted depending on admin setting.
- The tally action should show confirmation before running.

## 12.4 Overrides

Staff can manually override winners before publishing.

Override requirements:

- Must select reason.
- Must store original calculated winner.
- Must store overriding staff user and timestamp.
- Public results should not expose internal override details unless desired.

## 12.5 Awards report/export

System should generate:

- Award winners summary PDF or printable page.
- CSV export of winners.
- CSV export of all registrations.
- CSV export of visitor votes.
- CSV export of judge rankings/scores.
- CSV export of photo metadata.

## 12.6 Public results

After awards:

- Staff changes event status to results published.
- Public site shows winners, top entries, selected photos, and optional slideshow.
- Public results should be easy to share on social media.

## 13. Photo slideshow

Post-event slideshow should show:

- Approved owner photos.
- Approved visitor photos.
- Winner badges.
- Vehicle name/year/make/model/category.
- Optional Celebration/Father’s Day Car Show branding slide.

Modes:

- Public web slideshow.
- Full-screen event display mode.
- Post-event gallery.

Stretch:

- Auto-generate highlight reel layout from approved photos.

## 14. Technical recommendations

## 14.1 Recommended application stack

Recommended stack:

- **Frontend/backend:** Next.js with TypeScript
- **Database:** PostgreSQL
- **Auth:** Planning Center OAuth/OIDC for staff/judges; email/SMS one-time codes for owners; anonymous sessions for visitors
- **File storage:** S3-compatible object storage, Supabase Storage, Cloudflare R2, or Vercel Blob
- **Image processing:** Server-side resize/compression and thumbnail generation
- **Deployment:** Vercel, Render, Railway, Fly.io, or similar managed host
- **Analytics/logging:** Lightweight event logging and admin audit logs

## 14.2 Database recommendation

Recommended database: **PostgreSQL**, either through Supabase, Neon, Railway, or another managed Postgres provider.

Best practical option for this project:

- **Supabase Postgres + Supabase Storage** if you want an integrated DB/file/auth-friendly platform.
- **Neon Postgres + Cloudflare R2/S3** if you want a clean database plus scalable object storage.

Why Postgres:

- Reliable relational model for events, vehicles, categories, votes, judges, and results.
- Strong reporting/export support.
- Good fit for transactional voting/judging logic.
- Easier to audit and query than a spreadsheet/no-code setup.

## 14.3 File storage recommendation

Google Drive is possible for staff archival storage, but it is not recommended as the primary public photo storage layer.

Recommended approach:

- Store uploaded public photos in app-controlled object storage.
- Generate optimized public URLs/thumbnails.
- Optionally export or sync approved photos to staff Google Drive after the event.

Reasoning:

- Public image delivery, thumbnails, permissions, and CDN performance are better with object storage.
- Google Drive permissioning and public image serving can become fragile for a public event site.

## 14.4 Planning Center integration recommendation

Use Planning Center for:

- Staff identity
- Judge identity
- Optional church staff access control
- Optional online registration import if the registration data is available through the API

Do not rely on Planning Center for:

- Public visitor voting sessions
- Vehicle-specific event logic
- Judge ranking state
- QR reassignment/audit logic
- Photo moderation workflow

Recommended auth approach:

- Use Planning Center OIDC/OAuth to identify staff/judge users.
- Store app-specific roles locally:
  - admin
  - registration staff
  - photo moderator
  - judge
  - results manager
- Allow admins to map Planning Center users to app roles.

## 14.5 Offline/poor connection support

A short offline cache is possible, but it should be treated as limited support, not guaranteed offline voting.

Recommended PWA features:

- Cache public app shell.
- Cache recently viewed vehicle pages.
- Keep owner/visitor forms from being lost during temporary connection drops.
- Queue photo metadata and smaller uploads when possible.
- Show clear “pending sync” status.

Important limitation:

- Visitor votes should only be considered official once received by the server before the voting cutoff.
- Offline queued votes may miss the cutoff if the phone does not reconnect in time.
- Duplicate vote prevention needs server confirmation.

Recommended event-day UX:

- If offline, show: “Connection lost. Your action will submit when you are back online. Votes only count after successful sync.”
- For staff registration, provide stronger retry/resume support than public visitor flow.

## 15. Data model overview

Core tables/entities:

- Event
- Category
- QRCard
- VehicleEntry
- Owner
- StaffUser
- JudgeAssignment
- JudgeRanking
- VisitorSession
- VisitorVote
- Photo
- PhotoModerationEvent
- Result
- AuditLog
- ImportBatch

## 15.1 Event

Fields:

- id
- name
- date
- venue_name
- venue_address
- status
- registration_status
- voting_status
- judging_status
- results_status
- created_at
- updated_at

## 15.2 VehicleEntry

Fields:

- id
- event_id
- category_id
- qr_card_id
- owner_id
- entry_number
- source
- check_in_status
- year
- make
- model
- plate_number
- vehicle_nickname
- colour
- description
- history
- modifications
- owner_name_public
- internal_notes
- created_by
- created_at
- updated_at

## 15.3 QRCard

Fields:

- id
- event_id
- public_token
- visible_code
- status
- assigned_vehicle_id
- printed_at
- assigned_at
- retired_at
- reprint_of_qr_card_id
- created_at
- updated_at

## 15.4 VisitorVote

Fields:

- id
- event_id
- category_id
- vehicle_entry_id
- visitor_session_id
- qr_card_id
- vote_status
- created_at
- counted_at

Unique constraint:

- one counted vote per visitor_session_id + category_id

## 15.5 JudgeRanking

Fields:

- id
- event_id
- category_id
- judge_user_id
- vehicle_entry_id
- rank
- points
- draft_or_final
- submitted_at
- created_at
- updated_at

Unique constraints:

- one rank per judge/category
- one vehicle per judge/category ranking list

## 16. Security and privacy requirements

## 16.1 Privacy principles

- Public pages must never show owner phone, email, or plate number.
- Owner name is public only if the owner opts in.
- Owner contact information is internal and judge/staff-only if required.
- Photo upload pages must clearly state that uploaded photos may be used publicly.
- Link to Celebration’s existing privacy/terms page if approved.

## 16.2 Access control

- Staff/admin pages require authenticated staff identity.
- Judge pages require authenticated judge identity and assigned judge role.
- Owner pages require secure one-time code or secure owner session.
- Visitor pages do not require login.

## 16.3 Audit logs

Audit logs required for:

- Staff login
- Vehicle registration create/edit
- QR assignment/reassignment/reprint
- Category changes
- Judge unlocks
- Vote cutoff
- Winner override
- Results publishing
- Photo moderation decisions

## 17. Admin exports

Required exports:

- Registrations CSV
- Vehicle entries CSV
- QR assignments CSV
- Visitor votes CSV
- Judge rankings CSV
- Results CSV
- Photo metadata CSV
- Import error report CSV

Recommended export filters:

- By event
- By category
- By source
- By status
- By date/time

## 18. MVP scope recommendation

Given the June 21, 2026 event date and June 7, 2026 full-testing target, the recommended MVP should focus on the workflows needed to run event day reliably.

## 18.1 Must-have MVP

- Event setup
- Category setup with staff-created categories
- Staff login
- Staff registration/search/edit
- CSV online registration import
- Preprinted QR card generation/printing support
- QR assignment with device camera
- QR reprint/reassignment with audit log
- Owner login code
- Owner vehicle details and 10 photo uploads
- Visitor QR vehicle profile
- Visitor one-vote-per-category flow
- Visitor photo upload with moderation queue
- Judge login
- Judge category ranking top 10
- Judge final submit/lock
- Admin vote cutoff
- Automatic results calculation
- Tie-break using visitor votes for judge ties
- Staff override
- Public results page
- CSV exports

## 18.2 Should-have after MVP

- AI-assisted visitor photo moderation
- Event slideshow mode
- Planning Center online registration direct import
- Advanced anomaly detection for visitor voting
- Sponsor’s Choice and Kids’ Choice special workflows
- Post-event gallery

## 18.3 Could-have later

- SMS-based visitor verification
- Live map of vehicle locations
- Sponsor ad placements
- Public favourites list without voting
- Multi-year event archive
- Automated photo sync to Google Drive

## 19. Key risks

## 19.1 Timeline risk

The full testing target is June 7, 2026, only two weeks before the event. The scope is significant, especially with QR assignment, photo uploads, judging, results, and Planning Center integration.

Mitigation:

- Build MVP first.
- Use CSV import before direct Planning Center registration integration.
- Use object storage instead of custom Google Drive delivery.
- Keep public visitor voting friction low.
- Keep judging simple.

## 19.2 Cell/network risk

Outdoor event conditions may have weak connectivity.

Mitigation:

- PWA app shell caching.
- Clear retry/resume states.
- Staff registration devices should use reliable Wi-Fi or cellular hotspots.
- Server-confirmed votes only.

## 19.3 Vote integrity risk

Anonymous visitor sessions reduce duplicate votes but do not eliminate intentional duplicate voting.

Mitigation:

- Session-based one vote per category.
- Rate limiting.
- Admin anomaly report.
- Clear voting rules.

## 19.4 Photo moderation risk

Visitor photos may be inappropriate or off-topic.

Mitigation:

- Default visitor photos to moderation queue.
- AI scan if feasible.
- Manual review for flagged photos.
- Public display only approved photos.

## 19.5 Planning Center integration risk

Planning Center API/OIDC is feasible, but exact available scopes and registration data access need confirmation.

Mitigation:

- Use Planning Center for staff/judge identity first.
- Store app roles locally.
- Use CSV import as fallback for online registrations.

## 20. Acceptance criteria

## 20.1 Staff registration

- Staff can register an onsite vehicle in under 2 minutes.
- Staff can assign QR card using laptop/tablet/phone camera.
- Staff can search by owner, vehicle, plate, or QR code.
- Staff can reprint/reassign QR only through protected flow.

## 20.2 Owner interface

- Owner can log in using code.
- Owner can complete public vehicle profile.
- Owner can upload up to 10 photos.
- Owner can opt out of public owner-name display.
- Owner sees photo/contact privacy disclaimer.

## 20.3 Visitor interface

- Visitor can scan QR and load vehicle page quickly.
- Visitor can vote once per category.
- Visitor receives clear warning before confirming vote.
- Visitor can upload optional photos.
- Duplicate vote in same category is blocked for same session.

## 20.4 Judge interface

- Judge can see assigned categories only.
- Judge can rank top 10 vehicles per category.
- Judge can modify before final submit.
- Final submit locks judge category.
- Judge cannot see other judges’ scores.

## 20.5 Results

- Staff can close voting.
- System calculates judge winners and visitor winners.
- Judge tie-break uses visitor vote count.
- Staff can override with audit log.
- Staff can publish public results after awards.

---

# Part 2 — Design Guide

## 1. Design direction

The car show site should feel like a child experience of Celebration Edmonton:

- Vibrant and energetic.
- Friendly, family-oriented, and approachable.
- Mobile-first.
- Photo-forward.
- Clear enough for outdoor use in sunlight.
- Simple enough for fast interactions during a busy event.

The look should combine:

- **Celebration Church styling:** vibrant overlays, clean layout, strong photography, welcoming tone.
- **Father’s Day Car Show styling:** bold vehicle photography, event-badge feel, large QR-driven calls to action.

## 2. Brand feel

Design keywords:

- Celebration
- Family
- Community
- Motion
- Chrome
- Summer
- Edmonton
- Simple
- Confident
- Event-ready

Avoid:

- Dark, aggressive motorsport styling.
- Overly complex dashboards for visitors.
- Tiny controls.
- Forms that feel like government paperwork.
- Public pages that expose private owner information.

## 3. Visual system

## 3.1 Colour direction

Use colours pulled from the current Celebration/Father’s Day Car Show brand assets when logo files are available.

Recommended palette roles:

- **Primary brand colour:** Celebration/event brand colour used for main buttons and highlights.
- **Secondary accent:** Warm Father’s Day/event accent for badges and success states.
- **Dark neutral:** Text, headers, admin navigation.
- **Light neutral:** Background cards and form areas.
- **Success:** Vote submitted, QR assigned, judging submitted.
- **Warning:** Duplicate vote warning, reassignment warning, vote cutoff warning.
- **Danger:** Reassign, delete, reject photo, override winner.

Implementation note:

- Use CSS variables so the palette can be updated after logo/brand assets are provided.

Example variable structure:

```css
:root {
  --color-primary: /* Celebration brand primary */;
  --color-secondary: /* Father’s Day Car Show accent */;
  --color-background: #ffffff;
  --color-surface: #f7f7f7;
  --color-text: #1d1d1d;
  --color-muted: #6b7280;
  --color-success: #15803d;
  --color-warning: #b45309;
  --color-danger: #b91c1c;
}
```

## 3.2 Typography

Use the closest available web fonts to the parent site once confirmed.

Recommended fallback pairing:

- **Headings:** bold, condensed or geometric sans-serif for event energy.
- **Body:** highly readable sans-serif.
- **Numbers/badges:** strong tabular number style for entry numbers, ranks, and vote counts.

Typography rules:

- Mobile body text minimum 16px.
- Primary action buttons minimum 18px.
- Entry numbers and rank numbers should be large and scannable.
- Avoid thin fonts for outdoor readability.

## 3.3 Photography style

Use:

- Large vehicle photography.
- Warm outdoor event images.
- Family-friendly crowd shots.
- Sponsor/event banners.
- Subtle colour overlays matching Celebration’s visual style.

Photo treatment:

- Rounded cards.
- Soft overlay gradients for text readability.
- Cropped thumbnails using consistent aspect ratios.
- Use badges for category/winner labels.

## 3.4 UI shape and spacing

Recommended style:

- Rounded cards.
- Large buttons.
- Generous spacing.
- Sticky bottom action bar on mobile for vote/photo actions.
- Simple top header with event logo and minimal navigation.
- Dashboard cards for staff/admin.

## 4. Responsive targets

Primary targets:

- Visitor mobile phones.
- Vehicle owner mobile phones.
- Staff tablets such as iPad.
- Staff laptops.
- Judge phones/tablets.

Breakpoints:

- Mobile: 360–480px
- Large mobile/small tablet: 481–767px
- Tablet: 768–1023px
- Desktop/laptop: 1024px+

## 5. Interface design requirements

## 5.1 Public landing page

Purpose:

- Introduce the event.
- Explain voting instructions.
- Link to vehicle browsing/gallery.
- Show results after awards.

Before awards:

- Event title/date.
- “Scan a vehicle QR code to vote.”
- Voting rules.
- Browse categories.
- Link to privacy/photo disclaimer.

After awards:

- Winners.
- Photo slideshow/gallery.
- Thank-you message.
- Sponsor recognition.

Primary CTA before awards:

- “Scan a vehicle QR code to vote”

Primary CTA after awards:

- “View winners”

## 5.2 Vehicle public profile page

Must show:

- Vehicle photos.
- Year/make/model.
- Category.
- Entry number.
- Vehicle story/history.
- Owner display name only if opted in.
- Vote CTA.
- Upload photo CTA.

Mobile layout:

1. Hero photo carousel.
2. Vehicle title.
3. Category badge.
4. Sticky vote button.
5. Story/details.
6. Photo upload.
7. Gallery.

Vote button states:

- “Vote for this [Category]”
- “Confirm your vote”
- “Vote submitted”
- “You already voted in this category”
- “Voting has closed”

## 5.3 Visitor vote confirmation

Use a modal or full-screen confirmation.

Copy example:

**Vote for this vehicle?**  
You can only vote once in the **Classic Car** category. Please confirm your choice.

Buttons:

- Primary: “Yes, submit my vote”
- Secondary: “Go back”

After success:

**Vote submitted — thank you!**  
You can still upload photos of this vehicle if you would like.

## 5.4 Visitor photo upload

Must show:

- Vehicle name.
- Upload/take photo button.
- Public photo disclaimer.
- Upload progress.
- Success message.
- Moderation note if applicable.

Copy example:

“Photos uploaded here may be shown publicly on the event website, slideshow, or post-event gallery.”

## 5.5 Owner edit interface

Design priority:

- Friendly guided form.
- Clear completion progress.
- Easy photo upload.

Sections:

1. Vehicle basics.
2. Vehicle story/history.
3. Photos.
4. Public display preferences.
5. Review/save.

Owner disclaimer:

“Your phone and email are used internally for event communication and are not shown publicly. Your owner name is only shown publicly if you allow it. Photos you upload may appear publicly on the event website or slideshow.”

## 5.6 Staff registration interface

Design priority:

- Speed and reliability.
- Tablet-friendly controls.
- Search-first workflow.
- Camera scanning support.

Registration screen layout:

- Search/imported registrations at top.
- Owner details form.
- Vehicle details form.
- Category selection.
- QR scan panel.
- Submit/check-in button.

QR scan states:

- Ready to scan.
- QR found: unassigned.
- QR found: already assigned.
- QR assigned successfully.
- QR invalid.

## 5.7 Staff admin dashboard

Dashboard cards:

- Registered vehicles
- Checked-in vehicles
- Categories
- QR cards assigned/unassigned
- Visitor votes
- Judge submissions
- Pending photos
- Results status

Navigation:

- Dashboard
- Registrations
- QR Cards
- Categories
- Judges
- Photos
- Voting
- Results
- Exports
- Settings

## 5.8 QR reassignment interface

This screen should intentionally feel more serious than normal editing.

Required UI:

- Current QR assignment card.
- New target vehicle card.
- Warning banner.
- Reason dropdown/text field.
- Typed confirmation field.
- Final red “Reassign QR” button.

Warning copy:

“Reassigning this QR may affect visitor scans, photos, and voting history. Only continue if the current assignment is incorrect.”

## 5.9 Judge interface

Design priority:

- Fast ranking on phone/tablet.
- No clutter.
- Clear final submit lock.

Category page:

- Category name.
- Submission status.
- Search/filter vehicles.
- Vehicle cards with photos/details.
- Rank selector 1–10.
- Current top 10 list.
- Save draft.
- Final submit.

Final submit confirmation:

**Final submit rankings?**  
After submitting, your rankings for this category will be locked unless staff unlocks them.

Buttons:

- Primary: “Final submit”
- Secondary: “Keep editing”

## 5.10 Results page

Public results should feel celebratory.

Sections:

- Hero: “2026 Father’s Day Car Show Winners”
- Judge category winners
- Visitor favourites
- People’s Choice
- Sponsor’s Choice / Kids’ Choice if enabled
- Photo gallery/slideshow
- Sponsor thank-you

Winner card:

- Winner badge.
- Vehicle photo.
- Year/make/model.
- Category.
- Owner display name if allowed.
- Vehicle story excerpt.

## 6. Content tone

Tone should be:

- Friendly
- Clear
- Celebratory
- Family-safe
- Direct

Use:

- “Thanks for voting!”
- “Scan a vehicle card to vote.”
- “You can vote once per category.”
- “Your vote has been submitted.”

Avoid:

- Technical phrases like “session token” in public UI.
- Harsh error copy.
- Long policy text on voting screens.

## 7. Accessibility requirements

- All buttons must be keyboard accessible.
- Colour contrast must meet WCAG AA where possible.
- Form fields require visible labels.
- Error messages must be text-based, not colour-only.
- QR fallback code must be readable without scanning.
- Buttons must be large enough for touch use.
- Images require alt text when displayed in galleries/results.
- Public pages should work well in bright outdoor conditions.

## 8. Performance requirements

Public pages should:

- Load quickly on mobile connections.
- Optimize images automatically.
- Lazy-load photo galleries.
- Keep first vehicle page load lightweight.
- Avoid heavy animations during event day.

Recommended targets:

- Initial public vehicle page under 2.5 seconds on decent mobile connection.
- Vote submission feedback under 1 second after server response.
- Staff registration form usable on tablets without lag.

## 9. Microcopy library

## 9.1 Voting

- “Scan a vehicle QR code to vote.”
- “You can vote once per category.”
- “Vote for this [Category].”
- “Please confirm — this will be your vote for [Category].”
- “Your vote has been submitted. Thank you!”
- “You already voted in this category.”
- “Voting has closed. Results will be posted after awards.”

## 9.2 Owner

- “Complete your vehicle profile.”
- “Tell visitors what makes your vehicle special.”
- “Upload up to 10 photos.”
- “Your contact information is for event staff only.”
- “Photos may be shown publicly on the event website or slideshow.”

## 9.3 Staff

- “Scan QR card.”
- “QR card assigned.”
- “This QR is already assigned.”
- “Reassignment requires confirmation.”
- “Voting is now closed.”
- “Results are ready for review.”
- “Results published.”

## 9.4 Judges

- “Rank your top 10 vehicles.”
- “Save draft.”
- “Final submit.”
- “This category is locked.”
- “Staff can unlock this if a correction is needed.”

## 10. Open questions

1. Confirm final domain: `carshow.celebrationedmonton.com`, `carshow.celebration.com`, or another domain.
2. Confirm whether People’s Choice is a global award or a normal vehicle category.
3. Confirm whether visitor category voting is per main vehicle category only, or includes People’s Choice as a separate global vote.
4. Confirm whether owner login codes should be sent by SMS, email, or both.
5. Confirm whether public owner name defaults to hidden or visible.
6. Confirm where online registration data currently lives and whether CSV export is available.
7. Confirm whether Planning Center accounts exist for all staff and judges.
8. Confirm whether judge ranking should be rank-to-points or direct 1–10 scoring.
9. Confirm whether visitor-uploaded photos should be hidden until staff approval, or auto-approved when AI scan passes.
10. Confirm hosting target and whether the main site host can support a Next.js app.
11. Confirm final logo, colours, fonts, and event graphics from design staff.
12. Confirm who has authority to publish final results and override winners.

## 11. Recommended immediate next steps

1. Confirm MVP scope by cutting anything not needed for event-day success.
2. Confirm domain and hosting approach.
3. Confirm online registration export/import source.
4. Confirm Planning Center authentication feasibility.
5. Finalize category and award rules.
6. Create wireframes for the four interfaces.
7. Create database schema.
8. Generate QR card print template.
9. Build staff registration + QR assignment first.
10. Build visitor vote flow second.
11. Build judging and results third.
12. Build owner photos/profile and moderation.
13. Run full test by June 7, 2026.


INSERT INTO "Event" (
  "id",
  "name",
  "eventDate",
  "venueName",
  "venueAddress",
  "registrationOpen",
  "peopleChoiceCutoff",
  "createdAt",
  "updatedAt"
)
VALUES (
  'event-2026-fathers-day',
  'Father''s Day Car Show / Show & Shine',
  '2026-06-21T16:00:00.000Z',
  'Celebration Church',
  '7215 Argyll Road, Edmonton, AB',
  true,
  '2026-06-21T21:00:00.000Z',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

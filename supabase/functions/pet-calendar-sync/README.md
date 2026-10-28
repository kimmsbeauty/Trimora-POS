# pet-calendar-sync

One-way sync of Trimora Pet **grooming bookings** and **boarding stays** to a business's **Google Calendar**.
Trimora is the source of truth. Nothing is read back from Google, and no invitations are ever sent.

Needs migration `113_pet_google_calendar.sql` applied first (apply only after an explicit "apply 113").

## What appears in Google

| | Grooming | Boarding |
|---|---|---|
| Title | `Grooming – Pet (Owner)` | `Boarding – Pet (Owner)` |
| When | the booking's start and end time | all-day, check-in day through check-out day |
| Description | services, groomer, status, booking ref | dates, kennel, service, status, ref, actual check-in/out times |
| Removed when | cancelled, no-show, or deleted | cancelled, or deleted |

Never sent: booking notes, feeding notes, care notes, phone numbers, emails, prices, medical or vaccination records.
The assigned groomer's id is kept in hidden event metadata so per-groomer calendars can be added later.

## One-time setup (Trimora, shared by all businesses)

1. Google Cloud Console: create (or pick) a project, then **APIs & Services > Library > Google Calendar API > Enable**.
2. **IAM & Admin > Service Accounts > Create** (e.g. `trimora-calendar`). No project roles are needed.
3. Open it > **Keys > Add key > Create new key > JSON**. Keep the downloaded file private.
4. Supabase > Edge Functions > **Secrets**:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = the whole JSON file contents
   - `CALENDAR_SYNC_CRON_SECRET` = a long random string
5. Apply migration 113, then deploy: `supabase functions deploy pet-calendar-sync`.
6. Optional but recommended: run `supabase/sql/113_pet_calendar_cron.sql` (after filling in its placeholders) so
   changes sync every minute. Without it, syncing happens when someone presses **Save** or **Sync now** in Settings.

Without `GOOGLE_SERVICE_ACCOUNT_JSON` the function answers `503 NOT_CONFIGURED`, the Settings card says so, and nothing else happens.

## Per business (done by the business, in Settings > Google Calendar)

1. In Google Calendar, open the calendar's settings > **Share with specific people** > add the email address shown in
   the card, with **Make changes to events**.
2. Copy the calendar's **Calendar ID** (settings > Integrate calendar) and paste it into the card.
3. **Test connection**, tick **Sync to Google Calendar**, **Save**. Upcoming items are copied straight away.

## Actions

| `action` | Caller | What it does |
|---|---|---|
| `info` | signed-in device | returns the service-account email to share the calendar with |
| `test` | signed-in device | reads the calendar, then adds and removes one short "Trimora connection test" event (catches a view-only share) |
| `flush` | signed-in device | syncs this business's pending changes now |
| `process` | scheduler (`x-cron-secret`) | syncs pending changes for every business |

## How it behaves

- Database triggers queue a row whenever a booking or stay changes (only for businesses with sync on). The function
  rebuilds each event from the saved data, so many quick edits become one Google call, and an edit that changes
  nothing that is sent (for example a private note) makes no call.
- Each event has a fixed id, so a retry can never create a duplicate. Failed items are retried up to 8 times; the
  last problem is shown in Settings. **Sync now** re-queues everything upcoming (this also picks up name changes,
  which are not queued automatically).
- Changing the calendar id moves the events: the old ones are removed (best effort) and new ones created.
- Switching sync off stops future syncing and leaves existing events in Google as they are.
- Edits made in Google are overwritten the next time the booking changes in Trimora.
- Times use the business's timezone from its online-booking settings (default `Africa/Nairobi`).

## Error codes shown in Settings

`CALENDAR_NOT_FOUND` wrong id or calendar not shared with the service account. `CALENDAR_FORBIDDEN` shared as view-only
(needs "Make changes to events"). `RATE_LIMITED` / `GOOGLE_UNAVAILABLE` temporary, retried. `GOOGLE_AUTH` the key is
wrong or revoked. `NOT_CONFIGURED` secrets missing.

## Not covered by automated tests

The tests prove the event content, the sync flow (against an in-memory database and a fake Google) and migration 113
(on a real Postgres engine). They do not call real Google. Before relying on it, check once with a real calendar:
create, move and cancel a booking, then reinstate it, and watch the event follow.

## Limits

Service accounts cannot invite attendees without Google Workspace domain-wide delegation. If invitations are added
later, that part needs a different sign-in (OAuth).

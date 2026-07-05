# Restoring from a manual backup

These backups are produced by `.github/workflows/backup.yml` and are a free-tier stopgap, not a substitute
for Supabase's own paid backup/PITR features. See that workflow's comments for the full rationale.

## To restore

1. Go to the repo's **Actions** tab → the "Manual database backup" workflow → find the run you want →
   download the artifact (a `.gpg` file) from that run's page.
2. Decrypt it locally (requires the `BACKUP_ENCRYPTION_PASSPHRASE` value — this is NOT stored anywhere
   recoverable except wherever you saved it when the secret was created):
   ```
   gpg --batch --yes --decrypt --passphrase "YOUR_PASSPHRASE" \
     trimora-pos-backup-<run_id>.dump.gpg > restored.dump
   ```
3. Restore into a target database (ideally a fresh/empty one, or a Supabase branch — never restore directly
   over a live production database without a plan, since this will overwrite existing data):
   ```
   pg_restore --no-owner --no-privileges -d "TARGET_DB_CONNECTION_STRING" restored.dump
   ```
4. Verify row counts and spot-check a few tables before treating the restore as complete.

## What this does NOT cover

- No automatic testing that a given backup actually restores cleanly — that's a manual step worth doing
  periodically, not just assumed.
- No point-in-time granularity — only as recent as the last successful daily run (up to ~24 hours of
  potential data loss in the worst case).
- If `BACKUP_ENCRYPTION_PASSPHRASE` itself is lost, every backup encrypted with it becomes unrecoverable.
  Store it in a password manager, not just in GitHub Secrets (which can't be read back out once set).

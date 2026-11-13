# Push notification diagnostics

The normal `send-push-notification` function records accepted Expo tickets in
`push_receipt_checks`. The private `process-push-receipts` worker checks them
after 15 minutes, stores the outcome and error code, and clears an unregistered
token only if it still matches the token used for the notification. Tokens are
never written to function logs. Recurring-expense worker notifications use a
separate delivery path and are not covered by this receipt worker.

## Setup for each Supabase environment

1. Apply `20261113040000_push_receipt_tracking.sql` before deploying the
   updated `send-push-notification` and new `process-push-receipts` functions.
   Review the currently deployed function before replacing it. The worker
   accepts only the configured scheduler bearer token; its gateway JWT
   verification is disabled in `supabase/config.toml`. If
   `RECURRING_EXPENSE_SERVICE_ROLE_KEY` is set, the worker expects that value;
   otherwise it expects `SUPABASE_SERVICE_ROLE_KEY`.
2. Ensure `SUPABASE_URL` and a valid service-role key are available to both
   functions. Both prefer `RECURRING_EXPENSE_SERVICE_ROLE_KEY` when configured,
   otherwise they use the platform-provided `SUPABASE_SERVICE_ROLE_KEY`.
   Set `EXPO_ACCESS_TOKEN` on both only if Expo push security is
   enabled. Never put credentials in source, logs, or client configuration.
3. Enable Supabase Cron and `pg_net`, and store the project URL and service role
   key in Vault. Schedule the following job with the actual Vault secret names:

   ```sql
   select cron.schedule('process-push-receipts', '* * * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
         || '/functions/v1/process-push-receipts',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
         'Authorization', 'Bearer ' ||
           (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
       ),
       body := '{}'::jsonb
     );
   $$);
   ```

   Configure this separately in each environment; don't put credentials or the
   scheduling command into a migration. See the existing
   [recurring scheduler guide](recurring-expense-scheduler.md) for operations.

## Testing and operations

With a consenting recipient, create a regular expense and check that the
recipient's row appears in `push_receipt_checks`. After 15 minutes, check its
`outcome` and `error_code` and ask whether it appeared on their device. An
accepted receipt means Apple or Google accepted the handoff, not that a device
displayed it. A missing receipt is retried after its five-minute lease and
expires after 23 hours. Checked rows are retained for seven days; their token
snapshots are removed as soon as they are checked or expire. Restrict database
access because pending rows contain token snapshots.

If rows remain pending, check the Cron job, the worker's HTTP status and
function logs. Storage failures are logged by the sending function. Expo
ticket-level rejections are logged as safe error codes; `DeviceNotRegistered`
also clears the matching current token. Do not retry an entire sent batch just
because tracking failed, since that could produce duplicate notifications.

Previously deployed function logs may contain device tokens. Restrict access
to those logs and follow the project's retention policy.

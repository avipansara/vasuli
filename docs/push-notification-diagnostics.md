# Push notification diagnostics

The app's expense creation and settlement notifications are queued in
`push_notification_outbox` as part of the database write. The private
`process-push-receipts` worker is woken as soon as new rows commit, sends them,
and records accepted Expo tickets in
`push_receipt_checks`. It checks those tickets and tickets from
`send-push-notification` after 15 minutes, stores the outcome and error code, and clears an unregistered
token only if it still matches the token used for the notification. Tokens are
never written to function logs. Recurring expenses use a separate sending path;
after deploying `20261113070000_secure_recurring_scheduler.sql` and the updated
recurring worker, their tickets are checked by the same receipt worker. A failed
outbox send is retried after five minutes, up to ten attempts; missing tokens
are skipped. A lost response after Expo accepts a push can lead to a duplicate.
If the immediate wake-up fails, the scheduled worker picks up the pending rows.
The wake-up contains a short-lived, one-use nonce and no service-role key;
the worker uses its server-side key for database access.

The expense record and initial splits are separate database requests. The
expense notification is enqueued when the initial split insert succeeds.

## Setup for each Supabase environment

1. Apply `20261113040000_push_receipt_tracking.sql` before deploying the
   updated `send-push-notification` and new `process-push-receipts` functions.
   Review the currently deployed function before replacing it. The worker
   accepts only the configured scheduler bearer token; its gateway JWT
   verification is disabled in `supabase/config.toml`. If
   `RECURRING_EXPENSE_SERVICE_ROLE_KEY` is set, the worker expects that value;
   otherwise it expects `SUPABASE_SERVICE_ROLE_KEY`.
   For transaction-backed notifications, also apply
   `20261113050000_transactional_push_outbox.sql` before deploying the updated
   `process-push-receipts` worker. Apply
   `20261113060000_immediate_push_wakeup.sql` for immediate wake-ups. Coordinate that worker deployment with the
   app update that removes client-side sends: older app versions will otherwise
   send duplicate expense or settlement notifications. This rollout assumes
   all users move to the new app version together.
2. Ensure `SUPABASE_URL` and a valid service-role key are available to both
   functions. Both prefer `RECURRING_EXPENSE_SERVICE_ROLE_KEY` when configured,
   otherwise they use the platform-provided `SUPABASE_SERVICE_ROLE_KEY`.
   Set `EXPO_ACCESS_TOKEN` on both only if Expo push security is
   enabled. Never put credentials in source, logs, or client configuration.
3. Enable Supabase Cron and `pg_net`. After deploying the worker, configure the
   wake-up URL in each environment using an administrator connection. This URL
   is not a secret:

   ```sql
   insert into private.push_wakeup_config(singleton, worker_url)
   values (true, 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-push-receipts')
   on conflict (singleton) do update set worker_url = excluded.worker_url;
   ```

4. Configure the scheduled worker to use a single-use wake-up too. Replace any
   existing `process-push-receipts` schedule that sends a service-role key in
   HTTP headers, because those headers can be readable through `pg_net` tables.
   The following job handles retries and receipt checks once a minute:

   ```sql
   select cron.schedule(
     'process-push-receipts', '* * * * *',
     'select private.request_push_worker(true);'
   );
   ```

   Configure this separately in each environment and verify that the named job
   calls `private.request_push_worker(true)`. Do not embed credentials in the
   job. If an immediate wake-up fails, the scheduled worker retries. Missing
   URL configuration or a `pg_net` outage also prevents scheduled wake-ups, so
   monitor for pending deliveries and repair the configuration or service.

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
function logs. Check `push_notification_outbox` for failed rows, attempt counts,
and error codes. Rows at ten attempts require operator review. Storage failures
are logged by the sending function. Expo
ticket-level rejections are logged as safe error codes; `DeviceNotRegistered`
also clears the matching current token. Do not retry an entire sent batch just
because tracking failed, since that could produce duplicate notifications.
Check `net._http_response` for wake-up HTTP errors. Never log wake-up nonces.

Previously deployed function logs may contain device tokens. Restrict access
to those logs and follow the project's retention policy.

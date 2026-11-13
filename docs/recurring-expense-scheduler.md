# Recurring expense scheduler operations

`process-recurring-expenses` is a trusted Supabase Edge Function. It posts
eligible rules, then drains bounded activity, rule-notice, and occurrence push
outboxes. It does not use the app's expense service. Database commands recheck local 9:00
a.m. in each rule's saved time zone, so invoking the worker every minute posts
shortly after each rule reaches its due time.

## Preview and production setup

Repeat these steps independently for the preview and production Supabase
projects after deploying the migration and function:

1. Apply `20261113070000_secure_recurring_scheduler.sql` after the existing
   recurring-expense and push-receipt migrations, then deploy the updated
   `process-recurring-expenses` function. Gateway JWT verification remains
   disabled: the function accepts the server credential or a valid, single-use
   wake-up and rejects other requests before processing work. In production it
   prefers `RECURRING_EXPENSE_SERVICE_ROLE_KEY` and falls back to
   `SUPABASE_SERVICE_ROLE_KEY`.
2. Ensure `SUPABASE_URL` and a valid service-role key are available to the
   Edge Function. Set `RECURRING_EXPENSE_BATCH_SIZE` to an integer from 1 to 100
   if needed. Set `EXPO_ACCESS_TOKEN` only when Expo push security is enabled.
   Never put credentials in app configuration, SQL source, or logs.
3. Enable Supabase Cron and `pg_net`. Configure the worker URL for each project
   using an administrator connection. The URL is not a secret:

   ```sql
   insert into private.recurring_worker_config(singleton, worker_url)
   values (true, 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-recurring-expenses')
   on conflict (singleton) do update set worker_url = excluded.worker_url;
   ```

4. Replace the existing `process-recurring-expenses` job with the following
   one-minute schedule. Its one-use wake-up does not put the service-role key
   in `pg_net` request headers. Verify the job command after changing it:

   ```sql
   select cron.schedule('process-recurring-expenses', '* * * * *',
     'select private.request_recurring_worker();');
   ```

   Configure this separately in each environment. Deploy the migration and
   worker before switching the existing job, so recurring expenses keep posting.
   The nonce is visible to database roles that can read `pg_net`; it authorizes
   only one bounded worker run, expires after five minutes, and is not a database
   credential. A missed wake-up is retried on the next scheduled run.

5. Check `cron.job_run_details`, `net._http_response`, Edge Function logs, and
   the outboxes for operational status. A cron success only means the request
   was queued. The worker returns HTTP 503 when a batch is partially unsuccessful.
   Rule `last_error` and `last_error_at` expose temporary posting failures to
   the owner; invalid group, participant, or friendship state pauses that rule
   with a repair reason. Delivery rows retain attempt counts and last errors;
   push rows stop automatic retry after ten failed attempts for operator
   review.

Activity insertion and completion share one database transaction and have a
unique occurrence key. Push work uses per-recipient rows and a five-minute
lease so concurrent schedulers do not normally submit the same row. Expo
acceptance records a receipt for the push receipt worker to check later; it does
not mean that a device displayed the notification. A delivery with no registered
push token is recorded as skipped. Outages leave durable rows available for a
later scheduled retry. If Expo accepts a push but its ticket cannot be recorded,
a retry may send a duplicate.

Supabase's documented scheduling path is `pg_cron` plus `pg_net`, with
one-use wake-ups: [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [Cron](https://supabase.com/docs/guides/cron).

## Failure recovery and owner repair

Use the same checks independently in preview and production:

1. If `cron.job_run_details` shows failed or missing runs, check the Edge
   Function logs for authentication, timeout, or database errors. Confirm that
   the job is enabled and the worker URL is configured for this project.
   Correct the configuration, then wait for the next scheduled run. Posting is
   locked and idempotent, so retrying a run does not duplicate an occurrence.
2. Check active rules with `last_error_at` and the notification/activity
   outboxes for growing attempt counts or old pending rows. A transient posting
   error is retried by later runs. Outbox rows are durable and retryable; push
   rows at the ten-attempt limit need operator diagnosis before any retry
   policy change. Do not mark failed deliveries sent or delete them to clear a
   backlog.
3. If a rule is paused because its group was deleted, a saved group member left,
   or a direct friendship stopped being accepted, the owner must restore the
   group/friendship or edit the rule's participants. They can then resume it
   from Recurring expenses. Verify the saved participants and scope before
   resuming; the worker rechecks them before every post.
4. After an outage spanning more than two due dates, the worker posts at most
   two in order and pauses the rule for owner review. The owner sees the
   remaining due dates and explicitly posts or skips them in order. Skipped
   dates are never recreated. Once review finishes, the rule resumes from its
   next future date. Do not advance `next_due_on` manually or replay an
   occurrence by inserting an expense directly.
5. For support diagnosis, correlate the rule's `last_error` and
   `last_error_at`, `cron.job_run_details`, Edge Function logs, and delivery
   outbox attempt/error fields. Record the affected rule and environment in
   the incident notes, but never copy credentials or wake-up nonces.

After a recovery, confirm that the next scheduled run completes, the rule has
the expected next due date, no duplicate `(recurring_rule_id, scheduled_for)`
exists, and pending deliveries are progressing. A successful HTTP response
alone does not confirm device delivery; Expo acceptance only means Expo
accepted the push request.

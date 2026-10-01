# Recurring expense scheduler operations

`process-recurring-expenses` is a trusted Supabase Edge Function. It posts
eligible rules, then drains bounded activity, rule-notice, and occurrence push
outboxes. It
does not use the app's expense service. Database commands recheck local 9:00
a.m. in each rule's saved time zone, so invoking the worker every minute posts
shortly after each rule reaches its due time.

## Preview and production setup

Repeat these steps independently for the preview and production Supabase
projects after deploying the migration and function:

1. Deploy `process-recurring-expenses` to that project. Its function config
   disables gateway JWT verification because the function accepts only the
   exact `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` header. The
   handler rejects other credentials before making database requests.
2. Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available in the
   Edge Function environment. Set `RECURRING_EXPENSE_BATCH_SIZE` to an integer
   from 1 to 100 if the default batch size of 50 needs adjustment. Set
   `EXPO_ACCESS_TOKEN` only when Expo push security is enabled for the app.
   Never put these values in app configuration, SQL source, logs, or a checked
   in file.
3. Enable Supabase Cron and `pg_net` for the project. Store the project URL and
   service-role key in Supabase Vault, using distinct names for each
   environment. The URL is not secret, but storing both values together keeps
   the scheduled SQL identical across environments.
4. Schedule a one-minute `pg_cron` job that calls
   `/functions/v1/process-recurring-expenses` via `net.http_post`, sending
   `Content-Type: application/json`, `apikey`, and
   `Authorization: Bearer <service-role key>` headers. Use an empty JSON body.
   Read the URL and key from `vault.decrypted_secrets`; do not embed either
   value in the cron command. A representative SQL shape is:

   ```sql
   select cron.schedule(
     'process-recurring-expenses',
     '* * * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
         || '/functions/v1/process-recurring-expenses',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
         'Authorization', 'Bearer ' ||
           (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

   Replace the Vault secret names if the project uses different names. Do not
   run this example in source migrations; configure it separately for each
   hosted environment.
5. Check `cron.job_run_details`, Edge Function logs, and the outboxes for
   operational status. The HTTP worker response reports bounded counts only.
   Rule `last_error` and `last_error_at` expose temporary posting failures to
   the owner; invalid group, participant, or friendship state pauses that rule
   with a repair reason. Delivery rows retain attempt counts and last errors;
   push rows stop automatic retry after ten failed attempts for operator
   review.

Activity insertion and completion share one database transaction and have a
unique occurrence key. Push work uses per-recipient rows and a five-minute
lease so concurrent schedulers do not normally submit the same row. Expo
acceptance is recorded as sent; it means Expo accepted the message, not that a
device displayed it. A delivery with no registered push token is recorded as
skipped. Outages leave durable rows available for a later scheduled retry.

Supabase's documented scheduling path is `pg_cron` plus `pg_net`, with
credentials stored in Vault: [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [Cron](https://supabase.com/docs/guides/cron).

## Failure recovery and owner repair

Use the same checks independently in preview and production:

1. If `cron.job_run_details` shows failed or missing runs, check the Edge
   Function logs for authentication, timeout, or database errors. Confirm that
   the job is still enabled and that the Vault entries exist for this project.
   Correct the configuration, then invoke the function once with the project's
   service-role credential or wait for the next scheduled run. Posting is
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
   the incident notes, but never copy Vault values or authorization headers.

After a recovery, confirm that the next scheduled run completes, the rule has
the expected next due date, no duplicate `(recurring_rule_id, scheduled_for)`
exists, and pending deliveries are progressing. A successful HTTP response
alone does not confirm device delivery; Expo acceptance only means Expo
accepted the push request.

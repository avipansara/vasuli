# Feedback operations

Feedback is submitted by signed-in users to the `feedback` Edge Function. The
private `feedback_submissions` table contains the message, optional reply email
and screenshot, platform, app version, and notification status. It does not
contain the user's account ID. A separate rate-limit table temporarily holds
account IDs and is cleaned hourly after their one-hour window expires.

The screenshot is base64-encoded in the table so it is deleted in the same
transaction as the message. Only database administrators and the service role
can read feedback. It must not be included in analytics, logs, or notification
emails. For a screenshot, an administrator can export `screenshot_base64` from
the selected row and decode it locally as the type in `screenshot_type`.
Handle the export as sensitive and delete it after use.

## Deploy to each environment

1. Enable Supabase Cron and pg_net, apply the pending feedback migration, and
   deploy `feedback` and `feedback-worker`. The former verifies user JWTs; the
   latter accepts a service-role bearer token or a one-use scheduler wake-up.
2. Ensure `RESEND_API_KEY` is configured in the Edge Function secrets and the
   `support@split-space.com` sender is verified in Resend. The function sends
   emails containing the category and message to support and the maintainer.
   Email copies are not deleted by the database retention job. Resend acceptance is
   not proof of mailbox delivery.
3. Configure the retry worker URL and schedule using an administrator connection:

   ```sql
   insert into private.feedback_worker_config(singleton, worker_url)
   values (true, 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/feedback-worker')
   on conflict (singleton) do update set worker_url = excluded.worker_url;

   select cron.schedule('feedback-notification-retry', '*/5 * * * *',
     'select private.request_feedback_worker();');
   ```

   Do not put service credentials in SQL or pg_net headers. Wake-ups are single
   use and expire in five minutes. Cron queues the HTTP request; inspect
   `net._http_response`, function logs, and rows with `notified_at is null` to
   detect failures. Resend's idempotency key reduces duplicate messages; retries
   outside its idempotency window can still produce duplicates.
4. The migration schedules daily deletion of rows older than one year. Check
   `cron.job_run_details` for both retention and notification jobs and verify
   both recipients using a test submission. Backup retention is governed by the
   Supabase project's backup configuration and is separate from this job.
5. Rebuild the iOS and Android clients for the image-picker native dependency;
   an OTA update alone cannot add it to existing binaries.

The authenticated client keeps its message on an unsuccessful request and uses
one submission ID for unchanged retries. A response can be lost after storage;
retrying the same draft confirms the existing record. Support email remains
available if users cannot sign in or submit feedback.

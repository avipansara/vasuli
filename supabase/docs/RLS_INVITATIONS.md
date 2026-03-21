# Invitations RLS (Supabase)

## Why this matters

The mobile app updates `public.invitations` (accept, decline, cancel, resend). Row Level Security should ensure:

- **Invitees** can only change rows where `invitee_email` matches their account email.
- **Inviters** can only change rows they created (`inviter_id`).

## Constraint: `auth.uid()` and custom OTP

Supabase RLS can compare the caller to rows using **`auth.uid()`** (the JWT `sub` claim). That only works when the client uses a **Supabase Auth session** (JWT), not the bare **anon** key alone.

This project’s OTP flow stores the session in **AsyncStorage** and does **not** call `supabase.auth.setSession` with a Supabase-issued JWT. In that mode, requests use the **anon** role and **`auth.uid()` is `NULL`**, so policies like “invitee email = `users.email` for `auth.uid()`” **never match**.

So you have two paths:

### Path A — Tight RLS (recommended for production)

1. **Same UUID everywhere:** `auth.users.id` = `public.users.id` for every app user (standard Supabase pattern: create the auth user and insert `public.users` with the same `id`).
2. **After OTP verification**, establish a Supabase session, e.g.:
   - Use **Supabase Auth** (email OTP / magic link / password) for the same emails you already use, **or**
   - Use **`signInWithCustomToken`** / Admin API to mint a JWT whose `sub` equals `public.users.id`.
3. Apply the policies in `migrations/002_invitations_rls_policies.sql`.
4. Ensure the client uses that session for `supabase` requests (not only the anon key).

Then `auth.uid()` is stable and the migration’s policies apply.

### Path B — Keep permissive DB policies (current risk)

If you **cannot** attach a Supabase JWT to the client yet, strict row-level checks **cannot** run in Postgres for your app user. Options:

- Move sensitive writes to **Edge Functions** with the **service role** and validate identity in code (e.g. signed app token, or lookup session server-side), **or**
- Accept that RLS stays permissive until Path A is done.

Do **not** run `002_invitations_rls_policies.sql` until Path A is in place, or the app will lose permission to read/write invitations.

## Supabase RLS reference

Official guide: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — `auth.uid()` is `NULL` without a JWT; use `TO authenticated` / `(select auth.uid())` in policies; **UPDATE** requires a matching **SELECT** policy.

## Applying the migration

1. Open **Supabase Dashboard → SQL Editor**.
2. Paste and run `supabase/migrations/002_invitations_rls_policies.sql`.
3. Test accept / decline / cancel / resend from the app with an **authenticated** Supabase session.

## Policy summary (after migration)

| Action | Who |
|--------|-----|
| `SELECT` | Inviter (`inviter_id = auth.uid()`) or invitee (`invitee_email` matches `users.email` for `auth.uid()`) |
| `INSERT` | Inviter only (`inviter_id = auth.uid()`) |
| `UPDATE` | Invitee (email match) **or** inviter (`inviter_id = auth.uid()`) |
| `DELETE` | Inviter only (`inviter_id = auth.uid()`) |

`WITH CHECK` mirrors the same rules so users cannot reassign rows to someone else via updates.

# Invitations RLS (Supabase)

## Current model

The app now signs users in with Supabase email OTP. Supabase Auth owns the session
JWT (`auth.uid()`), while existing app data still uses `public.users.id` as the
domain user ID. Migration `007_users_auth_user_id.sql` bridges those IDs with:

```sql
public.users.auth_user_id -> auth.users.id
```

Migration `009_bridge_auth_rls_policies.sql` rebuilt invitation policies around
that bridge:

- authenticated callers are resolved to `public.users.id` through
  `users.auth_user_id = auth.uid()`
- invitees are matched by normalized `invitee_email`
- inviters are matched by `inviter_id`
Migration `011_remove_anon_transition_policies.sql` removed the temporary anon
policies, and `012_revoke_anon_app_table_grants.sql` revoked anon table grants,
so invitation access now requires a Supabase Auth JWT.
Migration `013_allow_email_matched_auth_bridge.sql` keeps strict JWT-backed
access while tolerating legacy public user rows with the same normalized email as
the Supabase Auth user.

## Policy summary

| Action | Authenticated access |
| --- | --- |
| `SELECT` | Inviter or invitee email owner |
| `INSERT` | Inviter only |
| `UPDATE` | Inviter or invitee email owner |
| `DELETE` | Inviter or invitee email owner |

`WITH CHECK` mirrors the same ownership rules so users cannot reassign
invitation rows to another account.

## Operational requirements

- Every active app user needs `public.users.auth_user_id` linked to their
  `auth.users.id`.
- Legacy duplicate public user rows are temporarily authorized by matching their
  normalized email to the Supabase Auth JWT email.
- App Review/demo accounts must be real Supabase Auth users.
- Old app builds that do not send a Supabase Auth JWT will not be able to read or
  write invitation rows.

## References

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

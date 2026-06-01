# Expenses RLS (Supabase)

## Current model

Expenses still reference app-domain users through `public.users.id` (`paid_by`,
`expense_splits.user_id`, settlement participants, group members). Supabase Auth
sessions identify callers through `auth.uid()`. Migration
`009_bridge_auth_rls_policies.sql` connects those worlds through:

```sql
public.users.auth_user_id -> auth.users.id
```

Migration `009_bridge_auth_rls_policies.sql` dropped the older broad public
policies and added authenticated policies that resolve the caller to their app
user ID before checking expense, split, settlement, friendship, group, and
activity rows. Migration `011_remove_anon_transition_policies.sql` removed the
temporary anon policies, and `012_revoke_anon_app_table_grants.sql` revoked anon
table grants, so database access now requires a Supabase Auth JWT.
Migration `013_allow_email_matched_auth_bridge.sql` keeps strict JWT-backed
access but allows legacy public user rows with the same normalized email as the
Supabase Auth user.

## Policy summary

| Table | Authenticated access |
| --- | --- |
| `expenses` | Visible to the payer, split participants, or members of the expense group. Writes are payer-only. |
| `expense_splits` | Visible when the parent expense is visible. Writes are payer-only. |
| `settlements` | Visible/writable by participants; group admins can update/delete group settlements. |
| `groups` | Readable to authenticated app users so group creation can return the inserted row; updates/deletes require group admin. |
| `group_members` | Visible to group members. Inserts require group admin, except the first self-membership when a group is created. |

Postgres requires a matching `SELECT` policy for `UPDATE ... RETURNING` and
PostgREST `.select()` calls after writes, so insert-returning flows are covered
explicitly.

## Operational requirements

- Every active app user needs `public.users.auth_user_id` linked to their
  `auth.users.id`.
- Existing data must continue using the linked `public.users.id`; do not create
  a new public user row when an email already exists.
- Legacy duplicate public user rows are temporarily authorized by matching their
  normalized email to the Supabase Auth JWT email.
- App Review/demo accounts must be real Supabase Auth users, because anon writes
  are no longer allowed.

## References

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

# Expenses RLS (Supabase)

## Why this matters

Expense **saves** (`INSERT`/`UPDATE` on `expenses`, `INSERT`/`UPDATE`/`DELETE` on `expense_splits`) should only be allowed for the right users: typically the **payer** and, for group expenses, **group members**.

## Constraint: `auth.uid()` and custom OTP

Same as [`RLS_INVITATIONS.md`](./RLS_INVITATIONS.md): **`auth.uid()` is only set when the client has a Supabase Auth JWT.** This app’s OTP flow often uses the **anon** key without `supabase.auth.setSession`, so **`auth.uid()` is NULL** for those requests.

- **Path A (production):** Use a Supabase session whose `sub` equals `public.users.id`, then **`authenticated`** policies apply and rows are enforced in Postgres.
- **Path B (current OTP + anon):** Migration **`004_expenses_rls_policies.sql`** adds **`anon`** policies that allow reads/writes (same risk as permissive RLS until Path A). Tight rules live under **`TO authenticated`**.

Do **not** remove anon policies until the app sends an authenticated JWT for Supabase.

## Policy summary (authenticated role)

| Table           | SELECT | INSERT | UPDATE | DELETE |
|-----------------|--------|--------|--------|--------|
| `expenses`      | Group members (for group expenses), or payer / split participants for friend-only (`group_id IS NULL`) | `paid_by` = `auth.uid()`, group membership if `group_id` set | Payer only, same group rules | Payer only |
| `expense_splits`| If parent expense is visible | Payer of parent expense | Payer of parent expense | Payer of parent expense |

**UPDATE** on `expenses` requires a matching **SELECT** policy (Postgres RLS).

## Applying the migration

1. Open **Supabase Dashboard → SQL Editor**.
2. Run `supabase/migrations/004_expenses_rls_policies.sql`.
3. If you use **Path A**, test create/update expense from the app with a real Supabase session.
4. If you still use **anon only**, confirm list/add expense still works (anon policies should allow it).

## References

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

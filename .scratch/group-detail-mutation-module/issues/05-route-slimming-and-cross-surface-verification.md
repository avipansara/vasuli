# 05 — Slim the Group detail route and verify mutation convergence

**What to build:** Group detail mutation policy is delegated to the mutation seam, while the route remains focused on presentation and navigation; realtime, focus refresh, loading, error, disabled, and appearance states remain consistent after every mutation.

**Blocked by:** 01 — Establish the Group detail mutation seam through Expense deletion; 02 — Move SettlementScopeTransfer reversal behind the mutation seam; 03 — Move GroupMember lifecycle mutations behind the seam; 04 — Move Group deletion behind the mutation seam.

**Status:** in-progress

- [x] The route no longer owns persistence, mutation guards, rollback, Activity, or notification orchestration for the covered mutations.
- [x] Group detail read-model state converges after local success, local failure, realtime changes, and focus refresh.
- [ ] Route-level tests cover mutation loading, disabled controls, alerts, navigation, and accessibility state.
- [ ] Loading, empty, error, disabled, multi-currency, light, and dark states are visually verified.
- [x] Focused tests, lint, Supabase function type checking, and the full test suite pass.

# Group Expense CSV Export

## Status update — 2026-08-19

Implemented in the current application. Group Stats exposes the
export action, the shared service produces the documented CSV contract, and
focused tests cover formatting and delivery behavior. Remaining work is manual
cross-platform verification of the native share sheet and web download.

## Problem Statement

Group members need a portable record of their shared expenses for budgeting,
reimbursement, and offline reference. The app currently displays group
expenses and statistics but does not provide a file export.

## Solution

Add an `Export CSV` action to the Group Stats screen. Any current group member
can export the group's expense history as a CSV file. The export is a flat,
one-row-per-expense ledger built from the existing group-detail data already
loaded by the client.

On iOS and Android, write the generated CSV to a temporary local file and use
the native file/share interface. On web, trigger a direct browser download.

## User Stories

1. As a group member, I want to export my group's expenses from Group Stats so
   that I can use the data outside Vasuli.
2. As a group member, I want payer, amount, currency, notes, and split details
   in the export so that the file is useful without opening the app.
3. As a group member, I want the export to open reliably in spreadsheet apps.
4. As a group member, I want the same export action to work on iOS, Android,
   and web.
5. As a group member, I want clear progress and retryable errors so that I
   know whether the file was created successfully.

## CSV Contract

The first row is the header. Columns appear in this order:

1. `Expense ID`
2. `Date`
3. `Description`
4. `Amount`
5. `Currency`
6. `Paid by`
7. `Category`
8. `Notes`
9. `Created date`
10. `Last updated date`
11. `Split details`

Rules:

- Emit one row for each expense in the group.
- Do not emit settlement rows.
- Use human-readable payer and split-member names resolved from the existing
  group-detail member/user data. Fall back to `Unknown` when a referenced user
  cannot be resolved.
- Format all dates as `YYYY-MM-DD`.
- Emit amounts as plain decimal values without currency symbols. Keep the
  currency code/name in `Currency`.
- Leave optional category and notes values empty when absent.
- Format `Split details` as readable semicolon-separated text, for example
  `Alice: $20.00; Bob: $15.00; Carlos: $15.00`.
- Escape commas, quotes, and line breaks according to CSV rules by quoting
  affected fields and doubling embedded quotes.
- Use comma delimiters, UTF-8 encoding, and a UTF-8 BOM for spreadsheet
  compatibility.
- Use the filename
  `<group-name>-expenses-YYYY-MM-DD.csv`, sanitizing characters that are not
  safe in filenames while preserving a readable group name.
- Preserve the currency value per row. Do not convert or combine currencies.

## Product Behavior

### Entry point and permission

- Add the action to the existing Group Stats screen.
- Every current group member may export; no new role or permission is needed.
- Use a stable accessibility label and test ID for the export action.

### Empty, loading, success, and failure states

- If the group has no expenses, show the action but keep it disabled with an
  explanatory accessibility label/message.
- While generating or delivering the file, show a loading state and prevent
  duplicate taps.
- On success, let the platform file/share UI take over. Do not create a
  database record or activity item for an export.
- If generation or delivery fails, show a clear error and a retry action.
- Treat user cancellation of the native file/share UI as a non-error dismissal
  where the platform exposes cancellation separately.

## Implementation Decisions

- Reuse `GroupDetailData` from `groupDetailService.getDetail`; do not add a new
  Supabase query or endpoint for export.
- Add a pure CSV serialization helper at a reusable library/service boundary.
  Its input should be the group name plus the loaded group expenses, splits,
  and member/user names; its output should be CSV text and a sanitized
  filename.
- Keep CSV escaping and date/amount formatting independently unit-testable.
- Add `expo-sharing` with `npx expo install expo-sharing` using the Expo SDK 57
  compatible version. Use the project's Expo FileSystem package and its SDK
  57-compatible write API for the temporary mobile file.
- On iOS/Android, check `Sharing.isAvailableAsync()`, write the temporary file,
  call `Sharing.shareAsync(localUri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' })`,
  and clean up the temporary file in a `finally` path when safe.
- On web, create a Blob/object URL, click a temporary download link with the
  agreed filename, and revoke the URL afterward. Do not use Expo Sharing for a
  local file URI on web.
- Keep platform-specific delivery behind one export service/helper so the
  Group Stats component only coordinates state and user feedback.
- Do not persist generated files, export history, or new permissions.

## Testing Decisions

- Add unit tests for the CSV serializer covering:
  - exact header order;
  - one row per expense;
  - payer and split-member name resolution;
  - optional empty fields;
  - ISO date formatting;
  - decimal amount formatting;
  - currency preservation;
  - readable split formatting;
  - commas, quotes, and newlines in user content;
  - UTF-8 BOM and filename sanitization.
- Add tests for empty expense input and mixed currencies.
- Add focused UI/integration coverage where practical for disabled empty state,
  loading/duplicate-tap protection, successful export invocation, and retryable
  failure behavior.
- Mock platform file/share APIs rather than asserting private component state or
  native UI internals.
- Run the project's lint, Supabase typecheck, and Vitest suite before handoff.

## Out of Scope

- Exporting settlements as rows.
- PDF, XLSX, JSON, or scheduled exports.
- Emailing or uploading exports to cloud storage.
- Currency conversion or cross-currency aggregation.
- New database tables, RLS policies, or export activity records.
- Editing, deleting, or recalculating historical expenses.

## References

- [Expo Sharing, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/)
- [Expo FileSystem legacy API, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem-legacy/)

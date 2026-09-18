# Financial-integrity migration

Run `20260918_financial_integrity.sql` and then
`20260918_delete_household.sql` after `../schema.sql` for a fresh database, or
run both in that order against an existing HomeBase database through the
Supabase SQL editor / migration runner before deploying this version of the app.

The migration deliberately tightens row-level security: the financial plan,
expenses, shares, bill payments, voids, and reimbursements are written through
validated database functions so a client cannot partially save a transaction or
change financial history. Apply it in a maintenance window and verify existing pending bills:
legacy bill rows without a category or payer must be completed (or replaced)
before they can be marked paid.

Take a database backup first. Do not manually edit the new ledger records to
correct an error—record a new correcting expense or reimbursement instead.

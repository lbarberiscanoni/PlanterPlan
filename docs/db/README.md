# Database Source of Truth

PlanterPlan uses a standard local Supabase baseline migration plus a generated schema snapshot.

## Canonical Files

- `supabase/migrations/20260426000000_baseline_schema.sql` is the fresh-clone baseline used by local bootstrap and CI database tests.
- `docs/db/schema.sql` is the generated schema snapshot mirror used for review and schema-source tests.
- `src/shared/db/database.types.ts` is generated from the local database after the baseline is replayed.
- `supabase/seeds/02_production_templates.sql` is the deterministic template seed file.
- `docs/db/migrations/` records historical/incremental migration work from before the baseline. These files are not the fresh-clone replay path.

## Local Bootstrap

Use:

```bash
npm run db:local:bootstrap
```

The wrapper starts local Supabase, resets the local `public` schema only, applies `supabase/migrations/*.sql` in filename order, applies `supabase/seeds/02_production_templates.sql`, and runs schema reality checks.

Use:

```bash
npm run db:local:test
```

to run the same bootstrap plus pgTAP tests.

## Important Notes

- `supabase/config.toml` has automatic seed execution disabled so `supabase start` does not try to seed before the schema exists.
- New forward migrations should go under `supabase/migrations/`.
- Keep `docs/db/schema.sql` and `src/shared/db/database.types.ts` in sync with the local database after migration changes.
- `supabase start` alone only starts services. Use `npm run db:local:bootstrap` or `npm run db:local:test` when you need schema, seed, and DB reality checks.

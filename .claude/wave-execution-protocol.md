# Wave Execution Protocol — HALT conditions and enforcement

**Audience**: any agent (Sonnet 4.6, Opus 4.7, future) executing the wave plans in `.claude/wave-N-prompt.md`.

**Purpose**: every wave plan references this file. It defines the **non-negotiable halt conditions** at each phase of wave execution. The wave plans describe WHAT to build; this file describes WHEN to STOP and WHY.

**Read this file once at the start of every wave.** Then execute the wave plan referring back to this protocol whenever a gate is hit.

---

## 1. Hierarchy of execution

Each wave runs in this strict order. **A failed gate at any level halts execution at that level. You may not skip ahead.**

```
Wave N
├── Pre-flight verification          ── HALT if any fact is wrong
├── Task 1
│   ├── Implementation
│   ├── Tests (NEW + extending)      ── HALT if not passing
│   └── Per-task verification gate    ── HALT if any check fails
│       └── PR opened (or commit if no PR workflow)
├── Task 2 ... N (same shape)
├── Documentation Currency Pass       ── HALT if any doc edit missed
├── Wave Review                       ── HALT if any checklist item is "no"
└── Commit & Push to Main             ── HALT if any final-gate check fails
       └── Wave N+1 may begin
```

**Halt** means: stop work, surface the failure to the user with full context (the failing command + output), do NOT continue to the next sub-step. **It does not mean "fix and continue silently."** A halt is a synchronization point with the human operator.

---

## 2. Pre-flight verification (per wave)

Every wave plan opens with a "Pre-flight verification" section. **This is a HALT gate.**

Each numbered item in Pre-flight is a fact assertion (file exists, function is exported, schema column is present, env var is set). For each item:

- **Verify it.** Don't assume.
- If the assertion is **TRUE**, continue to the next item.
- If the assertion is **FALSE**, **HALT.** Surface the failure to the user. The wave plan was written against a snapshot; if the snapshot has drifted, the rest of the plan may be wrong.

**Common pre-flight halt scenarios**:
- A file path the wave plan modifies has been renamed or moved.
- An exported function name has changed.
- A migration referenced as already-shipped is missing.
- A dep version pin doesn't match `package.json`.
- An env var is unset that the wave depends on (Stripe keys, VAPID keys, AWS creds, etc.).

**Do NOT auto-fix pre-flight failures.** They indicate a planning/reality mismatch that needs human reconciliation.

---

## 3. Per-task testing protocol (BLOCKING)

The most critical halt gate. Sonnet 4.6 has been observed treating partial test failures as warnings. **They are not warnings. They are halts.**

Every task in every wave plan has a "Tests" sub-step. Treat it as a peer to "Implementation," not as a follow-up.

### 3.1 Reading order

Before writing any task code, read **`.claude/wave-testing-strategy.md`** for the wave you're executing. The strategy doc lists:

- Existing tests at risk for THIS wave
- New tests to add for THIS wave
- New test infrastructure (factories, mocks, fixtures) to build for THIS wave
- E2E persona / seed evolution for THIS wave

The wave plan describes WHAT to test; the strategy doc describes WHICH EXISTING TESTS WILL BREAK and what infrastructure to build first.

### 3.2 Test-add ordering within a task

For each task:

1. **Build/extend test infrastructure first** if the strategy doc lists any (factories, mocks, setupTests changes). The infrastructure unblocks both the new tests AND the existing-test mocks.
2. **Update existing tests at risk SECOND** — add the mock injections the strategy doc identifies. Run `npm test` after this step to confirm existing tests still pass before you write the implementation. If they don't pass, you've miscalculated the mock or the strategy doc has drift — HALT.
3. **Implement the task code THIRD.**
4. **Add new tests FOURTH.**
5. **Run `npm test` again FIFTH.** All tests must pass — both extended-existing and brand-new.

This ordering prevents the common Sonnet failure mode of: implement code → write new tests → discover existing tests broke → fix existing tests → discover the implementation also needs tweaking → ad-hoc cycle.

### 3.3 Test count discipline

Every wave plan's Session Context declares a starting test baseline (`Wave N-1 shipped at ≥X tests`). After every task:

- **Test count must be ≥ baseline + new-tests-added-this-task.** If `npm test` reports fewer tests than expected, a test file was deleted or skipped — HALT and reconcile.
- **Pass rate must be 100%.** Even ONE failing test is a halt. "Skipped" tests via `it.skip` or `describe.skip` are NOT acceptable as a workaround — they count as halt-deferring shortcuts.
- **Snapshot updates** require a manual review of the diff. Don't run `npm test -- -u` blindly. Each snapshot diff is reviewed against the wave's intended changes; if the diff includes anything outside the intended change, HALT.

### 3.4 Test types this protocol covers

- **Unit tests** (`Testing/unit/**`) — every wave's primary gate. `npm test`.
- **E2E scenarios** (`Testing/e2e/**`) — required only for waves that touch the personas, the seed script, or the global setup (Wave 34 admin persona; Wave 33 `/daily` → `/tasks` redirect smoke). For other waves, E2E is informational.
- **Manual smoke tests** documented in each wave plan — these are not optional. Walk them. If a smoke fails, HALT.

### 3.5 What test-failure HALT looks like in practice

If `npm test` reports `5 failed | 645 passed`:

1. **Do NOT push the branch.**
2. **Do NOT mark the task complete.**
3. Run `npm test -- --reporter=verbose` (or open the failing test files directly) and identify the cause for each.
4. For each failure, decide:
   - **It's an existing test that broke from your changes** → extend the test (add the new mock, update the assertion to match the new component shape per the testing-strategy doc). Re-run.
   - **It's a new test you wrote that has a bug** → fix the test or the implementation. Re-run.
   - **It's an unrelated flake** → re-run once. If still failing on a re-run, it's not a flake; treat as one of the above.
5. Repeat until 100% pass rate.
6. If you cycle 5 times without resolution, surface the failures to the user. **Do not push partial-passing tests as "good enough."**

---

## 4. Per-task verification gate (BLOCKING)

Each wave plan has a `## Verification Gate (per task, before push)` section with these commands:

```bash
npm run lint      # 0 errors required (≤7 pre-existing warnings tolerated). FAIL → HALT.
npm run build     # clean tsc -b && vite build. FAIL → HALT.
npm test          # 100% pass rate; count ≥ baseline + new tests. FAIL → HALT.
git status        # clean (no uncommitted changes other than the task's intended commit). FAIL → commit/stash, then re-run gate.
```

Plus the wave-specific manual smokes documented in each plan.

**Each command is a hard halt.** Do not push, do not open a PR, do not advance to the next task or sub-step until every check is green.

If `npm run lint` introduces new warnings (above the baseline of 7), that's a halt — don't widen the warning baseline silently. Either fix the warning or surface to the user with justification.

---

## 5. Documentation Currency Pass (BLOCKING)

Each wave plan has a `## Documentation Currency Pass` section listing every doc file to edit. **Every item is required.** Skipping a doc edit is a halt condition discovered at the next wave's pre-flight (when its `Session Context` references the prior wave's doc state).

The docs sweep runs as a single commit (or per-task split per the wave plan) AFTER all task PRs merge but BEFORE the wave-push gate. Order:

1. Apply every doc edit in the wave plan's "Documentation Currency Pass" section.
2. Run `npm run lint && npm run build` (no test rerun needed — docs don't affect tests).
3. Commit as `docs(wave-N): documentation currency sweep`.
4. Then proceed to Wave Review.

If any doc edit is unclear or seems wrong, HALT and surface to the user. Don't guess at doc semantics; the architecture docs are SSoT and must reflect reality.

---

## 6. Wave Review (BLOCKING)

Each wave plan has a `## Wave Review` checklist. Walk every item. **For each item that's "no":**

1. Identify what's missing.
2. Either fix it (if the fix is small and obvious) or HALT and surface.
3. Re-run the verification gate after any fix.

The Wave Review's "test-impact reconciliation" item (added by the testing-strategy cross-ref) is critical: confirm every existing test the strategy doc identified as at-risk for THIS wave has been mocked/extended and is passing.

**The Wave Review is a self-PR-review pass.** Treat it like reviewing someone else's code. Be skeptical. Read your own diffs.

---

## 7. Commit & Push to Main (BLOCKING — final gate)

Each wave plan has a `## Commit & Push to Main` section. The final gate before the wave is "done" and the next wave may begin. Sequence:

1. `git checkout main && git pull && npm install`
2. **Final verification gate** — run all four commands again on a fresh `main`:
   ```bash
   npm run lint     # FAIL → HALT, fix on a fix branch, re-merge
   npm run build    # FAIL → HALT
   npm test         # FAIL → HALT
   git status       # FAIL → commit/stash
   ```
3. `git push origin main`
4. **If a CI pipeline exists**, wait for it. If CI fails, HALT — do NOT mark the wave complete. Fix on a hotfix branch.
5. Confirm the next wave's Session Context recap reflects what's actually on main (commit SHAs match, table of shipped items matches reality).

**Only after step 5 may you declare the wave complete.** Do not start the next wave's pre-flight verification until this gate is fully green.

---

## 8. Special-case halts

### 8.1 Database migration failures

If a migration fails to apply (`supabase db push` errors, or `psql` raises on the migration SQL):

- **HALT immediately.** Do not modify the migration SQL inline; surface the error to the user with the exact failure.
- Do NOT push a half-applied migration to main.
- Do NOT manually run partial migration steps to "make it work."
- The migration must apply cleanly end-to-end OR the wave plan's DDL is wrong (planning/reality mismatch — surface).

### 8.2 RLS policy regressions

If the manual `psql` smoke for a wave's RLS migration shows different behavior than the plan documents (e.g., a user CAN access a row they shouldn't):

- **HALT.** RLS regressions are security regressions.
- Do not push the wave.
- Surface the smoke output and the policy SQL to the user.

### 8.3 Type drift after `database.types.ts` hand-edits

Several waves hand-edit `src/shared/db/database.types.ts` (Wave 23/24/25 precedent; Waves 26/27/30/32/34/35/36/37 all do too). If `npm run build` fails because the hand-edited types are inconsistent with the rest of the code:

- **HALT.** The type block is the contract; if it's wrong, every consumer is wrong.
- Re-read the migration's column types and reconcile the type block.
- **Do NOT** run `npm run generate:types` (or any equivalent regen script) — it would overwrite the wave's hand additions.

### 8.4 E2E persona drift

If `Testing/e2e/global-setup.ts` fails to log in a persona:

- HALT (per the global-setup graceful-failure pattern, the persona's `.auth.json` will be empty).
- Surface the failure. Don't proceed with E2E using a broken persona — every test using that persona will spuriously fail.

### 8.5 Cron schedule confusion (Wave 30)

Multiple waves add cron-driven edge functions. **`pg_cron` is intentionally NOT enabled.** If a wave plan's smoke test instructs you to "schedule via pg_cron," that's a planning error — `docs/operations/edge-function-schedules.md` is the source of truth. Use Supabase Scheduled Triggers OR an external scheduler. Surface any pg_cron mention to the user.

---

## 9. Acknowledgment for Sonnet 4.6 (or any inferior model)

If you are reading this and you are not Opus 4.7-Max:

- The wave plans were written assuming the constraints in this protocol are enforced.
- If you skip a halt gate "because the work seems obvious," you will probably ship a regression.
- If you treat test failures as warnings, you will discover the regressions in the NEXT wave's pre-flight when the test count is wrong.
- If you cycle past 5 attempts without surfacing to the user, you are violating the styleguide debugging cap.
- The user has explicitly chosen to trust this protocol over agent intuition. Honor that choice.

---

## 10. Verification: this protocol itself

This document claims certain commands and patterns. If any are wrong on the actual `main`, the protocol has drifted. Before relying on it:

```bash
# Verify the test command
grep '"test"' package.json   # expect: "test": "vitest --run"

# Verify the build command
grep '"build"' package.json  # expect: "build": "tsc -b && vite build"

# Verify the lint command
grep '"lint"' package.json   # expect: "lint": "eslint ."

# Verify pg_cron stance
cat supabase/functions/nightly-sync/README.md | grep -i 'pg_cron\|scheduled'
```

If any check fails, surface the divergence to the user before proceeding. The protocol must reflect reality.

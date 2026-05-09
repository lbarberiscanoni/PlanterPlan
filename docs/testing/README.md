# Testing Documentation

Testing artifacts live here so the repository root stays focused on entrypoint
files and tool-specific instructions.

* [strategy.md](strategy.md): current testing strategy and validation commands.
* [release-readiness-ledger.md](release-readiness-ledger.md): final
  release-hardening validation ledger, accepted risks, and deployment blockers.
* [release-regression-closeout.md](release-regression-closeout.md): current
  release-hardening coverage matrix and contradicted/non-gate items.
* [implementation-plan.md](implementation-plan.md): historical phased plan that
  drove the current `Testing/` layout.
* [gap-findings.md](gap-findings.md): historical E2E coverage-gap audit.

Executable tests remain under `Testing/`, `supabase/tests/`, and the relevant
package scripts in `package.json`.

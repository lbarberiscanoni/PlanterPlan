# PlanterPlan

PlanterPlan is a specialized, phase-based project management application designed to guide Church Planters through the complex lifecycle of launching a new organization.

## 📚 Application Architecture (Single Source of Truth)
PlanterPlan's business logic, state machines, and data models are strictly defined in domain-specific documentation. **Do not rely on scattered notes or legacy architecture files; the following files represent the ground truth:**

* [Auth & RBAC](docs/architecture/auth-rbac.md)
* [Dashboard & Analytics](docs/architecture/dashboard-analytics.md)
* [Date Engine](docs/architecture/date-engine.md)
* [Library & Templates](docs/architecture/library-templates.md)
* [Projects & Phases](docs/architecture/projects-phases.md)
* [Tasks & Subtasks](docs/architecture/tasks-subtasks.md)
* [Team Management](docs/architecture/team-management.md)
* [Product Specification](spec.md)

## ⚙️ Operations & Database
Guidelines for local development, database structure, and safe deployment protocols.

* **Database:** [Schema Definitions](docs/db/schema.sql) | [One-Time Setup](docs/db/one_time_setup.sql)
* **Workflows:** [Local Development Guide](docs/operations/local_development.md) | [Safe Migration Protocol](docs/operations/SAFE_MIGRATION.md)
* **Decisions:** [Architecture Decision Records (ADRs)](docs/ADR/)

## 🤖 Automated Development Context
Directives and context constraints specifically formatted for AI agents and automated development environments.

* [Agent Context Directives](docs/AGENT_CONTEXT.md)
* [Repository Context Map](repo-context.yaml)

## 🧪 Testing & Validation
* [Testing Documentation Index](docs/testing/README.md)
* [Testing Strategy](docs/testing/strategy.md)
* [Testing Implementation Plan](docs/testing/implementation-plan.md)
* [Testing Gap Findings](docs/testing/gap-findings.md)

## 🚀 Quick Start
```bash
npm install
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + Vite production build
npm test             # Vitest unit/integration tests
```

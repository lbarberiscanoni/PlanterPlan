# Testing Strategy & Guidelines — PlanterPlan

> **Documentation location:** Testing documentation lives in `docs/testing/`.
> Executable tests live under `Testing/` and `supabase/tests/`.

## 1. Overview & Core Philosophy

PlanterPlan employs a comprehensive testing strategy combining focused unit/integration tests with robust end-to-end (E2E) validation. Our goal is to ensure type safety, API contract adherence, and visual consistency across all user workflows.

The testing strategy prioritizes the absolute stability of the application's core business logic, hierarchical data integrity, and strict Role-Based Access Control (RBAC). Given the complex nature of the drag-and-drop system and cascading date logic, automated tests act as the primary safety net against regressions. All tests must align with the definitive invariants defined in the `docs/architecture/` Single Source of Truth (SSoT).

## 2. E2E Testing Strategy (Playwright)

We use a **dual-assertion E2E strategy** combining:

1. **DOM-based assertions** via Playwright selectors (fast, precise).
2. **Vision-based assertions** via Gemini 3.5 Flash API (resilient to DOM changes, catches visual regressions).

Tests are authored in **BDD (Gherkin)** using `playwright-bdd` and executed via Playwright.

### Selector Hierarchy

When writing selectors in Page Object Models (POMs), follow this priority order:

| Priority  | Selector Type                  | Example                                    | When to Use                             |
| --------- | ------------------------------ | ------------------------------------------ | --------------------------------------- |
| 1         | `getByRole()`                  | `getByRole('button', { name: /save/i })`   | Buttons, links, headings, form elements |
| 2         | `getByLabel()` / `getByText()` | `getByLabel(/email/i)`                     | Form inputs, text content               |
| 3         | `getByPlaceholder()`           | `getByPlaceholder(/search/i)`              | Search inputs, text fields              |
| 4         | `[data-testid="..."]`          | `locator('[data-testid="stats-card"]')`    | Custom components, repeated elements    |
| 5         | ARIA attributes                | `locator('[role="dialog"]')`               | Dialogs, switches, tabs                 |
| **NEVER** | CSS classes                    | ~~`.animate-spin`~~, ~~`.text-red-500`~~   | Tailwind classes change frequently      |
| **NEVER** | Complex CSS                    | ~~`button:has(svg)`~~, ~~`#el ~ p.class`~~ | Fragile to DOM restructuring            |

### Key Rules

- **Prefer semantic selectors** (role, label, text) over structural ones.
- **Add `data-testid`** to components that lack semantic anchors.
- **Add `aria-label`** to icon-only buttons for accessibility and testability.
- **Scope selectors** to parent containers: `dialog.getByRole('button')` instead of `page.locator('button')`.

### Vision-Based Testing

- **Pillar tests**: Critical 80/20 journeys use dual DOM + vision assertions.
- **Visual regression**: Catches layout shifts, component visibility issues, and responsive bugs.
- **Requirements**: `GEMINI_API_KEY` is required (gracefully skipped if absent).

## 3. Unit & Integration Testing (Vitest)

We utilize Vitest for low-level logic, utility functions, and component unit tests.

### Strategy & Frameworks

- **Design-by-Contract (DbC)**: Ensuring all inputs/outputs strictly match `database.types.ts`.
- **Iterative Prompt-Driven Development (IPDD)**: Step-by-step verified code generation.
- **TypeScript Strictness**: `any` and `unknown` must be replaced with strict definitions.

### Development Workflow

1. **Pre-Refactor Baseline**: Run `npm test` to ensure stability.
2. **TypeScript Check**: Run `npx tsc --noEmit` to verify type safety.
3. **Automated Verification**: Run full test suites (`npm test` and `npm run test:e2e`) after modifications.
4. **Architectural Evaluation**:
   - Check against `rules.md` (eradication of `any/unknown`, strict FSD lateral bans).
   - Verify zero raw `new Date()` usage (use `shared/lib/date-engine`).
5. **Linting**: Run `npm run lint` to verify boundary and import hygiene.

### Rollback Condition

If tests fail or architectural rules are violated, execute the debug loop workflow: `.antigravity/workflows/05-debug-loop-5.md`

## 4. Project Structure & Coverage

### E2E Directory Map

```text
Testing/e2e/
├── features/           ← Gherkin .feature files (18 domains)
│   ├── accessibility/  ├── auth/           ├── daily/
│   ├── dashboard/      ├── date-engine/    ├── error-states/
│   ├── form-validation/├── home/           ├── library/
│   ├── mobile/         ├── navigation/     ├── onboarding/
│   ├── pillar-tests/   ├── project/        ├── reports/
│   ├── settings/       ├── tasks/          └── team/
├── steps/              ← Step definitions (.steps.ts)
├── pages/              ← Page Object Models (POMs)
├── fixtures/           ← Test data and auth states
└── helpers/            ← Utilities (vision, toast, wait)
```

### Role-Based Test Users

Seeded E2E account definitions live in `Testing/e2e/fixtures/test-data.ts`.
Do not duplicate passwords in documentation; update the fixture and local test
seed data together when role accounts change.

### Available Test Scripts

- `npm test`: Runs Vitest suite (Unit/Integration).
- `npm run test:e2e`: Standard E2E run (Playwright + BDD).
- `npm run test:e2e:mobile`: Mobile-specific tests (Pixel 7 viewport).
- `npm run test:e2e:vision`: Vision-enhanced tests (requires `GEMINI_API_KEY`).
- `npm run test:e2e:a11y`: Accessibility-specific tests.
- `npm run test:e2e:headed`: Runs E2E tests in a headed browser for debugging.

## 5. Domain-Specific Testing Guidelines (SSoT Alignment)

Tests must be strictly organized around the core business domains defined in `docs/architecture/`.

### 5.1 Date Engine & Cascading Dates
* **Extreme Scrutiny Required:** The date engine calculates cascading offsets.
* **Invariants:** * Shifting a Project's Target Launch Date MUST shift all child task dates.
    * Subtasks cannot possess dates outside their parent's bounding box.
    * Sibling drag-and-drop must auto-adjust relative start/end dates.

### 5.2 Tasks, Subtasks & Dependencies
* **Strict Invariants:**
    * **Max Subtask Depth:** Tests MUST verify that dropping a task into an existing subtask is rejected visually and functionally (Depth = 1 max).
    * **Cycle Detection:** Tests MUST verify that a parent cannot be dropped into its own child.
    * **Dependencies:** Verify that dependent tasks cannot be completed out of sequence without triggering the appropriate UI warnings.

### 5.3 Projects & Phases
* **Invariants:**
    * Deleting a project MUST result in a cascading hard-delete of all sub-items.
    * Checkpoint-based project phases MUST NOT unlock until the prior phase reaches 100% completion.

### 5.4 Auth & RBAC
* Tests must explicitly validate the `Project Role Permission Matrix`. 
* Verify a `Limited User` cannot edit tasks unless their `assignee_id` matches the task.
* Verify a `Coach` can only edit tasks explicitly tagged for coaching.
* Verify generic error states for invalid login credentials.

### 5.5 Library & Templates
* Verify that `origin = 'template'` tasks are never mixed with `origin = 'instance'` tasks in the active dashboard queries.
* Verify that instantiating a template deep-clones the entire task tree seamlessly.
* Verify that Template items lack Date Engine urgency tracking.

## 6. CI/CD Integration

* All PRs must pass the `npm run build` step (which includes strict TypeScript type-checking).
* All Vitest unit tests must pass.
* The Playwright E2E suite will run against a seeded, ephemeral Supabase instance to ensure zero cross-contamination between test runs.

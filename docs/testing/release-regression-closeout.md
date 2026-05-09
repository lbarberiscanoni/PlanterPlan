# Release Regression Close-Out

This document records the PR20 coverage close-out as of 2026-05-09, after PR
#255. It maps the release-hardening checklist to executable coverage on current
`main` and calls out items contradicted by the architecture SSoT.

## Coverage Matrix

| Release concern | Current automated evidence | Status |
| --- | --- | --- |
| Auto-completion workflow | `Testing/e2e/features/release/critical-regressions.feature`; `Testing/e2e/steps/release-regressions.steps.ts`; `supabase/tests/pgtap_completion_rollups.sql`; `Testing/unit/shared/api/planterClient.updateStatus.syncflags.test.ts` | Covered |
| Child completion and parent rollups | Same release E2E scenario plus `supabase/tests/pgtap_completion_rollups.sql` | Covered |
| Date rollups and parent/child date envelopes | `Testing/e2e/features/release/critical-regressions.feature`; `supabase/tests/pgtap_task_date_envelope.sql`; `Testing/unit/shared/lib/date-engine/business-calendar.test.ts`; `Testing/unit/supabase/functions/_shared/date.test.ts` | Covered |
| Phase unlocking | `Testing/e2e/features/release/critical-regressions.feature`; DB phase-unlock triggers remain characterized by the release scenario | Covered |
| Dependency warning prompts | `docs/architecture/tasks-subtasks.md` states that `task_relationships` power relationship display and link management only; there is no trusted dependency-order completion warning or dependency-date enforcement in the current implementation. | Contradicted by current SSoT; not a release gate |
| Task hierarchy drag/drop rejection | `Testing/e2e/features/release/critical-regressions.feature` verifies DB/API rejection for invalid hierarchy writes; unit coverage verifies UI move/drop guard helpers. | Covered below UI; UI drag/drop E2E remains legacy, not release gate |
| Permission-denied coach/member/admin paths | `Testing/e2e/features/release/critical-regressions.feature`; `supabase/tests/pgtap_task_role_matrix.sql`; `supabase/tests/pgtap_coach_rbac.sql`; `supabase/tests/pgtap_admin_moderation.sql` | Covered |
| Notification/mention happy path | `Testing/e2e/features/release/critical-regressions.feature`; `supabase/tests/pgtap_comment_author_mentions.sql`; `Testing/unit/features/tasks/lib/comment-mentions.test.ts` | Covered |
| Calendar token revocation | `Testing/e2e/features/release/critical-regressions.feature`; `supabase/tests/pgtap_ics_feed_tokens.sql`; `Testing/unit/supabase/functions/ics-feed.handler.test.ts` | Covered |
| Blank project creation | `Testing/e2e/features/dashboard/create-project.feature` `@release` scenario; `supabase/tests/pgtap_project_baseline.sql` | Covered |
| Official-template project creation and no template-note-copy | `Testing/e2e/features/dashboard/create-project.feature` `@release` scenario; `supabase/tests/pgtap_template_stale_consistency.sql`; `supabase/tests/pgtap_template_scaffold_immutability.sql` | Covered |
| Admin authorization denial | `Testing/e2e/features/release/critical-regressions.feature`; `Testing/unit/pages/admin/AdminLayout.test.tsx` | Covered |
| Mobile task movement fallback | `Testing/unit/features/tasks/components/TaskItem.dueBadge.test.tsx`; `Testing/unit/features/tasks/lib/task-move-options.test.ts`; `npm run test:e2e:mobile` covers the mobile viewport suite | Covered by unit and mobile smoke |
| Accessibility dialog/focus smoke | `Testing/e2e/features/accessibility/aria-basics.feature`; `Testing/e2e/features/accessibility/keyboard-nav.feature`; `npm run test:e2e:a11y` | Covered |

## Notes

- The `@release` Playwright suite is the pre-release E2E gate. The broader
  legacy E2E inventory contains historical coverage and is not promoted to the
  release gate without curating flaky or placeholder steps.
- Dependency-order completion blocking should not be tested as a current
  behavior until a future product PR adds DB/API enforcement. If that feature is
  added, the release gate must test the trusted enforcement layer, not only a UI
  prompt.

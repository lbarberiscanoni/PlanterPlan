import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * Regression specs that need a fixture this harness can't yet create deterministically
 * (a template TREE EDITOR session, or known seed-data titles). Selectors are mapped and
 * embedded below — finishing each is mostly wiring, not discovery. Drop test.fixme when done.
 */

// REG-01 — pickers filter by task_type (commit 5cd73d6c #1/#3). @regression @templates
// Need: known loose task-type seed titles (e.g. "Patrick's Test Task ...") to assert EXCLUSION.
//   create-project picker: [data-testid="template-card"] should be project templates only.
//   in-project add-task picker (MasterLibrarySearch combobox) should surface task/phase items.
test.fixme('@regression @templates project picker shows only project templates', async ({ page }) => {
  await loginAs(page, 'planter');
  // TODO: open create-project modal; assert no template-card matches a known loose-task title.
  // TODO: open in-project "Add Task" → master-library combobox; assert task-type items appear.
  expect(true).toBe(true);
});

// REG-02 — add-phase picker searches template DESCENDANTS (commit 08ec148b #2). @regression @library
// Need: a known nested phase title that exists ONLY inside a template (not as a loose root).
//   combobox: input[id^="master-library-search-"][role="combobox"]; options role="option".
test.fixme('@regression @library add-phase search finds a nested phase', async ({ page }) => {
  await loginAs(page, 'planter');
  // TODO: open a project → "Add Phase" → type a known nested-phase title in the combobox.
  // TODO: expect a role="option" result matching it.
  expect(true).toBe(true);
});

// REG-04 — clone preserves the resource catalog link (migration 20260629020000). @regression @resources
// Multi-step: admin attaches a catalog resource to a TEMPLATE task, then a clone keeps name+resource_id.
//   admin template editor: /admin/templates → [data-testid="admin-templates-open-editor"] → /project/:templateId
//   attach: TaskResources [data-testid="resource-mode-catalog"] + resource-catalog-item-*
//   then clone via CreateProjectModal and assert the cloned task's resource name is non-empty.
test.fixme('@regression @resources cloning a template preserves resource link + name', async ({ page }) => {
  await loginAs(page, 'admin');
  // TODO: open a template in the tree editor; attach a catalog resource to a task.
  // TODO: as planter, clone that template; open the corresponding task; assert the resource
  //       name is displayed (not null) — the bug NULLed name + resource_id on clone.
  expect(true).toBe(true);
});

// REG-06 — admin can delete a NESTED template item (commit 08ec148b #4b, isLoose gate removed). @regression @library
//   tree editor: /admin/templates → admin-templates-open-editor → navigate to a nested item
//   delete control: admin-library-form-delete (edit mode) OR the in-tree trash (tasks.delete_task_aria)
test.fixme('@regression @library admin can delete a nested template item', async ({ page }) => {
  await loginAs(page, 'admin');
  // TODO: open a template tree; select a NESTED milestone/task; assert a delete control exists
  // TODO: delete it; assert the node + its descendants are gone.
  expect(true).toBe(true);
});

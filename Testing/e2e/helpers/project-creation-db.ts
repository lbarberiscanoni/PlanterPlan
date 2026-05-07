import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEST_USER } from '../fixtures/test-data';

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const TASK_PROBE_SELECT = 'id,title,root_id,parent_task_id,origin,notes,settings,cloned_from_task_id,position';

type JsonRecord = Record<string, unknown>;

export interface TaskProbeRow {
  id: string;
  title: string;
  root_id: string | null;
  parent_task_id: string | null;
  origin: string | null;
  notes: string | null;
  settings: JsonRecord | null;
  cloned_from_task_id: string | null;
  position: number | null;
}

let e2eClientPromise: Promise<SupabaseClient> | null = null;

function getRequiredEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing ${name} for project creation E2E verification.`);
  }
  return value;
}

/**
 * Read-only local E2E database probe.
 *
 * Authorization model: signs in as the seeded primary test user with the local
 * publishable anon key, then performs SELECT-only assertions under normal RLS.
 * It never uses service-role credentials and never mutates task rows; production
 * app code remains routed through `planterClient`.
 */
async function getE2EClient() {
  if (!e2eClientPromise) {
    e2eClientPromise = (async () => {
      const client = createClient(
        getRequiredEnv('VITE_SUPABASE_URL', LOCAL_SUPABASE_URL),
        getRequiredEnv('VITE_SUPABASE_ANON_KEY'),
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );
      const { error } = await client.auth.signInWithPassword({
        email: process.env.VITE_TEST_EMAIL ?? TEST_USER.email,
        password: process.env.VITE_TEST_PASSWORD ?? TEST_USER.password,
      });
      if (error) {
        throw new Error(`Project creation E2E database sign-in failed: ${error.message}`);
      }
      return client;
    })();
  }
  return e2eClientPromise;
}

export function getProjectIdFromUrl(page: Page) {
  const match = /\/project\/([^/?#]+)/.exec(new URL(page.url()).pathname);
  if (!match?.[1]) {
    throw new Error(`Expected project URL, received ${page.url()}`);
  }
  return match[1];
}

export async function fetchProjectRows(projectId: string) {
  const client = await getE2EClient();
  const { data, error } = await client
    .from('tasks')
    .select(TASK_PROBE_SELECT)
    .or(`id.eq.${projectId},root_id.eq.${projectId}`)
    .order('position', { ascending: true });

  if (error) throw new Error(`Failed to fetch project rows: ${error.message}`);
  return (data ?? []) as TaskProbeRow[];
}

export async function fetchTemplateRows(templateTitle: string) {
  const client = await getE2EClient();
  const { data: root, error: rootError } = await client
    .from('tasks')
    .select(TASK_PROBE_SELECT)
    .eq('origin', 'template')
    .eq('title', templateTitle)
    .is('parent_task_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rootError) throw new Error(`Failed to fetch template root: ${rootError.message}`);
  if (!root) throw new Error(`Template root "${templateTitle}" was not found.`);

  const templateRoot = root as TaskProbeRow;
  const { data: rows, error: rowsError } = await client
    .from('tasks')
    .select(TASK_PROBE_SELECT)
    .or(`id.eq.${templateRoot.id},root_id.eq.${templateRoot.id}`)
    .order('position', { ascending: true });

  if (rowsError) throw new Error(`Failed to fetch template rows: ${rowsError.message}`);
  return {
    root: templateRoot,
    rows: (rows ?? []) as TaskProbeRow[],
  };
}

/**
 * Counts canonical project leaf tasks below phases and milestones.
 *
 * PlanterPlan stores projects as root task trees:
 * Project -> Phase -> Milestone -> Task. This is separate from the UI subtask
 * constraint that prevents a leaf task from having nested subtasks.
 */
export function countMilestoneLeafTasks(rows: TaskProbeRow[], projectId: string) {
  const phaseIds = new Set(rows.filter((row) => row.parent_task_id === projectId).map((row) => row.id));
  const milestoneIds = new Set(
    rows
      .filter((row) => row.parent_task_id !== null && phaseIds.has(row.parent_task_id))
      .map((row) => row.id),
  );
  return rows.filter((row) => row.parent_task_id !== null && milestoneIds.has(row.parent_task_id)).length;
}

export function getSettingString(row: TaskProbeRow | undefined, key: string) {
  const value = row?.settings?.[key];
  return typeof value === 'string' ? value : null;
}

export async function waitForProjectRowCount(projectId: string, expectedCount: number) {
  await expect.poll(async () => (await fetchProjectRows(projectId)).length, {
    timeout: 15000,
  }).toBe(expectedCount);
}

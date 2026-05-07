import { createBdd } from 'playwright-bdd';
import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SELECTORS, TEST_USER } from '../fixtures/test-data';
import { nowUtcIso } from '../../../src/shared/lib/date-engine';

const { Given, When, Then } = createBdd();

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const DEFAULT_PASSWORD = 'Release-pass-123!';

type JsonRecord = Record<string, unknown>;

interface AuthClient {
  client: SupabaseClient;
  userId: string;
  email: string;
}

interface TaskProbe {
  id: string;
  title: string;
  status: string | null;
  is_complete: boolean | null;
  is_locked: boolean | null;
  start_date: string | null;
  due_date: string | null;
  parent_task_id: string | null;
  root_id: string | null;
  settings: JsonRecord | null;
}

interface ReleaseProjectIds {
  projectId: string;
  phaseOneId: string;
  phaseTwoId: string;
  milestoneId: string;
  parentTaskId: string;
  subtaskId: string;
  parentTitle: string;
  subtaskTitle: string;
  coachingTaskId?: string;
}

interface RoleAttemptResults {
  coachAllowedStatus?: string | null;
  coachForbiddenTitleDenied: boolean;
  coachNonCoachingDenied: boolean;
  viewerForbiddenDenied: boolean;
}

interface IcsState {
  oldTokenId: string;
  oldTokenValue: string;
  newTokenId: string;
  newTokenValue: string;
  otherVisibleCount: number;
  otherUpdateChanged: boolean;
}

interface ReleaseState {
  owner: AuthClient;
  ids: ReleaseProjectIds;
  hierarchyError?: string | null;
  dateEnvelopeError?: string | null;
  subtaskDueBeforeInvalidWrite?: string | null;
  coach?: AuthClient;
  viewer?: AuthClient;
  mentioned?: AuthClient;
  roleAttempts?: RoleAttemptResults;
  commentId?: string;
  ics?: IcsState;
}

const stateByPage = new WeakMap<Page, ReleaseState>();

function getRequiredEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing ${name} for release regression E2E.`);
  return value;
}

function makeClient() {
  return createClient(
    getRequiredEnv('VITE_SUPABASE_URL', LOCAL_SUPABASE_URL),
    getRequiredEnv('VITE_SUPABASE_ANON_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

async function signIn(email: string, password: string): Promise<AuthClient> {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Release regression sign-in failed for ${email}: ${error.message}`);
  if (!data.user?.id) throw new Error(`Release regression sign-in returned no user for ${email}.`);
  return { client, userId: data.user.id, email };
}

async function signInPrimaryUser() {
  return signIn(
    process.env.VITE_TEST_EMAIL ?? TEST_USER.email,
    process.env.VITE_TEST_PASSWORD ?? TEST_USER.password,
  );
}

async function createSignedInUser(label: string): Promise<AuthClient> {
  const email = `release-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const client = makeClient();
  const { error: signUpError } = await client.auth.signUp({
    email,
    password: DEFAULT_PASSWORD,
  });
  if (signUpError) {
    throw new Error(`Release regression sign-up failed for ${email}: ${signUpError.message}`);
  }
  return signIn(email, DEFAULT_PASSWORD);
}

async function insertTask(
  client: SupabaseClient,
  row: Record<string, unknown>,
): Promise<TaskProbe> {
  const { data, error } = await client
    .from('tasks')
    .insert(row)
    .select('id,title,status,is_complete,is_locked,start_date,due_date,parent_task_id,root_id,settings')
    .single();
  if (error) throw new Error(`Failed to insert release regression task "${row.title ?? row.id}": ${error.message}`);
  return data as TaskProbe;
}

async function fetchTask(client: SupabaseClient, taskId: string): Promise<TaskProbe> {
  const { data, error } = await client
    .from('tasks')
    .select('id,title,status,is_complete,is_locked,start_date,due_date,parent_task_id,root_id,settings')
    .eq('id', taskId)
    .single();
  if (error) throw new Error(`Failed to fetch release regression task ${taskId}: ${error.message}`);
  return data as TaskProbe;
}

function dateOnly(value: string | null | undefined) {
  return value?.slice(0, 10) ?? null;
}

function requireState(page: Page) {
  const state = stateByPage.get(page);
  if (!state) throw new Error('Release regression state was not initialized for this scenario.');
  return state;
}

async function addProjectMember(
  ownerClient: SupabaseClient,
  projectId: string,
  email: string,
  role: 'coach' | 'viewer',
) {
  const { error } = await ownerClient.rpc('invite_user_to_project', {
    p_project_id: projectId,
    p_email: email,
    p_role: role,
  });
  if (error) throw new Error(`Failed to add ${role} release regression member: ${error.message}`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function createReleaseProject(owner: AuthClient): Promise<ReleaseProjectIds> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const projectId = crypto.randomUUID();
  const phaseOneId = crypto.randomUUID();
  const phaseTwoId = crypto.randomUUID();
  const milestoneId = crypto.randomUUID();
  const parentTaskId = crypto.randomUUID();
  const subtaskId = crypto.randomUUID();
  const parentTitle = `Release Parent Task ${suffix}`;
  const subtaskTitle = `Release Open Subtask ${suffix}`;

  await insertTask(owner.client, {
    id: projectId,
    root_id: projectId,
    parent_task_id: null,
    creator: owner.userId,
    position: 1,
    title: `Release Regression Project ${suffix}`,
    origin: 'instance',
    status: 'not_started',
    settings: { project_kind: 'checkpoint' },
  });

  const { error: initError } = await owner.client.rpc('initialize_default_project', {
    p_project_id: projectId,
    p_creator_id: owner.userId,
  });
  if (initError) throw new Error(`Failed to initialize release regression project membership: ${initError.message}`);

  await insertTask(owner.client, {
    id: phaseOneId,
    root_id: projectId,
    parent_task_id: projectId,
    creator: owner.userId,
    position: 0,
    title: `Release Phase One ${suffix}`,
    origin: 'instance',
    status: 'not_started',
  });

  await insertTask(owner.client, {
    id: phaseTwoId,
    root_id: projectId,
    parent_task_id: projectId,
    creator: owner.userId,
    position: 2,
    title: `Release Dependent Phase ${suffix}`,
    origin: 'instance',
    status: 'not_started',
    is_locked: true,
    prerequisite_phase_id: phaseOneId,
  });

  await insertTask(owner.client, {
    id: milestoneId,
    root_id: projectId,
    parent_task_id: phaseOneId,
    creator: owner.userId,
    position: 1,
    title: `Release Milestone ${suffix}`,
    origin: 'instance',
    status: 'not_started',
  });

  await insertTask(owner.client, {
    id: parentTaskId,
    root_id: projectId,
    parent_task_id: milestoneId,
    creator: owner.userId,
    position: 1,
    title: parentTitle,
    origin: 'instance',
    status: 'not_started',
    start_date: '2026-02-03',
    due_date: '2026-02-07',
  });

  await insertTask(owner.client, {
    id: subtaskId,
    root_id: projectId,
    parent_task_id: parentTaskId,
    creator: owner.userId,
    position: 1,
    title: subtaskTitle,
    origin: 'instance',
    status: 'not_started',
    start_date: '2026-02-04',
    due_date: '2026-02-06',
  });

  return {
    projectId,
    phaseOneId,
    phaseTwoId,
    milestoneId,
    parentTaskId,
    subtaskId,
    parentTitle,
    subtaskTitle,
  };
}

Given('a release regression project tree exists', async ({ page }) => {
  const owner = await signInPrimaryUser();
  const ids = await createReleaseProject(owner);

  await expect.poll(async () => {
    const parent = await fetchTask(owner.client, ids.parentTaskId);
    const milestone = await fetchTask(owner.client, ids.milestoneId);
    const phase = await fetchTask(owner.client, ids.phaseOneId);
    return {
      parentStart: dateOnly(parent.start_date),
      parentDue: dateOnly(parent.due_date),
      milestoneStart: dateOnly(milestone.start_date),
      milestoneDue: dateOnly(milestone.due_date),
      phaseStart: dateOnly(phase.start_date),
      phaseDue: dateOnly(phase.due_date),
    };
  }, { timeout: 10000 }).toEqual({
    parentStart: '2026-02-04',
    parentDue: '2026-02-06',
    milestoneStart: '2026-02-04',
    milestoneDue: '2026-02-06',
    phaseStart: '2026-02-04',
    phaseDue: '2026-02-06',
  });

  stateByPage.set(page, { owner, ids });
});

When('the signed-in release user opens the team roster route', async ({ page }) => {
  const state = requireState(page);
  await page.goto(`/team?project=${state.ids.projectId}`);
});

Then('the team roster route shows the project member profile', async ({ page }) => {
  const state = requireState(page);
  await expect(page.getByRole('heading', { name: new RegExp(`Release Regression Project .* Team`) })).toBeVisible({ timeout: 15000 });
  await expect(
    page.locator('[data-testid="team-member-card"]').filter({ hasText: state.owner.email }).first(),
  ).toBeVisible();
});

When('the user completes a parent task with an open subtask through the UI', async ({ page }) => {
  const state = requireState(page);
  await page.goto(`/project/${state.ids.projectId}`);
  await expect(page.getByText(state.ids.parentTitle, { exact: true })).toBeVisible({ timeout: 15000 });

  await page
    .getByRole('combobox', { name: `Status for ${state.ids.parentTitle}` })
    .selectOption('completed');

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Complete task with open subtasks?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
});

Then('the parent, child, rollup, and dependent phase states are persisted correctly', async ({ page }) => {
  const state = requireState(page);
  await expect.poll(async () => {
    const parent = await fetchTask(state.owner.client, state.ids.parentTaskId);
    const subtask = await fetchTask(state.owner.client, state.ids.subtaskId);
    const milestone = await fetchTask(state.owner.client, state.ids.milestoneId);
    const phaseOne = await fetchTask(state.owner.client, state.ids.phaseOneId);
    const phaseTwo = await fetchTask(state.owner.client, state.ids.phaseTwoId);

    return {
      parentStatus: parent.status,
      parentComplete: parent.is_complete,
      subtaskStatus: subtask.status,
      subtaskComplete: subtask.is_complete,
      milestoneStatus: milestone.status,
      phaseOneStatus: phaseOne.status,
      phaseTwoLocked: phaseTwo.is_locked,
      milestoneStart: dateOnly(milestone.start_date),
      milestoneDue: dateOnly(milestone.due_date),
    };
  }, { timeout: 15000 }).toEqual({
    parentStatus: 'completed',
    parentComplete: true,
    subtaskStatus: 'completed',
    subtaskComplete: true,
    milestoneStatus: 'completed',
    phaseOneStatus: 'completed',
    phaseTwoLocked: false,
    milestoneStart: '2026-02-04',
    milestoneDue: '2026-02-06',
  });
});

When('invalid release hierarchy and date-envelope writes are attempted through Supabase', async ({ page }) => {
  const state = requireState(page);
  const subtask = await fetchTask(state.owner.client, state.ids.subtaskId);
  state.subtaskDueBeforeInvalidWrite = subtask.due_date;

  const { error: hierarchyError } = await state.owner.client
    .from('tasks')
    .insert({
      id: crypto.randomUUID(),
      root_id: state.ids.projectId,
      parent_task_id: state.ids.subtaskId,
      creator: state.owner.userId,
      position: 1,
      title: `Invalid nested subtask ${crypto.randomUUID().slice(0, 8)}`,
      origin: 'instance',
      status: 'not_started',
    });
  state.hierarchyError = hierarchyError?.message ?? null;

  const { error: dateEnvelopeError } = await state.owner.client
    .from('tasks')
    .update({ due_date: '2026-03-01' })
    .eq('id', state.ids.subtaskId);
  state.dateEnvelopeError = dateEnvelopeError?.message ?? null;
});

Then('both invalid writes are rejected without changing persisted task state', async ({ page }) => {
  const state = requireState(page);
  expect(state.hierarchyError).toContain('task hierarchy depth exceeded');
  expect(state.dateEnvelopeError).toContain('task dates must stay within parent task dates');

  const subtask = await fetchTask(state.owner.client, state.ids.subtaskId);
  expect(subtask.due_date).toBe(state.subtaskDueBeforeInvalidWrite);
});

Given('release regression coach and viewer members exist', async ({ page }) => {
  const state = requireState(page);
  const coach = await createSignedInUser('coach');
  const viewer = await createSignedInUser('viewer');

  await addProjectMember(state.owner.client, state.ids.projectId, coach.email, 'coach');
  await addProjectMember(state.owner.client, state.ids.projectId, viewer.email, 'viewer');

  const coachingTask = await insertTask(state.owner.client, {
    id: crypto.randomUUID(),
    root_id: state.ids.projectId,
    parent_task_id: state.ids.milestoneId,
    creator: state.owner.userId,
    position: 2,
    title: `Release Coaching Task ${crypto.randomUUID().slice(0, 8)}`,
    origin: 'instance',
    status: 'not_started',
    settings: { is_coaching_task: true },
  });

  state.coach = coach;
  state.viewer = viewer;
  state.ids.coachingTaskId = coachingTask.id;
});

When('they attempt release regression role-forbidden task updates through Supabase', async ({ page }) => {
  const state = requireState(page);
  if (!state.coach || !state.viewer || !state.ids.coachingTaskId) {
    throw new Error('Release regression role members were not initialized.');
  }

  const allowed = await state.coach.client
    .from('tasks')
    .update({ status: 'in_progress' })
    .eq('id', state.ids.coachingTaskId)
    .select('status')
    .single();

  const coachForbiddenTitle = await state.coach.client
    .from('tasks')
    .update({ title: 'Forbidden coach title edit' })
    .eq('id', state.ids.coachingTaskId)
    .select('title')
    .maybeSingle();

  const coachNonCoaching = await state.coach.client
    .from('tasks')
    .update({ status: 'blocked' })
    .eq('id', state.ids.parentTaskId)
    .select('status')
    .maybeSingle();

  const viewerForbidden = await state.viewer.client
    .from('tasks')
    .update({ status: 'completed' })
    .eq('id', state.ids.parentTaskId)
    .select('status')
    .maybeSingle();

  if (allowed.error) throw new Error(`Coach progress update should be allowed: ${allowed.error.message}`);

  state.roleAttempts = {
    coachAllowedStatus: allowed.data?.status as string | null,
    coachForbiddenTitleDenied: Boolean(coachForbiddenTitle.error) || coachForbiddenTitle.data === null,
    coachNonCoachingDenied: Boolean(coachNonCoaching.error) || coachNonCoaching.data === null,
    viewerForbiddenDenied: Boolean(viewerForbidden.error) || viewerForbidden.data === null,
  };
});

Then('the coach and viewer writes are rejected while coaching progress remains allowed', async ({ page }) => {
  const state = requireState(page);
  const attempts = state.roleAttempts;
  if (!attempts || !state.ids.coachingTaskId) throw new Error('Release regression role attempts were not recorded.');

  expect(attempts.coachAllowedStatus).toBe('in_progress');
  expect(attempts.coachForbiddenTitleDenied).toBe(true);
  expect(attempts.coachNonCoachingDenied).toBe(true);
  expect(attempts.viewerForbiddenDenied).toBe(true);

  const parent = await fetchTask(state.owner.client, state.ids.parentTaskId);
  const coachingTask = await fetchTask(state.owner.client, state.ids.coachingTaskId);
  expect(parent.status).toBe('not_started');
  expect(coachingTask.status).toBe('in_progress');
  expect(coachingTask.title).not.toBe('Forbidden coach title edit');
});

When('the signed-in release user opens the admin route', async ({ page }) => {
  await page.goto('/admin');
});

Then('the admin route denies access and returns to the task dashboard', async ({ page }) => {
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.locator('[data-testid="admin-layout"]')).toBeHidden();
  await expect(
    page.locator(SELECTORS.toast).filter({ hasText: 'You need admin access for this page.' }).first(),
  ).toBeVisible({ timeout: 5000 });
});

Given('a release regression mentioned member exists', async ({ page }) => {
  const state = requireState(page);
  const mentioned = await createSignedInUser('mentioned');
  await addProjectMember(state.owner.client, state.ids.projectId, mentioned.email, 'viewer');
  state.mentioned = mentioned;
});

When('the release regression member is mentioned in a task comment', async ({ page }) => {
  const state = requireState(page);
  if (!state.mentioned) throw new Error('Release regression mentioned member was not initialized.');

  const commentId = crypto.randomUUID();
  const { error } = await state.owner.client
    .from('task_comments')
    .insert({
      id: commentId,
      task_id: state.ids.parentTaskId,
      root_id: state.ids.projectId,
      author_id: state.owner.userId,
      body: `Release mention check for ${state.mentioned.email}`,
      mentions: [state.mentioned.userId],
    });

  if (error) throw new Error(`Failed to insert release regression mention comment: ${error.message}`);
  state.commentId = commentId;
});

Then('the member receives a populated mention notification', async ({ page }) => {
  const state = requireState(page);
  if (!state.mentioned || !state.commentId) {
    throw new Error('Release regression mention state was not initialized.');
  }

  await expect.poll(async () => {
    const { data, error } = await state.mentioned!.client
      .from('notification_log')
      .select('user_id,event_type,channel,payload')
      .eq('event_type', 'mention_pending')
      .order('sent_at', { ascending: false });
    if (error) throw new Error(`Failed to read mention notification log: ${error.message}`);

    const row = (data ?? []).find((candidate) => {
      const payload = candidate.payload;
      return isRecord(payload) && payload.comment_id === state.commentId;
    });

    if (!row || !isRecord(row.payload)) return null;

    return {
      userId: row.user_id,
      eventType: row.event_type,
      channel: row.channel,
      recipientId: row.payload.recipient_id,
      actorId: row.payload.actor_id,
      taskId: row.payload.task_id,
      projectId: row.payload.project_id,
      commentId: row.payload.comment_id,
    };
  }, { timeout: 10000 }).toEqual({
    userId: state.mentioned.userId,
    eventType: 'mention_pending',
    channel: 'email',
    recipientId: state.mentioned.userId,
    actorId: state.owner.userId,
    taskId: state.ids.parentTaskId,
    projectId: state.ids.projectId,
    commentId: state.commentId,
  });
});

When('the user creates, revokes, and rotates release ICS tokens', async ({ page }) => {
  const state = requireState(page);
  if (!state.mentioned) throw new Error('Release regression mentioned member must exist for the cross-user ICS check.');

  const oldTokenValue = `release-old-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const newTokenValue = `release-new-${crypto.randomUUID()}-${crypto.randomUUID()}`;

  const oldToken = await state.owner.client
    .from('ics_feed_tokens')
    .insert({
      user_id: state.owner.userId,
      token: oldTokenValue,
      label: 'Release old feed',
      project_filter: [state.ids.projectId],
    })
    .select('id,token,revoked_at')
    .single();
  if (oldToken.error) throw new Error(`Failed to create old release ICS token: ${oldToken.error.message}`);

  const revoked = await state.owner.client
    .from('ics_feed_tokens')
    .update({ revoked_at: nowUtcIso() })
    .eq('id', oldToken.data.id)
    .select('id,revoked_at')
    .single();
  if (revoked.error) throw new Error(`Failed to revoke release ICS token: ${revoked.error.message}`);

  const newToken = await state.owner.client
    .from('ics_feed_tokens')
    .insert({
      user_id: state.owner.userId,
      token: newTokenValue,
      label: 'Release replacement feed',
      project_filter: [state.ids.projectId],
    })
    .select('id,token,revoked_at')
    .single();
  if (newToken.error) throw new Error(`Failed to create replacement release ICS token: ${newToken.error.message}`);

  const otherVisible = await state.mentioned.client
    .from('ics_feed_tokens')
    .select('id')
    .in('id', [oldToken.data.id, newToken.data.id]);
  if (otherVisible.error) throw new Error(`Failed to read cross-user ICS visibility: ${otherVisible.error.message}`);

  const otherUpdate = await state.mentioned.client
    .from('ics_feed_tokens')
    .update({ revoked_at: nowUtcIso() })
    .eq('id', newToken.data.id)
    .select('id')
    .maybeSingle();

  state.ics = {
    oldTokenId: oldToken.data.id,
    oldTokenValue,
    newTokenId: newToken.data.id,
    newTokenValue,
    otherVisibleCount: otherVisible.data?.length ?? 0,
    otherUpdateChanged: Boolean(otherUpdate.data),
  };
});

Then('revoked release ICS tokens are inactive and hidden from other users', async ({ page }) => {
  const state = requireState(page);
  if (!state.ics) throw new Error('Release regression ICS state was not initialized.');

  const { data, error } = await state.owner.client
    .from('ics_feed_tokens')
    .select('id,token,revoked_at,project_filter')
    .in('id', [state.ics.oldTokenId, state.ics.newTokenId])
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to read release ICS tokens: ${error.message}`);

  const oldToken = (data ?? []).find((row) => row.id === state.ics?.oldTokenId);
  const newToken = (data ?? []).find((row) => row.id === state.ics?.newTokenId);

  expect(oldToken?.token).toBe(state.ics.oldTokenValue);
  expect(oldToken?.revoked_at).toEqual(expect.any(String));
  expect(newToken?.token).toBe(state.ics.newTokenValue);
  expect(newToken?.revoked_at).toBeNull();
  expect(newToken?.project_filter).toEqual([state.ids.projectId]);
  expect(state.ics.otherVisibleCount).toBe(0);
  expect(state.ics.otherUpdateChanged).toBe(false);
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeTask } from '@test';
import type { TaskItemData } from '@/shared/types/tasks';

// ---- Mocks (declared BEFORE import of the component under test) ----

vi.mock('@/features/tasks/hooks/useTaskSiblings', () => ({
  useTaskSiblings: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/tasks/hooks/useTaskComments', () => ({
  useTaskComments: () => ({ data: [], isLoading: false }),
  useCreateComment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateComment: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteComment: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/tasks/hooks/useTaskCommentsRealtime', () => ({
  useTaskCommentsRealtime: () => undefined,
}));

vi.mock('@/shared/hooks/useActivityLog', () => ({
  useProjectActivity: () => ({ data: [], isLoading: false }),
  useTaskActivity: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/shared/db/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

vi.mock('@/shared/api/auth', () => ({
  authApi: { checkIsAdmin: vi.fn().mockResolvedValue(false) },
}));

const mockRememberEmailAddress = vi.fn();
let savedEmailAddresses: string[] = [];
vi.mock('@/shared/contexts/auth-context', async () => {
  const actual = await vi.importActual<typeof import('@/shared/contexts/auth-context')>(
    '@/shared/contexts/auth-context',
  );
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'u1', email: 'me@x.com', role: 'owner', subscription_status: 'active' },
      savedEmailAddresses,
      rememberEmailAddress: mockRememberEmailAddress,
    }),
  };
});

vi.mock('@/features/tasks/components/TaskResources', () => ({
  default: () => <div data-testid="task-resources-stub" />,
}));
vi.mock('@/features/tasks/components/TaskDependencies', () => ({
  default: () => <div data-testid="task-dependencies-stub" />,
}));

import TaskDetailsView from '@/features/tasks/components/TaskDetailsView';

function renderView(task: TaskItemData) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TaskDetailsView task={task} />
    </QueryClientProvider>,
  );
}

// jsdom does not implement navigation; capture window.location.assign calls.
let hrefSink = '';
const originalLocation = window.location;
function installLocationStub() {
  delete (window as unknown as { location?: Location }).location;
  (window as unknown as { location: unknown }).location = {
    ...originalLocation,
    origin: 'https://app.test',
    assign: (url: string) => {
      hrefSink = url;
    },
  };
}
function restoreLocation() {
  (window as unknown as { location: Location }).location = originalLocation;
}

beforeEach(() => {
  vi.clearAllMocks();
  savedEmailAddresses = [];
  hrefSink = '';
  installLocationStub();
});

afterEach(() => {
  restoreLocation();
});

const makeTaskForEmail = (): TaskItemData =>
  makeTask({
    id: 'task-xyz',
    title: 'Plant milestone',
    purpose: 'Prepare launch team',
    actions: 'Meet Tuesday',
    start_date: '2026-05-01',
    due_date: '2026-05-15',
    parent_task_id: 'parent-1',
    root_id: 'root-1',
  }) as TaskItemData;

describe('TaskDetailsView — Email details dialog (Wave 21.5 §3.3)', () => {
  it('opens the dialog when "Email details" is clicked', async () => {
    renderView(makeTaskForEmail());

    expect(screen.queryByTestId('email-details-dialog')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId('email-details-btn'));
    });

    expect(screen.getByTestId('email-details-dialog')).toBeInTheDocument();
  });

  it('rejects an invalid recipient via zod (no mailto dispatch)', async () => {
    renderView(makeTaskForEmail());

    await act(async () => {
      fireEvent.click(screen.getByTestId('email-details-btn'));
    });

    const input = screen.getByTestId('email-recipient-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'not-an-email' } });
    });

    // Submit the form directly (fireEvent.click on a portal-rendered button
    // has flaky bubbling behavior in jsdom; submitting the form is the same
    // user intent and is deterministic).
    const form = input.closest('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('email-recipient-error')).toHaveTextContent(/valid email/i);
    });

    expect(mockRememberEmailAddress).not.toHaveBeenCalled();
    expect(hrefSink).toBe('');
  });

  it('sends: remembers the address and dispatches a mailto: with subject + body', async () => {
    renderView(makeTaskForEmail());

    await act(async () => {
      fireEvent.click(screen.getByTestId('email-details-btn'));
    });

    const input = screen.getByTestId('email-recipient-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'pastor@example.com' } });
    });

    const form = input.closest('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(mockRememberEmailAddress).toHaveBeenCalledWith('pastor@example.com');
    });

    expect(hrefSink).toMatch(/^mailto:pastor@example\.com\?/);
    expect(hrefSink).toContain('subject=');
    expect(hrefSink).toContain('body=');

    // Subject decodes to "Task: Plant milestone"
    const qs = hrefSink.split('?')[1] ?? '';
    const params = new URLSearchParams(qs);
    expect(params.get('subject')).toBe('Task: Plant milestone');

    const body = params.get('body') || '';
    expect(body).toContain('Task: Plant milestone');
    expect(body).toContain('Purpose:');
    expect(body).toContain('Prepare launch team');
    expect(body).toContain('Actions:');
    expect(body).toContain('Meet Tuesday');
    expect(body).toContain('Link: https://app.test/project/root-1');
  });

  it('prefills recipient with the most-recent saved address when the dialog opens', async () => {
    savedEmailAddresses = ['top@example.com', 'older@example.com'];
    renderView(makeTaskForEmail());

    await act(async () => {
      fireEvent.click(screen.getByTestId('email-details-btn'));
    });

    const input = screen.getByTestId('email-recipient-input') as HTMLInputElement;
    expect(input.value).toBe('top@example.com');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@/shared/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'u1@example.com', role: 'user' } }),
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
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// RecurrencePicker pulls planterClient transitively via queries; stub it for this test.
vi.mock('@/features/tasks/components/RecurrencePicker', () => ({
  default: () => <div data-testid="recurrence-picker-stub" />,
}));

import TaskForm from '@/features/tasks/components/TaskForm';
import type { TaskFormData } from '@/shared/db/app.types';

function renderForm(props: {
  membershipRole?: string;
  origin?: 'instance' | 'template';
  onSubmit: (data: TaskFormData) => Promise<void>;
  initialTask?: Record<string, unknown> | null;
}) {
  return render(
    <TaskForm
      onSubmit={props.onSubmit}
      onCancel={vi.fn()}
      origin={props.origin ?? 'instance'}
      membershipRole={props.membershipRole}
      initialTask={props.initialTask ?? null}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TaskForm — template-only coaching and strategy flag gates', () => {
  it('hides both flag checkboxes on instance forms, even for owners and editors', () => {
    const { rerender } = renderForm({ membershipRole: 'owner', onSubmit: vi.fn(async () => undefined) });

    expect(screen.queryByTestId('is-coaching-task-checkbox')).toBeNull();
    expect(screen.queryByTestId('is-strategy-template-checkbox')).toBeNull();

    rerender(
      <TaskForm
        onSubmit={vi.fn(async () => undefined)}
        onCancel={vi.fn()}
        origin="instance"
        membershipRole="editor"
      />,
    );

    expect(screen.queryByTestId('is-coaching-task-checkbox')).toBeNull();
    expect(screen.queryByTestId('is-strategy-template-checkbox')).toBeNull();
  });

  it('renders both flag checkboxes for template owners and editors', () => {
    const { rerender } = renderForm({
      membershipRole: 'owner',
      origin: 'template',
      onSubmit: vi.fn(async () => undefined),
    });

    expect(screen.getByTestId('is-coaching-task-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('is-strategy-template-checkbox')).toBeInTheDocument();

    rerender(
      <TaskForm
        onSubmit={vi.fn(async () => undefined)}
        onCancel={vi.fn()}
        origin="template"
        membershipRole="editor"
      />,
    );

    expect(screen.getByTestId('is-coaching-task-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('is-strategy-template-checkbox')).toBeInTheDocument();
  });

  it('hides both flag checkboxes for non-editor template roles', () => {
    renderForm({ membershipRole: 'coach', origin: 'template', onSubmit: vi.fn(async () => undefined) });
    expect(screen.queryByTestId('is-coaching-task-checkbox')).toBeNull();
    expect(screen.queryByTestId('is-strategy-template-checkbox')).toBeNull();
  });

  it('hides both flag checkboxes when no membershipRole is supplied', () => {
    renderForm({ origin: 'template', onSubmit: vi.fn(async () => undefined) });
    expect(screen.queryByTestId('is-coaching-task-checkbox')).toBeNull();
    expect(screen.queryByTestId('is-strategy-template-checkbox')).toBeNull();
  });
});

describe('TaskForm — template-only coaching and strategy submission', () => {
  it('submits both flags when a template owner checks the boxes', async () => {
    const onSubmit = vi.fn(async () => undefined);
    renderForm({ membershipRole: 'owner', origin: 'template', onSubmit });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/task title/i), { target: { value: 'Coach meeting' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('is-coaching-task-checkbox'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('is-strategy-template-checkbox'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add new task/i }));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    const submitted = onSubmit.mock.calls[0][0] as TaskFormData;
    expect(submitted.is_coaching_task).toBe(true);
    expect(submitted.is_strategy_template).toBe(true);
  });

  it('seeds the checkboxes from template settings on edit', async () => {
    const onSubmit = vi.fn(async () => undefined);
    renderForm({
      membershipRole: 'editor',
      origin: 'template',
      onSubmit,
      initialTask: {
        id: 't1',
        title: 'Existing',
        settings: { is_coaching_task: true, is_strategy_template: true, due_soon_threshold: 3 },
      },
    });

    expect((screen.getByTestId('is-coaching-task-checkbox') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('is-strategy-template-checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('submits false when a template editor unchecks already-tagged flags', async () => {
    const onSubmit = vi.fn(async () => undefined);
    renderForm({
      membershipRole: 'editor',
      origin: 'template',
      onSubmit,
      initialTask: {
        id: 't1',
        title: 'Existing',
        settings: { is_coaching_task: true, is_strategy_template: true },
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('is-coaching-task-checkbox'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('is-strategy-template-checkbox'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    const submitted = onSubmit.mock.calls[0][0] as TaskFormData;
    expect(submitted.is_coaching_task).toBe(false);
    expect(submitted.is_strategy_template).toBe(false);
  });

  it('strips hidden flag defaults before submitting an instance edit', async () => {
    const onSubmit = vi.fn(async () => undefined);
    renderForm({
      membershipRole: 'owner',
      origin: 'instance',
      onSubmit,
      initialTask: {
        id: 't1',
        title: 'Existing',
        settings: { is_coaching_task: true, is_strategy_template: true },
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    const submitted = onSubmit.mock.calls[0][0] as TaskFormData;
    expect(submitted.is_coaching_task).toBeUndefined();
    expect(submitted.is_strategy_template).toBeUndefined();
  });
});

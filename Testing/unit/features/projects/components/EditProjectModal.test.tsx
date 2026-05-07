import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ConfirmDialogProvider } from '@/shared/ui/confirm-dialog';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeTask } from '@test';
import type { TaskRow } from '@/shared/db/app.types';

const mockUpdateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();
const mockSetArchivedMutateAsync = vi.fn();

vi.mock('@/features/projects/hooks/useProjectMutations', () => ({
  useUpdateProject: () => ({ mutateAsync: mockUpdateMutateAsync }),
  useDeleteProject: () => ({ mutateAsync: mockDeleteMutateAsync }),
  useSetProjectArchived: () => ({ mutateAsync: mockSetArchivedMutateAsync, isPending: false }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock('@/shared/api/planterClient', () => ({
  default: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import EditProjectModal from '@/features/projects/components/EditProjectModal';

function renderModal(project: TaskRow) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConfirmDialogProvider>
          <EditProjectModal project={project} isOpen={true} onClose={vi.fn()} />
        </ConfirmDialogProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMutateAsync.mockResolvedValue({ shiftedCount: 0 });
  mockSetArchivedMutateAsync.mockResolvedValue(undefined);
});

describe('EditProjectModal — Published toggle visibility', () => {
  it('renders the Published switch for template projects', () => {
    const template = makeTask({
      id: 'tmpl-1',
      title: 'A Template',
      origin: 'template',
      start_date: '2026-01-01',
      settings: null,
    });

    renderModal(template);

    const toggle = screen.getByLabelText(/Published/i);
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('does NOT render the Published switch for instance projects', () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      start_date: '2026-01-01',
    });

    renderModal(instance);

    expect(screen.queryByLabelText(/Published/i)).toBeNull();
  });
});

describe('EditProjectModal — Published toggle persistence', () => {
  it('persists isPublished=true into updates.settings.published on save', async () => {
    const template = makeTask({
      id: 'tmpl-1',
      title: 'A Template',
      origin: 'template',
      start_date: '2026-01-01',
      settings: null,
    });

    renderModal(template);

    const toggle = screen.getByLabelText(/Published/i);
    await act(async () => {
      fireEvent.click(toggle);
    });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalled();
    });

    const payload = mockUpdateMutateAsync.mock.calls[0][0] as {
      updates: { settings: { published: boolean } };
    };
    expect(payload.updates.settings.published).toBe(true);
  });
});

describe('EditProjectModal — Supervisor Email field (Wave 21)', () => {
  it('renders the Supervisor Email field for instance projects', () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      start_date: '2026-01-01',
    });

    renderModal(instance);

    expect(screen.getByLabelText(/supervisor email/i)).toBeInTheDocument();
  });

  it('does NOT render the Supervisor Email field for template projects', () => {
    const template = makeTask({
      id: 'tmpl-1',
      title: 'A Template',
      origin: 'template',
      start_date: '2026-01-01',
      settings: null,
    });

    renderModal(template);

    expect(screen.queryByLabelText(/supervisor email/i)).toBeNull();
  });

  it('persists a valid supervisor_email to updates on save', async () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      start_date: '2026-01-01',
    });

    renderModal(instance);

    const input = screen.getByLabelText(/supervisor email/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'bishop@example.com' } });
    });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalled();
    });

    const payload = mockUpdateMutateAsync.mock.calls[0][0] as {
      updates: { supervisor_email: string | null };
    };
    expect(payload.updates.supervisor_email).toBe('bishop@example.com');
  });

  it('normalises an empty supervisor_email to null on save', async () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      start_date: '2026-01-01',
      supervisor_email: 'old@example.com',
    });

    renderModal(instance);

    const input = screen.getByLabelText(/supervisor email/i) as HTMLInputElement;
    expect(input.value).toBe('old@example.com');

    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
    });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalled();
    });

    const payload = mockUpdateMutateAsync.mock.calls[0][0] as {
      updates: { supervisor_email: string | null };
    };
    expect(payload.updates.supervisor_email).toBeNull();
  });

  it('blocks save and surfaces a validation error for an invalid supervisor_email', async () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      start_date: '2026-01-01',
    });

    renderModal(instance);

    const input = screen.getByLabelText(/supervisor email/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'not-an-email' } });
    });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument();
    });
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });
});

describe('EditProjectModal — Archive / Unarchive (Wave 21.5)', () => {
  it('renders Archive button for active instance projects', () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      status: 'in_progress',
      start_date: '2026-01-01',
    });
    renderModal(instance);
    expect(screen.getByTestId('archive-project-btn')).toHaveTextContent(/archive/i);
  });

  it('renders Unarchive button for archived projects', () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      status: 'archived',
      start_date: '2026-01-01',
    });
    renderModal(instance);
    expect(screen.getByTestId('archive-project-btn')).toHaveTextContent(/unarchive/i);
  });

  it('does NOT render the Archive button for templates', () => {
    const template = makeTask({
      id: 'tmpl-1',
      title: 'A Template',
      origin: 'template',
      start_date: '2026-01-01',
      settings: null,
    });
    renderModal(template);
    expect(screen.queryByTestId('archive-project-btn')).toBeNull();
  });

  it('archive click marks the project archived', async () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      status: 'in_progress',
      start_date: '2026-01-01',
    });
    renderModal(instance);
    const button = screen.getByTestId('archive-project-btn');
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => {
      expect(mockSetArchivedMutateAsync).toHaveBeenCalledWith({
        projectId: 'proj-1',
        archived: true,
      });
    });
  });

  it('unarchive click clears the archived visibility flag', async () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      status: 'archived',
      start_date: '2026-01-01',
    });
    renderModal(instance);
    const button = screen.getByTestId('archive-project-btn');
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => {
      expect(mockSetArchivedMutateAsync).toHaveBeenCalledWith({
        projectId: 'proj-1',
        archived: false,
      });
    });
  });
});

describe('EditProjectModal — shiftedCount toast feedback', () => {
  it('surfaces the shiftedCount message when tasks are rescheduled', async () => {
    mockUpdateMutateAsync.mockResolvedValueOnce({ shiftedCount: 2 });

    const template = makeTask({
      id: 'tmpl-1',
      title: 'A Template',
      origin: 'template',
      start_date: '2026-01-01',
      settings: null,
    });

    renderModal(template);

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalled();
    });

    const message = mockToastSuccess.mock.calls[0][0] as string;
    expect(message).toContain('2 tasks rescheduled');
  });
});

describe('EditProjectModal — start/end date visibility (Wave 37)', () => {
  it('hides the date section for template projects', () => {
    const template = makeTask({
      id: 'tmpl-1',
      title: 'A Template',
      origin: 'template',
      start_date: '2026-01-01',
      settings: null,
    });
    renderModal(template);
    expect(screen.queryByLabelText(/launch date/i)).toBeNull();
    expect(screen.queryByLabelText(/due date/i)).toBeNull();
  });

  it('shows the date section for instance projects', () => {
    const instance = makeTask({
      id: 'proj-1',
      title: 'A Project',
      origin: 'instance',
      start_date: '2026-01-01',
    });
    renderModal(instance);
    expect(screen.getByLabelText(/launch date/i)).toBeInTheDocument();
  });
});

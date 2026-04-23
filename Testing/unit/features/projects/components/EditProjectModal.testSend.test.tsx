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
const mockUpdateStatusMutateAsync = vi.fn();

vi.mock('@/features/projects/hooks/useProjectMutations', () => ({
  useUpdateProject: () => ({ mutateAsync: mockUpdateMutateAsync }),
  useDeleteProject: () => ({ mutateAsync: mockDeleteMutateAsync }),
  useUpdateProjectStatus: () => ({ mutateAsync: mockUpdateStatusMutateAsync, isPending: false }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockFunctionsInvoke = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  default: {
    functions: {
      invoke: (...args: unknown[]) => mockFunctionsInvoke(...args),
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
  mockUpdateStatusMutateAsync.mockResolvedValue(undefined);
  mockFunctionsInvoke.mockReset();
});

describe('EditProjectModal — Send test report (Wave 22)', () => {
  it('renders the Send test report button for instance projects', () => {
    const instance = makeTask({
      id: 'proj-1',
      origin: 'instance',
      start_date: '2026-01-01',
      supervisor_email: 'bishop@example.com',
    });
    renderModal(instance);
    expect(screen.getByTestId('send-test-report-btn')).toBeInTheDocument();
  });

  it('does not render the Send test report button for templates', () => {
    const template = makeTask({
      id: 'tmpl-1',
      origin: 'template',
      start_date: '2026-01-01',
      settings: null,
    });
    renderModal(template);
    expect(screen.queryByTestId('send-test-report-btn')).toBeNull();
  });

  it('is disabled when the supervisor email is empty', () => {
    const instance = makeTask({
      id: 'proj-1',
      origin: 'instance',
      start_date: '2026-01-01',
    });
    renderModal(instance);
    expect(screen.getByTestId('send-test-report-btn')).toBeDisabled();
  });

  it('is disabled when the supervisor email is not a valid email', async () => {
    const instance = makeTask({
      id: 'proj-1',
      origin: 'instance',
      start_date: '2026-01-01',
    });
    renderModal(instance);

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/supervisor email/i), {
        target: { value: 'not-an-email' },
      });
    });
    expect(screen.getByTestId('send-test-report-btn')).toBeDisabled();
  });

  it('invokes the supervisor-report function with project_id and dry_run=false, then toasts success', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { success: true, payloads_dispatched: 1, dispatch_failures: 0 },
      error: null,
    });

    const instance = makeTask({
      id: 'proj-1',
      origin: 'instance',
      start_date: '2026-01-01',
      supervisor_email: 'bishop@example.com',
    });
    renderModal(instance);

    const btn = screen.getByTestId('send-test-report-btn');
    await waitFor(() => expect(btn).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('supervisor-report', {
        body: { project_id: 'proj-1', dry_run: false },
      });
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Test report sent');
  });

  it('surfaces a sanitized error toast when the function returns an error', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: new Error('upstream 500 <with internal detail>'),
    });

    const instance = makeTask({
      id: 'proj-1',
      origin: 'instance',
      start_date: '2026-01-01',
      supervisor_email: 'bishop@example.com',
    });
    renderModal(instance);

    const btn = screen.getByTestId('send-test-report-btn');
    await waitFor(() => expect(btn).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to send test report');
    });
    // Make sure we never pass upstream text through to the user.
    for (const call of mockToastError.mock.calls) {
      expect(String(call[0])).not.toContain('upstream');
    }
  });

  it('treats success:true with zero dispatched as a failure (log-only / misconfigured)', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { success: true, payloads_dispatched: 0, dispatch_failures: 0 },
      error: null,
    });

    const instance = makeTask({
      id: 'proj-1',
      origin: 'instance',
      start_date: '2026-01-01',
      supervisor_email: 'bishop@example.com',
    });
    renderModal(instance);

    const btn = screen.getByTestId('send-test-report-btn');
    await waitFor(() => expect(btn).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to send test report');
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});

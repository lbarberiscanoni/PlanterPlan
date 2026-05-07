import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResetPassword from '@/pages/ResetPassword';
import { hasPasswordRecoverySession, markPasswordRecoverySession } from '@/shared/lib/password-recovery';

const mockCompletePasswordReset = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    auth: {
      completePasswordReset: (...args: unknown[]) => mockCompletePasswordReset(...args),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

function renderResetPassword() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <ResetPassword />
    </MemoryRouter>,
  );
}

describe('ResetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompletePasswordReset.mockResolvedValue(undefined);
  });

  it('sets a new password for a valid recovery session', async () => {
    const user = userEvent.setup();
    markPasswordRecoverySession();
    renderResetPassword();

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'new-password-123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mockCompletePasswordReset).toHaveBeenCalledWith('new-password-123');
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Password reset', expect.any(Object));
  });

  it('shows validation before calling the auth client', async () => {
    const user = userEvent.setup();
    markPasswordRecoverySession();
    renderResetPassword();

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'different-password');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });

  it('blocks direct visits without a recovery session marker', async () => {
    const user = userEvent.setup();
    renderResetPassword();

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'new-password-123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('reset link is invalid or expired');
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Could not reset password', expect.any(Object));
  });

  it('surfaces auth errors from the recovery session', async () => {
    const user = userEvent.setup();
    markPasswordRecoverySession();
    mockCompletePasswordReset.mockRejectedValue(new Error('Password should be at least 8 characters'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderResetPassword();

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'new-password-123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Password should be at least 8 characters');
    expect(hasPasswordRecoverySession()).toBe(true);
    expect(mockToastError).toHaveBeenCalledWith('Could not reset password', expect.any(Object));

    vi.mocked(console.error).mockRestore();
  });

  it('keeps a valid recovery session retryable after a reset failure', async () => {
    const user = userEvent.setup();
    markPasswordRecoverySession();
    mockCompletePasswordReset
      .mockRejectedValueOnce(new Error('Temporary auth service failure'))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderResetPassword();

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'new-password-123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary auth service failure');
    expect(hasPasswordRecoverySession()).toBe(true);

    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mockCompletePasswordReset).toHaveBeenCalledTimes(2);
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Password reset', expect.any(Object));
    expect(hasPasswordRecoverySession()).toBe(false);

    vi.mocked(console.error).mockRestore();
  });
});

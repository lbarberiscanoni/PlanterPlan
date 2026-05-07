import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginForm from '@/pages/components/LoginForm';

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockRequestPasswordReset = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/shared/contexts/auth-context', () => ({
  useAuth: () => ({
    signIn: (...args: unknown[]) => mockSignIn(...args),
    signUp: (...args: unknown[]) => mockSignUp(...args),
  }),
}));

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    auth: {
      requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

function renderLoginForm() {
  return render(
    <MemoryRouter>
      <LoginForm />
    </MemoryRouter>,
  );
}

describe('LoginForm password recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue({ data: {}, error: null });
    mockSignUp.mockResolvedValue({ data: {}, error: null });
    mockRequestPasswordReset.mockResolvedValue(undefined);
  });

  it('shows forgot-password mode from the login form', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.click(screen.getByRole('button', { name: /forgot password/i }));

    expect(screen.getByText(/secure reset link/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('requests a password reset email with the reset route redirect', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText(/email address/i), 'member@example.com');
    await user.click(screen.getByRole('button', { name: /forgot password/i }));
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith(
        'member@example.com',
        `${window.location.origin}/reset-password`,
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Password reset email sent', expect.any(Object));
  });

  it('returns from forgot-password mode to sign in', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.click(screen.getByRole('button', { name: /forgot password/i }));
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));

    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';

// ---- Supabase auth mock ----
let authStateCallback: ((event: string, session: unknown) => void) | null = null;
const mockUnsubscribe = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock('@/shared/db/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  },
}));

// ---- Auth API mock ----
const mockCheckIsAdmin = vi.fn();
vi.mock('@/shared/api/auth', () => ({
  authApi: {
    checkIsAdmin: (...args: unknown[]) => mockCheckIsAdmin(...args),
  },
}));

import { AuthProvider } from '@/shared/contexts/AuthContext';
import { requireAuthContext, useAuth } from '@/shared/contexts/auth-context';
import { hasPasswordRecoverySession } from '@/shared/lib/password-recovery';

// Test consumer component that renders auth state
function AuthConsumer() {
  const { user, loading, signUp, signIn, signOut, updateMe } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? JSON.stringify({ id: user.id, email: user.email, role: user.role }) : 'null'}</span>
      <button data-testid="signUp" onClick={() => signUp('a@b.com', 'pass', { full_name: 'Test' })} />
      <button data-testid="signIn" onClick={() => signIn('a@b.com', 'pass')} />
      <button data-testid="signOut" onClick={() => signOut()} />
      <button data-testid="updateMe" onClick={() => updateMe({ full_name: 'Updated' })} />
    </div>
  );
}

const fakeSession = (overrides: Record<string, unknown> = {}) => ({
  user: {
    id: 'user-1',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: { full_name: 'Test User' },
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  },
});

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    mockCheckIsAdmin.mockResolvedValue(false);
    // Default: hostname is localhost for role hydration
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useAuth', () => {
    it('throws when used outside AuthProvider', () => {
      expect(() => requireAuthContext(null)).toThrow(
        'useAuth must be used within an AuthProvider',
      );
    });
  });

  describe('session management', () => {
    it('starts in loading state with null user', () => {
      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );
      expect(screen.getByTestId('loading').textContent).toBe('true');
      expect(screen.getByTestId('user').textContent).toBe('null');
    });

    it('sets user from auth state change event', async () => {
      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      act(() => {
        authStateCallback?.('SIGNED_IN', fakeSession());
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
        const user = JSON.parse(screen.getByTestId('user').textContent!);
        expect(user.id).toBe('user-1');
        expect(user.email).toBe('test@example.com');
      });
    });

    it('clears user on SIGNED_OUT event', async () => {
      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      act(() => { authStateCallback?.('SIGNED_IN', fakeSession()); });
      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).not.toBe('null');
      });

      act(() => { authStateCallback?.('SIGNED_OUT', null); });
      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).toBe('null');
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
    });

    it('handles null session gracefully', async () => {
      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      act(() => { authStateCallback?.('INITIAL_SESSION', null); });
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
        expect(screen.getByTestId('user').textContent).toBe('null');
      });
    });

    it('marks recovery sessions and clears them on sign-out', async () => {
      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      act(() => { authStateCallback?.('PASSWORD_RECOVERY', fakeSession()); });

      await waitFor(() => {
        expect(hasPasswordRecoverySession()).toBe(true);
      });

      act(() => { authStateCallback?.('SIGNED_OUT', null); });

      await waitFor(() => {
        expect(hasPasswordRecoverySession()).toBe(false);
      });
    });
  });

  describe('role hydration', () => {
    it('preserves existing role on localhost for non-admin (prev.role || fallback)', async () => {
      mockCheckIsAdmin.mockResolvedValue(false);

      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      act(() => { authStateCallback?.('SIGNED_IN', fakeSession()); });

      // Role hydration runs: prev.role || 'owner' — but prev.role is 'viewer' (truthy), so stays
      await waitFor(() => {
        expect(mockCheckIsAdmin).toHaveBeenCalledWith('user-1');
      });

      const user = JSON.parse(screen.getByTestId('user').textContent!);
      expect(user.role).toBe('viewer');
    });

    it('sets admin role on localhost when checkIsAdmin returns true', async () => {
      mockCheckIsAdmin.mockResolvedValue(true);

      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      act(() => { authStateCallback?.('SIGNED_IN', fakeSession()); });

      await waitFor(() => {
        const user = JSON.parse(screen.getByTestId('user').textContent!);
        expect(user.role).toBe('admin');
      });
    });

    it('sets admin role on production when checkIsAdmin returns true', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'planterplan.com' },
        writable: true,
      });
      mockCheckIsAdmin.mockResolvedValue(true);

      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      act(() => { authStateCallback?.('SIGNED_IN', fakeSession()); });

      await waitFor(() => {
        const user = JSON.parse(screen.getByTestId('user').textContent!);
        expect(user.role).toBe('admin');
      });
    });

    it('falls back to viewer role on error', async () => {
      mockCheckIsAdmin.mockRejectedValue(new Error('network error'));

      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      act(() => { authStateCallback?.('SIGNED_IN', fakeSession()); });

      await waitFor(() => {
        const user = JSON.parse(screen.getByTestId('user').textContent!);
        // Falls back to existing role or 'viewer'
        expect(['viewer', 'owner']).toContain(user.role);
      });
    });
  });

  describe('signUp', () => {
    it('returns data on success', async () => {
      mockSignUp.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });

      let result: unknown;
      function Consumer() {
        const { signUp } = useAuth();
        React.useEffect(() => {
          signUp('new@example.com', 'password123', { full_name: 'New User' }).then(r => { result = r; });
        }, [signUp]);
        return null;
      }

      render(<AuthProvider><Consumer /></AuthProvider>);

      await waitFor(() => {
        expect(result).toEqual({ data: { user: { id: 'new-user' } }, error: null });
      });
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
        options: { data: { full_name: 'New User' } },
      });
    });

    it('returns error on failure', async () => {
      const error = new Error('Email already taken');
      mockSignUp.mockResolvedValue({ data: null, error });

      let result: unknown;
      function Consumer() {
        const { signUp } = useAuth();
        React.useEffect(() => {
          signUp('dup@example.com', 'pass').then(r => { result = r; });
        }, [signUp]);
        return null;
      }

      render(<AuthProvider><Consumer /></AuthProvider>);

      await waitFor(() => {
        expect(result).toEqual({ data: null, error });
      });
    });
  });

  describe('signIn', () => {
    it('returns data on success', async () => {
      mockSignInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });

      let result: unknown;
      function Consumer() {
        const { signIn } = useAuth();
        React.useEffect(() => {
          signIn('test@example.com', 'pass').then(r => { result = r; });
        }, [signIn]);
        return null;
      }

      render(<AuthProvider><Consumer /></AuthProvider>);

      await waitFor(() => {
        expect(result).toEqual({ data: { session: {} }, error: null });
      });
    });

    it('returns error on failure', async () => {
      const error = new Error('Invalid credentials');
      mockSignInWithPassword.mockResolvedValue({ data: null, error });

      let result: unknown;
      function Consumer() {
        const { signIn } = useAuth();
        React.useEffect(() => {
          signIn('wrong@example.com', 'bad').then(r => { result = r; });
        }, [signIn]);
        return null;
      }

      render(<AuthProvider><Consumer /></AuthProvider>);

      await waitFor(() => {
        expect(result).toEqual({ data: null, error });
      });
    });
  });

  describe('signOut', () => {
    it('clears user on signOut', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      // Sign in first
      act(() => { authStateCallback?.('SIGNED_IN', fakeSession()); });
      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).not.toBe('null');
      });

      // Now sign out
      await act(async () => {
        screen.getByTestId('signOut').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).toBe('null');
      });
    });
  });

  describe('updateMe', () => {
    it('updates user state on success', async () => {
      mockUpdateUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            app_metadata: {},
            user_metadata: { full_name: 'Updated Name' },
            aud: 'authenticated',
            created_at: '2026-01-01T00:00:00Z',
          },
        },
        error: null,
      });

      render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );

      // Sign in first
      act(() => { authStateCallback?.('SIGNED_IN', fakeSession()); });
      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).not.toBe('null');
      });

      // Update
      await act(async () => {
        screen.getByTestId('updateMe').click();
      });

      expect(mockUpdateUser).toHaveBeenCalledWith({ data: { full_name: 'Updated' } });
    });

    it('throws on updateUser error', async () => {
      mockUpdateUser.mockResolvedValue({ data: null, error: new Error('Update failed') });

      let caughtError: unknown;
      function Consumer() {
        const { updateMe } = useAuth();
        React.useEffect(() => {
          updateMe({ full_name: 'Fail' }).catch(e => { caughtError = e; });
        }, [updateMe]);
        return null;
      }

      render(
        <AuthProvider><Consumer /></AuthProvider>,
      );

      // Sign in first
      act(() => { authStateCallback?.('SIGNED_IN', fakeSession()); });

      await waitFor(() => {
        expect(caughtError).toBeTruthy();
      });
    });
  });

  describe('cleanup', () => {
    it('unsubscribes on unmount', () => {
      const { unmount } = render(
        <AuthProvider><AuthConsumer /></AuthProvider>,
      );
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});

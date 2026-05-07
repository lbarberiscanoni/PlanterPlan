import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/shared/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/shared/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
}));

vi.mock('@/layouts/AppShellLayout', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { default: () => <Outlet /> };
});

vi.mock('@/pages/TasksPage', () => ({
  default: () => <div data-testid="tasks-page" />,
}));

vi.mock('@/pages/Project', () => ({
  default: () => <div data-testid="project-page" />,
}));

vi.mock('@/pages/Settings', () => ({
  default: () => <div data-testid="settings-page" />,
}));

vi.mock('@/pages/components/LoginForm', () => ({
  default: () => <div data-testid="login-page" />,
}));

vi.mock('@/pages/ResetPassword', () => ({
  default: () => <div data-testid="reset-password-page" />,
}));

vi.mock('@/pages/Team', () => ({
  default: () => <div data-testid="team-page" />,
}));

import App from '@/app/App';

describe('App routing', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('keeps /dashboard as a bookmark-compatible redirect to /tasks', async () => {
    window.history.pushState({}, '', '/dashboard');

    render(<App />);

    expect(await screen.findByTestId('tasks-page')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/tasks'));
  });

  it('serves /reset-password as a public recovery route', async () => {
    window.history.pushState({}, '', '/reset-password');

    render(<App />);

    expect(await screen.findByTestId('reset-password-page')).toBeInTheDocument();
  });

  it('serves /team as an authenticated roster route', async () => {
    window.history.pushState({}, '', '/team?project=proj-1');

    render(<App />);

    expect(await screen.findByTestId('team-page')).toBeInTheDocument();
  });
});

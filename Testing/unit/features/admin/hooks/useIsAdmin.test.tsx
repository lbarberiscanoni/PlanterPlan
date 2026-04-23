import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsAdmin } from '@/features/admin/hooks/useIsAdmin';

type MockUser = { role: string } | null;
let mockUser: MockUser = null;

vi.mock('@/shared/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

describe('useIsAdmin', () => {
  it('returns true only when user.role === "admin"', () => {
    mockUser = { role: 'admin' };
    expect(renderHook(() => useIsAdmin()).result.current).toBe(true);
  });

  it('returns false for "viewer"', () => {
    mockUser = { role: 'viewer' };
    expect(renderHook(() => useIsAdmin()).result.current).toBe(false);
  });

  it('returns false for "owner" (project-owner, not platform admin)', () => {
    // Regression guard: AuthContext's defaults-to-viewer fix (Phase 1) means
    // `owner` no longer slips in client-side. Even so, `useIsAdmin` must
    // compare against the literal 'admin' role only, not any privileged role.
    mockUser = { role: 'owner' };
    expect(renderHook(() => useIsAdmin()).result.current).toBe(false);
  });

  it('returns false when user is null', () => {
    mockUser = null;
    expect(renderHook(() => useIsAdmin()).result.current).toBe(false);
  });
});

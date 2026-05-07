import { describe, it, expect, vi } from 'vitest';

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

import { mergeSavedEmailAddress } from '@/shared/contexts/saved-email-addresses';

describe('mergeSavedEmailAddress', () => {
  it('adds a new address to the front of an empty list', () => {
    expect(mergeSavedEmailAddress([], 'a@example.com')).toEqual(['a@example.com']);
  });

  it('returns the list unchanged when the address is blank/whitespace', () => {
    expect(mergeSavedEmailAddress(['a@example.com'], '   ')).toEqual(['a@example.com']);
    expect(mergeSavedEmailAddress([], '')).toEqual([]);
  });

  it('trims whitespace on the incoming address', () => {
    expect(mergeSavedEmailAddress([], '  a@example.com  ')).toEqual(['a@example.com']);
  });

  it('de-duplicates case-insensitively (original preserved), moves to front', () => {
    const result = mergeSavedEmailAddress(
      ['b@example.com', 'A@Example.com', 'c@example.com'],
      'a@example.com',
    );
    expect(result).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
  });

  it('moves an existing exact match to the front', () => {
    const result = mergeSavedEmailAddress(
      ['a@example.com', 'b@example.com', 'c@example.com'],
      'b@example.com',
    );
    expect(result).toEqual(['b@example.com', 'a@example.com', 'c@example.com']);
  });

  it('caps the saved list at 5 entries (most-recent wins)', () => {
    const existing = ['e@x.com', 'd@x.com', 'c@x.com', 'b@x.com', 'a@x.com'];
    const result = mergeSavedEmailAddress(existing, 'new@x.com');
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('new@x.com');
    // The oldest entry ('a@x.com') is dropped.
    expect(result).not.toContain('a@x.com');
    expect(result).toEqual(['new@x.com', 'e@x.com', 'd@x.com', 'c@x.com', 'b@x.com']);
  });

  it('does not duplicate when the incoming address is already top-of-list', () => {
    const existing = ['a@example.com', 'b@example.com'];
    const result = mergeSavedEmailAddress(existing, 'a@example.com');
    expect(result).toEqual(['a@example.com', 'b@example.com']);
  });

  it('filters non-string garbage out defensively', () => {
    const existing = ['a@example.com', (null as unknown) as string, (42 as unknown) as string, 'b@example.com'];
    const result = mergeSavedEmailAddress(existing, 'new@example.com');
    expect(result).toEqual(['new@example.com', 'a@example.com', 'b@example.com']);
  });
});

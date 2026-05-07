import { describe, expect, it, vi } from 'vitest';
import {
  clearPasswordRecoverySession,
  hasPasswordRecoverySession,
  markPasswordRecoverySession,
} from '@/shared/lib/password-recovery';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe('password recovery session marker', () => {
  it('marks and recognizes a fresh recovery session', () => {
    const storage = createStorage();

    markPasswordRecoverySession(1_000, storage);

    expect(hasPasswordRecoverySession(1_000, storage)).toBe(true);
  });

  it('clears expired recovery sessions and fails closed', () => {
    const storage = createStorage();

    markPasswordRecoverySession(1_000, storage);

    expect(hasPasswordRecoverySession(31 * 60 * 1_000, storage)).toBe(false);
    expect(storage.removeItem).toHaveBeenCalled();
  });

  it('clears invalid marker values', () => {
    const storage = createStorage();
    storage.setItem('planterplan.password_recovery_session', 'not-a-time');

    expect(hasPasswordRecoverySession(1_000, storage)).toBe(false);
    expect(storage.removeItem).toHaveBeenCalled();
  });

  it('clears the marker explicitly', () => {
    const storage = createStorage();
    markPasswordRecoverySession(1_000, storage);

    clearPasswordRecoverySession(storage);

    expect(hasPasswordRecoverySession(1_000, storage)).toBe(false);
  });
});

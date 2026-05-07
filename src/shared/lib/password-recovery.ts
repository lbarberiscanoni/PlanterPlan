const PASSWORD_RECOVERY_STORAGE_KEY = 'planterplan.password_recovery_session';
const PASSWORD_RECOVERY_TTL_MS = 30 * 60 * 1000;

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getSessionStorage(): RecoveryStorage | null {
 if (typeof window === 'undefined') return null;
 return window.sessionStorage;
}

export function markPasswordRecoverySession(now = Date.now(), storage = getSessionStorage()): void {
 try {
 storage?.setItem(PASSWORD_RECOVERY_STORAGE_KEY, String(now));
 } catch {
 // Storage can be unavailable in privacy modes; the reset form will fail safe.
 }
}

export function clearPasswordRecoverySession(storage = getSessionStorage()): void {
 try {
 storage?.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
 } catch {
 // Storage can be unavailable in privacy modes; ignore and fail closed later.
 }
}

export function hasPasswordRecoverySession(now = Date.now(), storage = getSessionStorage()): boolean {
 try {
 const raw = storage?.getItem(PASSWORD_RECOVERY_STORAGE_KEY);
 if (!raw) return false;

 const markedAt = Number(raw);
 if (!Number.isFinite(markedAt) || markedAt <= 0) {
 clearPasswordRecoverySession(storage);
 return false;
 }

 if (now - markedAt > PASSWORD_RECOVERY_TTL_MS) {
 clearPasswordRecoverySession(storage);
 return false;
 }

 return true;
 } catch {
 return false;
 }
}

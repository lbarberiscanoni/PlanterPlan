import { useAuth } from '@/shared/contexts/AuthContext';

/**
 * Wave 34: derived from the already-hydrated `user.role === 'admin'` assignment
 * in AuthContext (set via `authApi.checkIsAdmin()` at sign-in). No extra RPC
 * per render — just a thin accessor so admin UIs can gate on `isAdmin` without
 * reaching into the full user object.
 */
export function useIsAdmin(): boolean {
    const { user } = useAuth();
    return user?.role === 'admin';
}

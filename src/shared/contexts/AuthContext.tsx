import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/shared/db/client';
import type { Session } from '@supabase/supabase-js';
import type { User, UserMetadata } from '@/shared/db/app.types';
import { authApi } from '@/shared/api/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, userData?: UserMetadata) => Promise<{ data: unknown; error: unknown }>;
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: unknown }>;
  signOut: () => Promise<void>;
  updateMe: (attributes: UserMetadata) => Promise<User>;
  savedEmailAddresses: string[];
  rememberEmailAddress: (address: string) => Promise<void>;
}

const SAVED_EMAIL_CAP = 5;

/** Pure helper: prepend `address` (case-insensitive de-dupe), cap at 5. */
export function mergeSavedEmailAddress(existing: string[], address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return existing;
  const lower = trimmed.toLowerCase();
  const filtered = existing.filter((e) => typeof e === 'string' && e.toLowerCase() !== lower);
  return [trimmed, ...filtered].slice(0, SAVED_EMAIL_CAP);
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Session management (was SessionContext) ---

  useEffect(() => {
    let alive = true;

    const handleSession = (session: Session | null) => {
      if (!session?.user) {
        if (!alive) return;
        setUser(null);
        setLoading(false);
        return;
      }

      const supabaseUser = session.user;
      setUser(prev => ({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        role: prev?.role || 'viewer',
        app_metadata: supabaseUser.app_metadata as UserMetadata,
        user_metadata: supabaseUser.user_metadata as UserMetadata,
        aud: supabaseUser.aud,
        created_at: supabaseUser.created_at
      }));
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else {
        handleSession(session);
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // --- Role hydration (was UserProfileContext) ---

  useEffect(() => {
    if (!user) return;
    let alive = true;

    const fetchRole = async () => {
      // Security: default to the least-privileged role until the async
      // admin check returns. The previous code optimistically set role to
      // 'owner' on localhost and in the post-check default — which (a)
      // created dev/prod parity drift (localhost users looked like owners
      // even though RLS never treated them that way) and (b) meant the
      // brief race window between initial auth + admin-check showed
      // privileged UI affordances to non-owners. Default to 'viewer'
      // everywhere; the project-scoped role is hydrated per-project via
      // `useTeam(projectId)`.
      try {
        const isAdmin = await authApi.checkIsAdmin(user.id);
        if (alive) {
          setUser(prev => prev ? { ...prev, role: isAdmin ? 'admin' : 'viewer' } : null);
        }
      } catch {
        if (alive) setUser(prev => prev ? { ...prev, role: 'viewer' } : null);
      }
    };

    fetchRole();

    return () => { alive = false; };
  }, [user?.id]); // Only re-run if user ID changes

  // --- Auth actions ---

  const signUp = useCallback(async (email: string, password: string, userData: UserMetadata = {}) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: userData } });
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } finally {
      setUser(null);
      setLoading(false);
    }
  }, []);

  const updateMe = useCallback(async (attributes: UserMetadata) => {
    const { data, error } = await supabase.auth.updateUser({ data: attributes });
    if (error) throw error;
    if (!data.user) throw new Error('Failed to update user');

    const updatedUser: User = {
      id: data.user.id,
      email: data.user.email || '',
      role: user?.role || 'viewer',
      app_metadata: data.user.app_metadata as UserMetadata,
      user_metadata: data.user.user_metadata as UserMetadata,
      aud: data.user.aud,
      created_at: data.user.created_at
    };

    setUser(updatedUser);
    return updatedUser;
  }, [user]);

  const savedEmailAddresses = useMemo<string[]>(() => {
    const raw = user?.user_metadata?.saved_email_addresses;
    return Array.isArray(raw) ? raw.filter((e): e is string => typeof e === 'string') : [];
  }, [user]);

  const rememberEmailAddress = useCallback(async (address: string) => {
    const next = mergeSavedEmailAddress(savedEmailAddresses, address);
    if (next.length === savedEmailAddresses.length && next[0] === savedEmailAddresses[0]) return;
    await updateMe({ saved_email_addresses: next });
  }, [savedEmailAddresses, updateMe]);

  const value = useMemo(() => ({
    user,
    loading,
    signUp,
    signIn,
    signOut,
    updateMe,
    savedEmailAddresses,
    rememberEmailAddress,
  }), [user, loading, signUp, signIn, signOut, updateMe, savedEmailAddresses, rememberEmailAddress]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

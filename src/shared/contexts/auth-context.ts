import { createContext, useContext } from 'react';
import type { User, UserMetadata } from '@/shared/db/app.types';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, userData?: UserMetadata) => Promise<{ data: unknown; error: unknown }>;
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: unknown }>;
  signOut: () => Promise<void>;
  updateMe: (attributes: UserMetadata) => Promise<User>;
  savedEmailAddresses: string[];
  rememberEmailAddress: (address: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Checks that the auth context is not null, throwing when no provider is present.
 * @param context The context value returned from `useContext(AuthContext)`.
 * @returns The non-null auth context value.
 */
export function requireAuthContext(context: AuthContextType | null): AuthContextType {
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Reads the current authentication context.
 * @returns The current auth state and auth action handlers.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  return requireAuthContext(context);
};

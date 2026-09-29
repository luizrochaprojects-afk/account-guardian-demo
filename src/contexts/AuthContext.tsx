import { createContext, useContext } from 'react';
import { DEMO_USER, type DemoUser } from '@/demo/seed/org';

interface AuthContextValue {
  user: DemoUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: DEMO_USER, loading: false });

/**
 * Demo auth. The production app runs one Supabase auth listener here and gates
 * every route behind a session; the portfolio edition has no sign-in, so every
 * visitor is the same fictional user, signed in from the first render.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: DEMO_USER, loading: false }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

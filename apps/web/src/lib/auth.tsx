import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import type { Organization, Session, User } from './types';

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated';
  user: User | null;
  organization: Organization | null;
  token: string | null;
}

interface AuthApi extends AuthState {
  login: (email: string, password: string) => Promise<Session>;
  register: (payload: unknown) => Promise<Session>;
  logout: () => void;
  /** Reload user + organization (e.g. after verification or a settings change) */
  refresh: () => Promise<void>;
  setOrganization: (o: Organization) => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<AuthState>(() => ({
    status: tokenStore.get() ? 'loading' : 'anonymous',
    user: null,
    organization: null,
    token: tokenStore.get(),
  }));

  const logout = useCallback(() => {
    tokenStore.clear();
    qc.clear();
    setState({ status: 'anonymous', user: null, organization: null, token: null });
  }, [qc]);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<{ user: User; organization: Organization | null }>('/auth/me');
      setState((s) => ({ ...s, status: 'authenticated', user: me.user, organization: me.organization }));
    } catch {
      logout();
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (state.status === 'loading') void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = useCallback((s: Session) => {
    tokenStore.set(s.accessToken);
    setState({ status: 'authenticated', user: s.user, organization: s.organization, token: s.accessToken });
    return s;
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      ...state,
      login: async (email, password) => accept(await api.post<Session>('/auth/login', { email, password })),
      register: async (payload) => accept(await api.post<Session>('/auth/register', payload)),
      logout,
      refresh,
      setOrganization: (o) => setState((s) => ({ ...s, organization: o })),
    }),
    [state, accept, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Home path for each role */
export function homeFor(user: User | null, org: Organization | null) {
  if (!user) return '/login';
  if (user.role === 'ADMIN') return '/admin';
  if (org && org.status !== 'ACTIVE') return '/pending';
  return user.role === 'DONOR' ? '/donor' : '/charity';
}

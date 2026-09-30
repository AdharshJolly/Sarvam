import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { UserPublic } from "@contracts/types";
import { api, getStoredToken, setStoredToken } from "../api/client";

export interface AuthContextValue {
  user: UserPublic | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, displayName: string) => Promise<void>;
  updateProfile: (data: { display_name?: string; password?: string }) => Promise<void>;
  deleteAccount: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      const stored = getStoredToken();
      if (!stored) {
        setLoading(false);
        return;
      }
      try {
        const currentUser = await api.me();
        if (!cancelled) {
          setUser(currentUser);
          setToken(stored);
        }
      } catch {
        if (!cancelled) {
          setStoredToken(null);
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, pass: string) => {
    setError(null);
    try {
      const res = await api.login({ email, password: pass });
      setStoredToken(res.token);
      setToken(res.token);
      setUser(res.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to sign in";
      setError(msg);
      throw err;
    }
  }, []);

  const register = useCallback(async (email: string, pass: string, displayName: string) => {
    setError(null);
    try {
      const res = await api.register({ email, password: pass, display_name: displayName });
      setStoredToken(res.token);
      setToken(res.token);
      setUser(res.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to register";
      setError(msg);
      throw err;
    }
  }, []);

  const updateProfile = useCallback(async (data: { display_name?: string; password?: string }) => {
    setError(null);
    try {
      const updated = await api.updateProfile(data);
      setUser(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update profile";
      setError(msg);
      throw err;
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    setError(null);
    try {
      await api.deleteAccount();
    } finally {
      setStoredToken(null);
      setToken(null);
      setUser(null);
      window.location.hash = "#/";
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      setStoredToken(null);
      setToken(null);
      setUser(null);
      window.location.hash = "#/";
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, error, login, register, updateProfile, deleteAccount, logout, clearError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const fallbackAuth: AuthContextValue = {
  user: null,
  token: null,
  loading: false,
  error: null,
  login: async () => {},
  register: async () => {},
  updateProfile: async () => {},
  deleteAccount: async () => {},
  logout: async () => {},
  clearError: () => {},
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  return ctx ?? fallbackAuth;
}


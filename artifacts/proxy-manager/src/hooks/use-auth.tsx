import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

type AuthStatus = {
  registrationOpen: boolean;
  authenticated: boolean;
  username: string | null;
};

type AuthContextValue = AuthStatus & {
  loading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({
    registrationOpen: false,
    authenticated: false,
    username: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await apiFetch<AuthStatus>("/api/auth/status");
    setStatus(data);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    await refresh();
  }, [refresh]);

  const register = useCallback(async (username: string, password: string) => {
    await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    await refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ ...status, loading, refresh, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

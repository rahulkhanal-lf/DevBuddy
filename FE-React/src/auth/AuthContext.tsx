import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try { return localStorage.getItem("mindflow_token"); } catch { return null; }
  });
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem("mindflow_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  function login(newToken: string, newUser: AuthUser) {
    setToken(newToken);
    setUser(newUser);
    try {
      localStorage.setItem("mindflow_token", newToken);
      localStorage.setItem("mindflow_user", JSON.stringify(newUser));
    } catch {}
  }

  function logout() {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem("mindflow_token");
      localStorage.removeItem("mindflow_user");
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

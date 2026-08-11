import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Admin, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  admin: Admin | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (admin: Admin, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Max time to wait for /auth/me before clearing the stale token.
// In WebView navigator.onLine is often false, which with networkMode:'always'
// is already handled. This is a last-resort safety net.
const AUTH_LOAD_TIMEOUT_MS = 10_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [hasToken, setHasToken] = useState(() => !!localStorage.getItem("dhd_admin_token"));
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data, isLoading, isError } = useGetMe({
    query: { 
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: Infinity,
      networkMode: 'always',
      // Only fire if there's a stored admin token
      enabled: hasToken,
    }
  });

  // Safety net: if /me is still loading after AUTH_LOAD_TIMEOUT_MS, the token
  // is stale or the WebView is blocking the request — clear it so the user
  // reaches the login page instead of seeing a spinner forever.
  useEffect(() => {
    if (!hasToken || !isLoading) return;
    const tid = setTimeout(() => {
      console.warn('[Auth] /me timed out — clearing stale admin token');
      localStorage.removeItem("dhd_admin_token");
      setHasToken(false);
      setAdmin(null);
    }, AUTH_LOAD_TIMEOUT_MS);
    return () => clearTimeout(tid);
  }, [hasToken, isLoading]);

  useEffect(() => {
    if (data) {
      // Validate it's actually an admin session (not an employee session accidentally stored)
      const userType = (data as unknown as { userType?: string }).userType;
      if (!userType || userType === "admin") {
        setAdmin(data);
      } else {
        // Wrong session type — clear it
        localStorage.removeItem("dhd_admin_token");
        setHasToken(false);
        setAdmin(null);
      }
    } else if (isError) {
      setAdmin(null);
    }
  }, [data, isError]);

  const login = (adminData: Admin, token: string) => {
    localStorage.setItem("dhd_admin_token", token);
    setHasToken(true);
    setAdmin(adminData);
    queryClient.setQueryData(getGetMeQueryKey(), adminData);
    // Navigate via direct URL change — avoids potential Wouter/history failures
    // inside async event handlers in the Replit proxied iframe.
    window.location.href = "/offices";
  };

  const logout = () => {
    localStorage.removeItem("dhd_admin_token");
    setHasToken(false);
    setAdmin(null);
    queryClient.setQueryData(getGetMeQueryKey(), null);
    queryClient.clear();
    setLocation("/");
  };

  return (
    <AuthContext.Provider
      value={{
        admin,
        isLoading,
        isAuthenticated: !!admin,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

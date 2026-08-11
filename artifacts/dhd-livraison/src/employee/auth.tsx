import React, { createContext, useContext, ReactNode, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { empFetch, EmpApiError, getEmployeeToken, setEmployeeToken } from "./api";

export interface EmployeeProfile {
  id: number;
  officeId: number;
  officeName: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  position: string;
  hireDate: string | null;
  baseSalary: number;
  paymentDay: number | null;
  workStartTime: string;
  workEndTime: string;
  isActive: boolean;
}

interface EmployeeAuthContextType {
  employee: EmployeeProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (employee: EmployeeProfile, token: string) => void;
  logout: () => void;
}

const EmployeeAuthContext = createContext<EmployeeAuthContextType | undefined>(undefined);

export function EmployeeAuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Track token with React state so isLoading updates in the same render
  const [hasToken, setHasToken] = useState(() => !!getEmployeeToken());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["employee", "me"],
    queryFn: () => empFetch<EmployeeProfile>("/employee/me"),
    enabled: hasToken,
    retry: false,
    staleTime: 60_000,
    // Always fetch inside WebView where navigator.onLine may be false
    networkMode: 'always',
  });

  // Auto-clear stale / expired tokens to prevent redirect loops
  React.useEffect(() => {
    if (isError && error instanceof EmpApiError && (error.status === 401 || error.status === 403)) {
      setEmployeeToken(null);
      setHasToken(false);
      queryClient.removeQueries({ queryKey: ["employee"] });
    }
  }, [isError, error, queryClient]);

  const login = useCallback((employee: EmployeeProfile, token: string) => {
    // 1. Persist token
    setEmployeeToken(token);
    // 2. Put employee data in cache immediately so the query returns it on first render
    queryClient.setQueryData(["employee", "me"], employee);
    // 3. Enable the query — this re-render will see isAuthenticated=true from cache
    setHasToken(true);
    // Navigation is intentionally left to the caller (emp-login.tsx useEffect)
    // so it only fires AFTER isAuthenticated has flipped to true in React state.
  }, [queryClient]);

  const logout = useCallback(() => {
    empFetch("/employee/auth/logout", { method: "POST" }).catch(() => {});
    setEmployeeToken(null);
    setHasToken(false);
    queryClient.removeQueries({ queryKey: ["employee"] });
    setLocation("/portal/login");
  }, [queryClient, setLocation]);

  const isAuthenticated = !!data;

  return (
    <EmployeeAuthContext.Provider
      value={{
        employee: data ?? null,
        isLoading: hasToken && isLoading && !isAuthenticated,
        isAuthenticated,
        login,
        logout,
      }}
    >
      {children}
    </EmployeeAuthContext.Provider>
  );
}

export const useEmployeeAuth = () => {
  const ctx = useContext(EmployeeAuthContext);
  if (!ctx) throw new Error("useEmployeeAuth must be used within EmployeeAuthProvider");
  return ctx;
};

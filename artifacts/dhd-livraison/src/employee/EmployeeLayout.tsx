import { ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useEmployeeAuth } from './auth';
import { BottomNav } from './components/BottomNav';
import { EmpNotificationBell } from './components/EmpNotificationBell';
import { getEmployeeToken } from './api';
import { EmployeeAvatar } from './components/EmployeeAvatar';
import { QrCode, Settings2 } from 'lucide-react';

export function EmployeeProtected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, employee } = useEmployeeAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!getEmployeeToken() && !isLoading && !isAuthenticated) {
      setLocation('/portal/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (!isAuthenticated && (isLoading || getEmployeeToken())) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-3 bg-background">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="employee-shell min-h-[100dvh]">
      {/* Employee top header with notification bell */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between">
        <div className="flex items-center gap-3">
          <EmployeeAvatar employee={employee} size="sm" />
          <div className="leading-tight">
            <p className="text-sm font-bold">{employee?.firstName} {employee?.lastName}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>{employee?.officeName || 'DHD Livraison'}</span>
              <span className="text-primary">•</span>
              <span>بوابة الموظف</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <EmpNotificationBell />
          <button
            type="button"
            onClick={() => {
              setLocation('/portal');
              window.setTimeout(() => window.dispatchEvent(new Event('employee-open-scanner')), 120);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label="ماسح QR"
          >
            <QrCode className="h-5 w-5" />
          </button>
          <Link href="/portal/account" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" aria-label="الإعدادات">
            <Settings2 className="h-5 w-5" />
          </Link>
        </div>
        </div>
      </header>

      <main className="employee-enter mx-auto w-full max-w-lg px-4 pt-6 pb-28 sm:px-6">{children}</main>
      <BottomNav />
    </div>
  );
}

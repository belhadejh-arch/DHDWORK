import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  Hash,
  LogIn,
  LogOut,
  Mail,
  Phone,
  QrCode,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import {
  Route,
  Switch,
  Redirect,
  Link,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type Employee = {
  id: number;
  firstName?: string;
  lastName?: string;
  employeeCode?: string | null;
  serialNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  role?: string | null;
  officeName?: string | null;
  joinedAt?: string | null;
  status?: string;
  isActive?: boolean;
};

type LoginResponse = {
  success: boolean;
  message?: string;
  token?: string;
  employee?: Employee;
};

const EMPLOYEE_STORAGE_KEY = 'dhd_employee_session';

function readStoredEmployee(): Employee | null {
  try {
    const value = window.localStorage.getItem(EMPLOYEE_STORAGE_KEY);
    return value ? (JSON.parse(value) as Employee) : null;
  } catch {
    return null;
  }
}

function useEmployeeSession() {
  const [, navigate] = useLocation();
  const [employee, setEmployee] = useState<Employee | null>(() => readStoredEmployee());
  const [isChecking, setIsChecking] = useState(() => !readStoredEmployee());

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
    window.localStorage.removeItem('dhd_employee_token');
    setEmployee(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredEmployee();
    const token = window.localStorage.getItem('dhd_employee_token');

    // A cached employee renders the account immediately. The server check runs
    // in the background to keep the page fast without trusting stale sessions.
    fetch('/employee/me', {
      credentials: 'include',
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('session-expired');
        return response.json() as Promise<Employee>;
      })
      .then((currentEmployee) => {
        if (cancelled) return;
        setEmployee(currentEmployee);
        window.localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(currentEmployee));
      })
      .catch(() => {
        if (!cancelled && !stored) clearSession();
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (code: string, mode: 'serial' | 'qr') => {
    const endpoint = mode === 'qr' ? '/api/auth/login/qr' : '/api/auth/login/serial';
    const body = mode === 'qr' ? { qrCodeData: code } : { serial: code };
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as LoginResponse;
    if (!response.ok || !data.success || !data.employee) {
      throw new Error(data.message || 'تعذر تسجيل الدخول');
    }

    // Persist and navigate from the login response itself; do not wait for a
    // second /me request before showing the employee account.
    setEmployee(data.employee);
    window.localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(data.employee));
    if (data.token) window.localStorage.setItem('dhd_employee_token', data.token);
    navigate('/portal/account', { replace: true });
  }, [navigate]);

  const logout = useCallback(async () => {
    clearSession();
    await fetch('/employee/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    navigate('/portal/login', { replace: true });
  }, [clearSession, navigate]);

  return { employee, isChecking, login, logout };
}

function Brand() {
  return (
    <div className="dhd-brand">
      <div className="dhd-brand-mark"><ShieldCheck size={24} strokeWidth={2.3} /></div>
      <div>
        <strong>DHD Livraison</strong>
        <span>بوابة الموظف</span>
      </div>
    </div>
  );
}

function EmployeeLogin() {
  const [, navigate] = useLocation();
  const { employee, isChecking, login } = useEmployeeSession();
  const [mode, setMode] = useState<'serial' | 'qr'>('serial');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (employee && !isChecking) navigate('/portal/account', { replace: true });
  }, [employee, isChecking, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code.trim();
    if (!value || isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    try {
      await login(value, mode);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الدخول');
      setIsSubmitting(false);
    }
  };

  return (
    <main className="dhd-auth-page">
      <section className="dhd-auth-card" aria-labelledby="login-title">
        <Brand />
        <div className="dhd-auth-intro">
          <p className="dhd-eyebrow">دخول آمن وسريع</p>
          <h1 id="login-title">مرحباً بك في حسابك</h1>
          <p>أدخل كود الموظف للانتقال مباشرة إلى حسابك.</p>
        </div>

        <div className="dhd-login-tabs" role="tablist" aria-label="طريقة تسجيل الدخول">
          <button type="button" className={mode === 'serial' ? 'is-active' : ''} onClick={() => { setMode('serial'); setError(''); }}>
            <Hash size={17} /> كود الموظف
          </button>
          <button type="button" className={mode === 'qr' ? 'is-active' : ''} onClick={() => { setMode('qr'); setError(''); }}>
            <QrCode size={17} /> رمز QR
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dhd-login-form">
          <label htmlFor="employee-code">{mode === 'qr' ? 'بيانات رمز QR' : 'الرقم التسلسلي أو كود الموظف'}</label>
          <div className="dhd-input-wrap">
            {mode === 'qr' ? <QrCode size={20} aria-hidden="true" /> : <Hash size={20} aria-hidden="true" />}
            <input
              id="employee-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={mode === 'qr' ? 'الصق بيانات الرمز هنا' : 'مثال: EMP-1001'}
              autoComplete="off"
              autoFocus
              required
              dir="ltr"
            />
          </div>
          {error && <p className="dhd-form-error" role="alert">{error}</p>}
          <button className="dhd-primary-button" type="submit" disabled={isSubmitting || !code.trim()}>
            {isSubmitting ? <><span className="dhd-spinner" /> جارٍ التحقق...</> : <><LogIn size={19} /> تسجيل الدخول</>}
          </button>
        </form>

        <p className="dhd-auth-note"><ShieldCheck size={16} /> يتم التحقق من بياناتك مباشرة وبشكل آمن</p>
      </section>
    </main>
  );
}

function EmployeeAccount() {
  const { employee, isChecking, logout } = useEmployeeSession();
  if (!employee && isChecking) return <LoadingScreen />;
  if (!employee) return <Redirect to="/portal/login" />;

  const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'الموظف';
  const code = employee.employeeCode || employee.serialNumber || '—';
  const joinedDate = employee.joinedAt
    ? new Intl.DateTimeFormat('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(employee.joinedAt))
    : 'غير محدد';

  return (
    <main className="dhd-portal-page">
      <header className="dhd-portal-header">
        <Brand />
        <button className="dhd-logout-button" type="button" onClick={logout}><LogOut size={17} /> خروج</button>
      </header>
      <div className="dhd-portal-content">
        <Link href="/portal" className="dhd-back-link"><ArrowLeft size={17} /> الرئيسية</Link>
        <section className="dhd-profile-hero">
          <div className="dhd-avatar"><UserRound size={34} /></div>
          <div>
            <p className="dhd-eyebrow">الحساب الشخصي</p>
            <h1>{fullName}</h1>
            <p>{employee.position || employee.role || 'موظف'} {employee.officeName ? ` · ${employee.officeName}` : ''}</p>
          </div>
          <span className="dhd-status"><BadgeCheck size={17} /> حساب نشط</span>
        </section>

        <section className="dhd-account-grid" aria-label="بيانات الحساب">
          <InfoCard icon={<Hash />} label="كود الموظف" value={code} ltr />
          <InfoCard icon={<Building2 />} label="المكتب" value={employee.officeName || 'غير محدد'} />
          <InfoCard icon={<Phone />} label="الهاتف" value={employee.phone || 'غير مضاف'} ltr />
          <InfoCard icon={<Mail />} label="البريد الإلكتروني" value={employee.email || 'غير مضاف'} ltr />
          <InfoCard icon={<CalendarDays />} label="تاريخ الانضمام" value={joinedDate} />
          <InfoCard icon={<WalletCards />} label="المسمى الوظيفي" value={employee.position || employee.role || 'غير محدد'} />
        </section>
      </div>
    </main>
  );
}

function InfoCard({ icon, label, value, ltr }: { icon: ReactNode; label: string; value: string; ltr?: boolean }) {
  return (
    <article className="dhd-info-card">
      <div className="dhd-info-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong dir={ltr ? 'ltr' : undefined}>{value}</strong>
      </div>
    </article>
  );
}

function EmployeeHome() {
  const { employee, isChecking, logout } = useEmployeeSession();
  if (!employee && isChecking) return <LoadingScreen />;
  if (!employee) return <Redirect to="/portal/login" />;
  const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'الموظف';

  return (
    <main className="dhd-portal-page">
      <header className="dhd-portal-header"><Brand /><button className="dhd-logout-button" type="button" onClick={logout}><LogOut size={17} /> خروج</button></header>
      <div className="dhd-portal-content">
        <section className="dhd-welcome-card">
          <div><p className="dhd-eyebrow">تم تسجيل الدخول بنجاح</p><h1>أهلاً {fullName}</h1><p>يمكنك الوصول إلى بيانات حسابك من هنا.</p></div>
          <div className="dhd-welcome-icon"><BadgeCheck size={32} /></div>
        </section>
        <Link href="/portal/account" className="dhd-account-link"><span><UserRound size={20} /> عرض حسابي</span><ArrowLeft size={18} /></Link>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return <main className="dhd-loading"><span className="dhd-spinner dhd-spinner-dark" /> جارٍ تحميل الحساب...</main>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={() => <Redirect to="/portal/login" />} />
        <Route path="/portal/login" component={EmployeeLogin} />
        <Route path="/portal/account" component={EmployeeAccount} />
        <Route path="/portal" component={EmployeeHome} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

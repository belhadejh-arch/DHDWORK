import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  BadgeCheck,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ClipboardCheck,
  FileText,
  Hash,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Phone,
  QrCode,
  ShieldCheck,
  Trash2,
  UserRound,
  WalletCards,
  XCircle,
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

type AttendanceRecord = {
  id: number;
  date?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  workedMinutes?: number | null;
  lateMinutes?: number | null;
  isAbsent?: boolean | null;
};

type ViolationRecord = {
  id: number;
  reason?: string | null;
  violationType?: string | null;
  type?: string | null;
  amount?: string | number | null;
  deductionAmount?: string | number | null;
  violationDate?: string | null;
  date?: string | null;
  status?: string | null;
};

type NotificationRecord = {
  id: number;
  type?: string | null;
  message?: string | null;
  isRead?: boolean | null;
  createdAt?: string | null;
  targetPath?: string | null;
};

const notificationCopy = {
  ar: {
    title: 'الإشعارات',
    unread: (count: number) => `${count} غير مقروءة`,
    allRead: 'كل الإشعارات مقروءة',
    loading: 'جارٍ تحميل الإشعارات...',
    empty: 'لا توجد إشعارات.',
    read: 'مقروء',
    unreadLabel: 'غير مقروء',
    markAll: 'تحديد الكل كمقروء',
    deleteBox: 'حذف صندوق الإشعارات',
    delete: 'حذف الإشعار',
    mark: 'تحديد الإشعار كمقروء',
    newNotification: 'إشعار جديد',
  },
  fr: {
    title: 'Notifications',
    unread: (count: number) => `${count} non lue${count > 1 ? 's' : ''}`,
    allRead: 'Toutes les notifications sont lues',
    loading: 'Chargement des notifications...',
    empty: 'Aucune notification.',
    read: 'Lue',
    unreadLabel: 'Non lue',
    markAll: 'Tout marquer comme lu',
    deleteBox: 'Vider la boîte de notifications',
    delete: 'Supprimer la notification',
    mark: 'Marquer comme lue',
    newNotification: 'Nouvelle notification',
  },
  en: {
    title: 'Notifications',
    unread: (count: number) => `${count} unread`,
    allRead: 'All notifications are read',
    loading: 'Loading notifications...',
    empty: 'No notifications.',
    read: 'Read',
    unreadLabel: 'Unread',
    markAll: 'Mark all as read',
    deleteBox: 'Clear notification inbox',
    delete: 'Delete notification',
    mark: 'Mark notification as read',
    newNotification: 'New notification',
  },
} as const;

function getNotificationCopy() {
  const language = window.localStorage.getItem('dhd-language');
  return notificationCopy[language === 'fr' || language === 'en' ? language : 'ar'];
}

const EMPLOYEE_STORAGE_KEY = 'dhd_employee_session';
const EMPLOYEE_TOKEN_KEY = 'dhd_employee_token';

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
    const token = window.localStorage.getItem(EMPLOYEE_TOKEN_KEY);

    fetch('/api/auth/me', {
      credentials: 'include',
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('session-expired');
        const data = await response.json() as { isAuthenticated?: boolean; userType?: string; employee?: Employee };
        if (!data.isAuthenticated || data.userType !== 'employee' || !data.employee) {
          throw new Error('session-expired');
        }
        return data.employee;
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

    setEmployee(data.employee);
    window.localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(data.employee));
    if (data.token) window.localStorage.setItem(EMPLOYEE_TOKEN_KEY, data.token);
    navigate('/portal', { replace: true });
  }, [navigate]);

  const logout = useCallback(async () => {
    clearSession();
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
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

function NotificationPanel() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;
  const copy = getNotificationCopy();

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/notifications', {
        credentials: 'include',
        headers: { Accept: 'application/json', ...employeeAuthHeaders() },
      });
      if (!response.ok) return;
      const data = await response.json() as NotificationRecord[];
      setNotifications(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 15_000);
    const stream = typeof EventSource === 'undefined'
      ? null
      : new EventSource('/api/notifications/stream');
    if (stream) {
      stream.onmessage = () => void loadNotifications();
      stream.onerror = () => {
        // EventSource reconnects automatically; polling remains the fallback.
      };
    }
    const refreshOnFocus = () => void loadNotifications();
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      stream?.close();
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [loadNotifications]);

  const mutateNotification = async (id: number, method: 'read' | 'delete') => {
    setIsMutating(true);
    try {
      const response = await fetch(`/api/notifications/${id}${method === 'read' ? '/read' : ''}`, {
        method: method === 'read' ? 'POST' : 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...employeeAuthHeaders() },
      });
      if (!response.ok) return;
      if (method === 'delete') {
        setNotifications((current) => current.filter((notification) => notification.id !== id));
      } else {
        setNotifications((current) => current.map((notification) =>
          notification.id === id ? { ...notification, isRead: true } : notification,
        ));
      }
    } finally {
      setIsMutating(false);
    }
  };

  const markAllAsRead = async () => {
    if (!unreadCount || isMutating) return;
    setIsMutating(true);
    try {
      const response = await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...employeeAuthHeaders() },
      });
      if (response.ok) {
        setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
      }
    } finally {
      setIsMutating(false);
    }
  };

  const deleteAll = async () => {
    if (!notifications.length || isMutating) return;
    setIsMutating(true);
    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...employeeAuthHeaders() },
      });
      if (response.ok) setNotifications([]);
    } finally {
      setIsMutating(false);
    }
  };

  const openNotification = async (notification: NotificationRecord) => {
    if (!notification.isRead) {
      await mutateNotification(notification.id, 'read');
    }
    if (notification.targetPath) {
      window.location.assign(notification.targetPath);
    }
  };

  return (
    <div className="dhd-notification-wrap">
      <button
        type="button"
        className={`dhd-notification-trigger ${unreadCount ? 'has-unread' : ''}`}
        aria-label={`الإشعارات${unreadCount ? `، ${unreadCount} غير مقروءة` : ''}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Bell size={19} />
        {unreadCount > 0 && <span className="dhd-notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {isOpen && (
        <>
          <div className="dhd-notification-overlay" onClick={() => setIsOpen(false)} />
          <section className="dhd-notification-popover" aria-label={copy.title}>
            <div className="dhd-notification-heading">
              <div>
                <strong>{copy.title}</strong>
                <span>{unreadCount ? copy.unread(unreadCount) : copy.allRead}</span>
              </div>
              <div className="dhd-notification-heading-actions">
                <button type="button" onClick={() => void markAllAsRead()} disabled={!unreadCount || isMutating} title={copy.markAll}>
                  <Check size={14} /> {copy.markAll}
                </button>
                <button type="button" className="is-danger" onClick={() => void deleteAll()} disabled={!notifications.length || isMutating} title={copy.deleteBox}>
                  <Trash2 size={14} /> {copy.deleteBox}
                </button>
              </div>
            </div>
            <div className="dhd-notification-list">
              {isLoading ? (
                <p className="dhd-notification-empty">{copy.loading}</p>
              ) : notifications.length === 0 ? (
                <p className="dhd-notification-empty">{copy.empty}</p>
              ) : notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`dhd-notification-item ${notification.isRead ? 'is-read' : 'is-unread'}`}
                >
                  <button
                    type="button"
                    className="dhd-notification-content"
                    onClick={() => void openNotification(notification)}
                  >
                    <span className="dhd-notification-state" aria-hidden="true" />
                    <span>
                      <strong>{notification.isRead ? copy.read : copy.unreadLabel}</strong>
                      <span>{notification.message || copy.newNotification}</span>
                      <small>{notification.createdAt ? formatRecordDate(notification.createdAt) : 'الآن'}</small>
                    </span>
                  </button>
                  {!notification.isRead && (
                    <button
                      type="button"
                      className="dhd-notification-mark-read"
                      aria-label={copy.mark}
                      onClick={(event) => { event.stopPropagation(); void mutateNotification(notification.id, 'read'); }}
                      disabled={isMutating}
                    >
                      <Check size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="dhd-notification-delete"
                    aria-label={copy.delete}
                    onClick={(event) => { event.stopPropagation(); void mutateNotification(notification.id, 'delete'); }}
                    disabled={isMutating}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
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
    if (employee && !isChecking) navigate('/portal', { replace: true });
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
  return <Redirect to="/portal" />;
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
  const [qrToken, setQrToken] = useState('');
  const [attendanceAction, setAttendanceAction] = useState<'checkin' | 'checkout' | null>(null);
  const [attendanceError, setAttendanceError] = useState('');
  const { attendance, violations, isLoading, error, refresh } = useEmployeePortalData(employee);

  if (!employee && isChecking) return <LoadingScreen />;
  if (!employee) return <Redirect to="/portal/login" />;
  const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'الموظف';
  const code = employee.employeeCode || employee.serialNumber || '—';
  const joinedDate = employee.joinedAt
    ? new Intl.DateTimeFormat('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(employee.joinedAt))
    : 'غير محدد';
  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = attendance.find((item) => String(item.date || '').slice(0, 10) === today);

  const submitAttendance = async (action: 'checkin' | 'checkout') => {
    if (!qrToken.trim() || attendanceAction) return;
    setAttendanceError('');
    setAttendanceAction(action);
    try {
      const position = await getCurrentPosition();
      const response = await fetch(`/api/attendance/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...employeeAuthHeaders() },
        body: JSON.stringify({
          qrToken: qrToken.trim(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message || 'تعذر تسجيل العملية');
      setQrToken('');
      await refresh();
    } catch (reason) {
      setAttendanceError(reason instanceof Error ? reason.message : 'تعذر تسجيل العملية');
    } finally {
      setAttendanceAction(null);
    }
  };

  return (
    <main className="dhd-portal-page">
      <header className="dhd-portal-header">
        <Brand />
        <div className="dhd-portal-actions">
          <NotificationPanel />
          <button className="dhd-logout-button" type="button" onClick={logout}>
            <LogOut size={17} /> خروج
          </button>
        </div>
      </header>
      <div className="dhd-portal-content">
        <section className="dhd-profile-hero">
          <div className="dhd-avatar"><UserRound size={34} /></div>
          <div>
            <p className="dhd-eyebrow">حساب الموظف</p>
            <h1>أهلاً {fullName}</h1>
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

        <section className="dhd-section-card" aria-labelledby="attendance-title">
          <div className="dhd-section-heading">
            <div><p className="dhd-eyebrow">الحضور والانصراف</p><h2 id="attendance-title">سجل حضوري</h2></div>
            <ClipboardCheck size={25} />
          </div>
          <div className="dhd-attendance-actions">
            <label htmlFor="office-qr">رمز QR الخاص بالمكتب</label>
            <div className="dhd-input-wrap">
              <QrCode size={19} aria-hidden="true" />
              <input id="office-qr" value={qrToken} onChange={(event) => setQrToken(event.target.value)} placeholder="امسح أو الصق رمز المكتب" dir="ltr" autoComplete="off" />
            </div>
            <div className="dhd-action-buttons">
              <button type="button" className="dhd-action-button is-checkin" disabled={!qrToken.trim() || Boolean(attendanceAction) || Boolean(todayAttendance?.checkInTime)} onClick={() => submitAttendance('checkin')}>
                <LogIn size={17} /> {attendanceAction === 'checkin' ? 'جارٍ التسجيل...' : 'تسجيل الحضور'}
              </button>
              <button type="button" className="dhd-action-button is-checkout" disabled={!qrToken.trim() || Boolean(attendanceAction) || !todayAttendance?.checkInTime || Boolean(todayAttendance?.checkOutTime)} onClick={() => submitAttendance('checkout')}>
                <LogOut size={17} /> {attendanceAction === 'checkout' ? 'جارٍ التسجيل...' : 'تسجيل الخروج'}
              </button>
            </div>
            <p className="dhd-helper"><MapPin size={14} /> يجب تفعيل GPS والتواجد داخل نطاق المكتب.</p>
            {attendanceError && <p className="dhd-form-error" role="alert">{attendanceError}</p>}
          </div>
          <AttendanceTable records={attendance} isLoading={isLoading} error={error} />
        </section>

        <section className="dhd-section-card" aria-labelledby="violations-title">
          <div className="dhd-section-heading">
            <div><p className="dhd-eyebrow">المتابعة الإدارية</p><h2 id="violations-title">مخالفاتي</h2></div>
            <XCircle size={25} />
          </div>
          {isLoading ? <p className="dhd-empty-state">جارٍ تحميل المخالفات...</p> : violations.length === 0 ? <p className="dhd-empty-state">لا توجد مخالفات مسجلة في حسابك.</p> : (
            <div className="dhd-record-list">
              {violations.map((violation) => (
                <article className="dhd-record-row" key={violation.id}>
                  <div><strong>{violation.violationType || violation.type || 'مخالفة'}</strong><span>{violation.reason || 'بدون سبب موضح'}</span></div>
                  <div className="dhd-record-meta"><strong>{violation.amount ?? violation.deductionAmount ?? 0} دج</strong><span>{formatRecordDate(violation.violationDate || violation.date)}</span></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <SalarySection />
      </div>
    </main>
  );
}

type SalaryRecord = {
  id: number;
  month?: string | null;
  year?: number | null;
  baseSalary?: string | number | null;
  finalSalary?: string | number | null;
  status?: string | null;
  receivedAt?: string | null;
};

function SalarySection() {
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const [receiving, setReceiving] = useState<number | null>(null);

  const loadSalaries = useCallback(async () => {
    const response = await fetch('/api/employee/salaries', {
      credentials: 'include',
      headers: employeeAuthHeaders(),
    });
    if (!response.ok) throw new Error('تعذر تحميل الرواتب');
    const data = await response.json();
    setSalaries(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSalaries()
      .catch(() => { if (!cancelled) setSalaries([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const stream = typeof EventSource === 'undefined'
      ? null
      : new EventSource('/api/notifications/stream');
    if (stream) {
      stream.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data) as NotificationRecord;
          if (String(notification.type || '').startsWith('salary_')) {
            void loadSalaries().catch(() => undefined);
          }
        } catch {
          // Ignore a malformed event and keep the saved salary list visible.
        }
      };
    }
    const interval = window.setInterval(() => void loadSalaries().catch(() => undefined), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      stream?.close();
    };
  }, [loadSalaries]);

  const openPdf = async (salary: SalaryRecord) => {
    if (opening !== null) return;
    setOpening(salary.id);
    const previewWindow = window.open('', '_blank');
    try {
      const headers = employeeAuthHeaders();
      const resp = await fetch(`/api/employee/salaries/${salary.id}/pdf`, { credentials: 'include', headers });
      if (!resp.ok) throw new Error('تعذر تحميل الكشف');
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/pdf')) throw new Error('الاستجابة ليست ملف PDF');
      const blob = await resp.blob();
      if (!blob.size) throw new Error('ملف PDF فارغ');
      const url = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = url;
      } else {
        window.location.assign(url);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (previewWindow) previewWindow.close();
    } finally {
      setOpening(null);
    }
  };

  const confirmReceived = async (salaryId: number) => {
    if (receiving !== null) return;
    setReceiving(salaryId);
    try {
      const headers = { ...employeeAuthHeaders(), 'Content-Type': 'application/json' };
      const resp = await fetch(`/employee/salaries/${salaryId}/receive`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'تعذر تأكيد استلام الراتب');
      }
      const updated = await resp.json();
      setSalaries(prev => prev.map(s => s.id === salaryId ? { ...s, status: updated.status || 'received', receivedAt: updated.receivedAt || new Date().toISOString() } : s));
      alert('تم تأكيد استلام الراتب بنجاح وإشعار الإدارة');
    } catch (e: any) {
      alert(e.message || 'حدث خطأ أثناء تأكيد الاستلام');
    } finally {
      setReceiving(null);
    }
  };

  const monthLabel = (month?: string | null) => {
    const map: Record<string, string> = { '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل', '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس', '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر' };
    return map[String(month || '').padStart(2, '0')] || month || '—';
  };

  const statusBadge = (salary: SalaryRecord) => {
    if (salary.status === 'received' || salary.receivedAt) {
      return <span className="dhd-attendance-status is-complete">تم استلام الراتب</span>;
    }
    if (salary.status === 'paid' || salary.status === 'transferred') {
      return <span className="dhd-attendance-status" style={{ background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' }}>تم التحويل (بانتظار استلامك)</span>;
    }
    if (salary.status === 'postponed') {
      return <span className="dhd-attendance-status">مؤجل</span>;
    }
    return <span className="dhd-attendance-status is-open">معلق</span>;
  };

  return (
    <section className="dhd-section-card" aria-labelledby="salary-title">
      <div className="dhd-section-heading">
        <div><p className="dhd-eyebrow">الرواتب والكشوفات</p><h2 id="salary-title">كشوف راتبي</h2></div>
        <WalletCards size={25} />
      </div>
      {loading ? (
        <p className="dhd-empty-state">جارٍ تحميل الرواتب...</p>
      ) : salaries.length === 0 ? (
        <p className="dhd-empty-state">لا توجد سجلات راتب بعد.</p>
      ) : (
        <div className="dhd-record-list">
          {salaries.slice(0, 12).map((salary) => (
            <article className="dhd-record-row" key={salary.id}>
              <div>
                <strong>{monthLabel(salary.month)} {salary.year || ''}</strong>
                <span>{statusBadge(salary)}</span>
              </div>
              <div className="dhd-record-meta">
                <strong>{Number(salary.finalSalary || salary.baseSalary || 0).toLocaleString('ar-DZ')} دج</strong>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {(salary.status === 'paid' || salary.status === 'transferred') && !salary.receivedAt && (
                    <button
                      type="button"
                      className="dhd-action-button"
                      style={{ background: '#059669', color: '#fff', padding: '6px 10px', fontSize: '11px', fontWeight: 'bold' }}
                      disabled={receiving === salary.id}
                      onClick={() => void confirmReceived(salary.id)}
                    >
                      {receiving === salary.id ? 'جارٍ التسجيل...' : 'تم استلام المبلغ'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="dhd-action-button"
                    style={{ padding: '6px 14px', fontSize: '12px', gap: '5px' }}
                    disabled={opening === salary.id}
                    onClick={() => void openPdf(salary)}
                  >
                    {opening === salary.id ? <span className="dhd-spinner" /> : <FileText size={14} />}
                    كشف PDF
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function employeeAuthHeaders(): Record<string, string> {
  const token = window.localStorage.getItem(EMPLOYEE_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('المتصفح لا يدعم تحديد الموقع'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('يجب السماح بتحديد الموقع لتسجيل الحضور')), {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0,
    });
  });
}

function useEmployeePortalData(employee: Employee | null) {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!employee) {
      setAttendance([]);
      setViolations([]);
      setIsLoading(false);
      return;
    }

    setError('');
    try {
      const headers = employeeAuthHeaders();
      const [attendanceResponse, violationsResponse] = await Promise.all([
        fetch('/api/attendance', { credentials: 'include', headers }),
        fetch('/api/violations', { credentials: 'include', headers }),
      ]);
      if (!attendanceResponse.ok || !violationsResponse.ok) throw new Error('تعذر تحميل بيانات الموظف');
      const [attendanceData, violationsData] = await Promise.all([
        attendanceResponse.json() as Promise<AttendanceRecord[]>,
        violationsResponse.json() as Promise<ViolationRecord[]>,
      ]);
      setAttendance(Array.isArray(attendanceData) ? attendanceData : []);
      setViolations(Array.isArray(violationsData) ? violationsData : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تحميل البيانات');
    } finally {
      setIsLoading(false);
    }
  }, [employee?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { attendance, violations, isLoading, error, refresh };
}

function formatRecordDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed);
}

function AttendanceTable({ records, isLoading, error }: { records: AttendanceRecord[]; isLoading: boolean; error: string }) {
  if (isLoading) return <p className="dhd-empty-state">جارٍ تحميل سجل الحضور...</p>;
  if (error) return <p className="dhd-empty-state dhd-error-state">{error}</p>;
  if (records.length === 0) return <p className="dhd-empty-state">لا توجد سجلات حضور بعد.</p>;
  return (
    <div className="dhd-table-wrap">
      <table className="dhd-record-table">
        <thead><tr><th>التاريخ</th><th>الحضور</th><th>الخروج</th><th>الحالة</th></tr></thead>
        <tbody>{records.slice(0, 15).map((record) => (
          <tr key={record.id}>
            <td>{formatRecordDate(record.date)}</td>
            <td dir="ltr">{record.checkInTime || '—'}</td>
            <td dir="ltr">{record.checkOutTime || '—'}</td>
            <td><span className={`dhd-attendance-status ${record.checkOutTime ? 'is-complete' : record.checkInTime ? 'is-open' : ''}`}>{record.checkOutTime ? 'مكتمل' : record.checkInTime ? 'حضور مسجل' : 'غياب'}</span></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function LoadingScreen() {
  return <main className="dhd-loading"><span className="dhd-spinner dhd-spinner-dark" /> جارٍ تحميل الحساب...</main>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={() => <Redirect to="/portal/login" />} />
        <Route path="/portal/login" component={EmployeeLogin} />
        <Route path="/portal/account" component={() => <Redirect to="/portal" />} />
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

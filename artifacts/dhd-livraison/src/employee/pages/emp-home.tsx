import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useI18n } from '@/context/i18n';
import { useEmployeeAuth } from '../auth';
import { empFetch, EmpApiError } from '../api';
import { QrScanner } from '../components/QrScanner';
import { EmployeeAvatar } from '../components/EmployeeAvatar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, BarChart3, Bell, CalendarDays, CheckCircle2, ChevronLeft, Clock,
  FileText, History, LogIn, LogOut, MapPin, MoreHorizontal, ReceiptText,
  ShieldAlert, Sparkles, Wallet, XCircle,
} from 'lucide-react';

type Mode = 'checkin' | 'checkout';
type ScanResult =
  | { ok: true; mode: Mode; time: string; date: string; lateMinutes: number; lateDeduction: number }
  | { ok: false; errorKey: string };

function errKey(code: string): string {
  const known = ['gps_required', 'invalid_qr', 'wrong_office', 'already_checked_in', 'not_checked_in', 'already_checked_out', 'marked_absent'];
  if (code.startsWith('out_of_range')) return 'emp.err.out_of_range';
  if (known.includes(code)) return `emp.err.${code}`;
  return 'emp.err.invalid_qr';
}

function fmt(time: string) { return time ? time.slice(0, 5) : '--:--'; }
function fmtDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function money(value: number | null | undefined) {
  return `${Math.max(0, value ?? 0).toLocaleString('ar-DZ')} دج`;
}

function statusFor(record: any) {
  if (record?.isAbsent) return { label: 'غائب', tone: 'bg-rose-500/15 text-rose-600 dark:text-rose-300' };
  if (record?.checkOutTime) return { label: 'أنهى الدوام', tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' };
  if (record?.checkInTime && (record.lateMinutes ?? 0) > 0) return { label: 'متأخر', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' };
  if (record?.checkInTime) return { label: 'حاضر', tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' };
  return { label: 'لم يسجل بعد', tone: 'bg-muted text-muted-foreground' };
}

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/95 backdrop-blur-sm">
      <div className="h-14 w-14 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-base font-medium">جارٍ التحقق من الموقع…</p>
      <p className="text-sm text-muted-foreground">يرجى الانتظار</p>
    </div>
  );
}

const services = [
  { label: 'تسجيل الحضور', icon: LogIn, color: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300', action: 'checkin' as const },
  { label: 'تسجيل المغادرة', icon: LogOut, color: 'bg-sky-500/12 text-sky-600 dark:text-sky-300', action: 'checkout' as const },
  { label: 'كشف الراتب', icon: ReceiptText, color: 'bg-primary/12 text-primary', href: '/portal/account' },
  { label: 'الطلبات', icon: FileText, color: 'bg-violet-500/12 text-violet-600 dark:text-violet-300', href: '/portal/requests' },
  { label: 'مخالفاتي', icon: ShieldAlert, color: 'bg-rose-500/12 text-rose-600 dark:text-rose-300', href: '/portal/violations' },
  { label: 'الإحصائيات', icon: BarChart3, color: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-300', href: '/portal/stats' },
  { label: 'الإشعارات', icon: Bell, color: 'bg-amber-500/12 text-amber-700 dark:text-amber-300', href: '#notifications' },
  { label: 'المزيد', icon: MoreHorizontal, color: 'bg-slate-500/12 text-slate-600 dark:text-slate-300', href: '/portal/account' },
];

export default function EmpHome() {
  const { t } = useI18n();
  const { employee } = useEmployeeAuth();
  const queryClient = useQueryClient();
  const [scanMode, setScanMode] = useState<Mode | null>(null);
  const [locating, setLocating] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const cachedPos = useRef<GeolocationPosition | null>(null);

  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const { data: records = [] } = useQuery<any[]>({
    queryKey: ['employee', 'attendance', month],
    queryFn: () => empFetch<any[]>(`/employee/attendance?month=${month}`),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const { data: balance } = useQuery<any>({
    queryKey: ['employee', 'salary-balance'],
    queryFn: () => empFetch<any>('/employee/salary-balance'),
    staleTime: 30_000,
  });
  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ['employee', 'notifications'],
    queryFn: () => empFetch<any[]>('/employee/notifications'),
    staleTime: 30_000,
  });
  const { data: salaries = [] } = useQuery<any[]>({
    queryKey: ['employee', 'salaries'],
    queryFn: () => empFetch<any[]>('/employee/salaries'),
    staleTime: 30_000,
  });
  const { data: requests } = useQuery<any>({
    queryKey: ['employee', 'requests'],
    queryFn: () => empFetch<any>('/employee/requests'),
    staleTime: 30_000,
  });

  const todayRec = records.find((record) => record.date === today);
  const todayStatus = statusFor(todayRec);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => { cachedPos.current = position; }, () => {}, {
      enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000,
    });
  }, []);

  useEffect(() => {
    const openScanner = () => setScanMode('checkin');
    window.addEventListener('employee-open-scanner', openScanner);
    return () => window.removeEventListener('employee-open-scanner', openScanner);
  }, []);

  useEffect(() => {
    if (scanResult?.ok === true) {
      const timer = setTimeout(() => setScanResult(null), 5_000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [scanResult]);

  const handleScan = async (qrToken: string) => {
    const mode = scanMode!;
    setScanMode(null);
    setScanResult(null);
    setLocating(true);
    try {
      let pos = cachedPos.current && Date.now() - cachedPos.current.timestamp < 30_000 ? cachedPos.current : null;
      if (!pos) {
        pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) { reject(new EmpApiError(0, 'gps_required')); return; }
          navigator.geolocation.getCurrentPosition(resolve, () => reject(new EmpApiError(0, 'gps_required')), {
            enableHighAccuracy: true, timeout: 15_000, maximumAge: 0,
          });
        });
        cachedPos.current = pos;
      }
      const record = await empFetch<any>(`/employee/attendance/${mode}`, {
        method: 'POST',
        body: { qrToken, latitude: pos.coords.latitude, longitude: pos.coords.longitude },
      });
      setScanResult({
        ok: true, mode, time: fmt(mode === 'checkin' ? record.checkInTime : record.checkOutTime),
        date: fmtDate(today), lateMinutes: record.lateMinutes ?? 0, lateDeduction: record.lateDeduction ?? 0,
      });
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance'] });
    } catch (error) {
      setScanResult({ ok: false, errorKey: errKey(error instanceof EmpApiError ? error.code : 'gps_required') });
    } finally {
      setLocating(false);
    }
  };

  if (locating) return <LoadingOverlay />;
  if (scanResult) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-5 text-center">
          {scanResult.ok ? <CheckCircle2 className="mx-auto h-24 w-24 text-emerald-500" /> : <XCircle className="mx-auto h-24 w-24 text-destructive" />}
          <div>
            <p className={`text-lg font-semibold ${scanResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {scanResult.ok ? (scanResult.mode === 'checkin' ? t('emp.checkin.success') : t('emp.checkout.success')) : 'لم يتم التسجيل'}
            </p>
            {scanResult.ok ? <p className="mt-3 text-4xl font-bold tracking-widest" dir="ltr">{scanResult.time}</p> : <p className="mt-2 text-sm text-muted-foreground">{t(scanResult.errorKey as any)}</p>}
          </div>
          {scanResult.ok && scanResult.lateMinutes > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">تأخير {scanResult.lateMinutes} دقيقة{scanResult.lateDeduction > 0 && ` — خصم ${money(scanResult.lateDeduction)}`}</div>}
          <Button className="h-11 w-full" onClick={() => setScanResult(null)}>{scanResult.ok ? 'العودة للرئيسية' : 'حاول مجدداً'}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="employee-enter relative overflow-hidden rounded-[2rem] bg-primary px-5 py-6 text-primary-foreground shadow-xl shadow-primary/20">
        <div className="absolute -left-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-sm opacity-80">صباح الخير،</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{employee?.firstName} {employee?.lastName}</h1>
            <p className="mt-2 text-xs opacity-85">{employee?.position}</p>
            <p className="mt-2 flex items-center gap-1 text-xs opacity-85"><MapPin className="h-3.5 w-3.5" />{employee?.officeName}</p>
          </div>
          <EmployeeAvatar employee={employee} size="md" />
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
          <div><p className="text-[11px] opacity-75">الراتب الحالي</p><p className="mt-1 text-lg font-bold">{money(balance?.currentBalance ?? employee?.baseSalary)}</p></div>
          <div className="border-r border-white/20 pr-3"><p className="text-[11px] opacity-75">حالة اليوم</p><p className="mt-1 text-lg font-bold">{todayStatus.label}</p></div>
        </div>
      </section>

      <section className="employee-card rounded-[1.75rem] bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground">اليوم</p><h2 className="mt-1 text-lg font-bold">سجل حضورك</h2></div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${todayStatus.tone}`}>{todayStatus.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button className="h-12 rounded-2xl gap-2" disabled={!!todayRec?.checkInTime} onClick={() => setScanMode('checkin')}><LogIn className="h-5 w-5" />{t('emp.home.checkin')}</Button>
          <Button variant="outline" className="h-12 rounded-2xl gap-2" disabled={!todayRec?.checkInTime || !!todayRec?.checkOutTime} onClick={() => setScanMode('checkout')}><LogOut className="h-5 w-5" />{t('emp.home.checkout')}</Button>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">{t('emp.home.scan_hint')}</p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">الخدمات الرئيسية</h2><Sparkles className="h-5 w-5 text-primary" /></div>
        <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
          {services.map(({ label, icon: Icon, color, href, action }) => {
            const content = <><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${color}`}><Icon className="h-5 w-5" /></span><span className="text-center text-[10px] font-semibold leading-tight">{label}</span></>;
            return action ? <button key={label} type="button" onClick={() => setScanMode(action)} className="employee-card flex min-h-[7.5rem] flex-col items-center justify-center gap-3 rounded-2xl bg-card p-2 transition-transform hover:-translate-y-1">{content}</button>
              : href?.startsWith('#') ? <a key={label} href={href} className="employee-card flex min-h-[7.5rem] flex-col items-center justify-center gap-3 rounded-2xl bg-card p-2 transition-transform hover:-translate-y-1">{content}</a>
                : <Link key={label} href={href!} className="employee-card flex min-h-[7.5rem] flex-col items-center justify-center gap-3 rounded-2xl bg-card p-2 transition-transform hover:-translate-y-1">{content}</Link>;
          })}
        </div>
      </section>

      <section id="notifications" className="employee-card rounded-[1.75rem] bg-card p-4">
        <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-bold"><History className="h-5 w-5 text-primary" />آخر النشاطات</h2><Link href="/portal/stats" className="flex items-center gap-1 text-xs font-semibold text-primary">عرض الكل<ChevronLeft className="h-4 w-4" /></Link></div>
        <div className="space-y-1">
          {[
            todayRec?.checkInTime && { icon: LogIn, label: 'آخر حضور', value: fmt(todayRec.checkInTime), tone: 'text-emerald-600' },
            todayRec?.checkOutTime && { icon: LogOut, label: 'آخر مغادرة', value: fmt(todayRec.checkOutTime), tone: 'text-sky-600' },
            requests && (requests.advances?.[0] || requests.leaveRequests?.[0] || requests.vacationRequests?.[0]) && {
              icon: FileText,
              label: 'آخر طلب',
              value: 'تم إرسال طلب جديد',
              tone: 'text-violet-600',
            },
            notifications[0] && { icon: Bell, label: 'آخر إشعار', value: notifications[0].message, tone: 'text-amber-600' },
            salaries[0] && { icon: Wallet, label: 'آخر راتب', value: money(salaries[0].finalSalary), tone: 'text-primary' },
          ].filter(Boolean).map((item: any) => <div key={item.label} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-muted/60"><span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-muted ${item.tone}`}><item.icon className="h-4 w-4" /></span><span className="flex-1 text-sm">{item.label}</span><span className="max-w-[52%] truncate text-xs text-muted-foreground" dir={item.label === 'آخر إشعار' ? undefined : 'ltr'}>{item.value}</span><ArrowLeft className="h-3.5 w-3.5 text-muted-foreground/50" /></div>)}
          {!todayRec?.checkInTime && !todayRec?.checkOutTime && !notifications[0] && !salaries[0] && <p className="py-4 text-center text-sm text-muted-foreground">لا توجد نشاطات بعد</p>}
        </div>
      </section>

      {scanMode && <QrScanner onScan={handleScan} onCancel={() => setScanMode(null)} />}
    </div>
  );
}
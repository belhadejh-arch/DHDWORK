import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useLocation } from 'wouter';
import {
  Users, Building2, UserCheck, UserX, Clock, CalendarClock, CreditCard,
  Timer, Wallet, ShieldAlert, ClipboardList, BarChart3, Search, Settings,
  Bell, ArrowUpRight, Banknote, Palmtree,
} from 'lucide-react';
import {
  useGetDashboardStats, useListOffices, useGetAttendanceChart, useGetSalaryChart,
  useListAdvances, useListViolations, useListSalaries,
  useListNotifications,
  getGetDashboardStatsQueryKey, getListOfficesQueryKey, getListSalariesQueryKey,
  getListAdvancesQueryKey, getListViolationsQueryKey, getListNotificationsQueryKey,
  getGetAttendanceChartQueryKey, getGetSalaryChartQueryKey,
} from '@workspace/api-client-react';
import { useAuth } from '@/context/auth';
import { isValid } from 'date-fns';
import { adminFetch } from '@/lib/admin-api';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const colors = {
  blue: ['text-sky-700', 'bg-sky-100'],
  indigo: ['text-blue-700', 'bg-blue-100'],
  emerald: ['text-emerald-700', 'bg-emerald-100'],
  rose: ['text-rose-700', 'bg-rose-100'],
  amber: ['text-amber-700', 'bg-amber-100'],
  orange: ['text-primary', 'bg-primary/12'],
  green: ['text-teal-700', 'bg-teal-100'],
  purple: ['text-indigo-700', 'bg-indigo-100'],
  yellow: ['text-yellow-700', 'bg-yellow-100'],
  red: ['text-red-700', 'bg-red-100'],
  sky: ['text-cyan-700', 'bg-cyan-100'],
  teal: ['text-blue-700', 'bg-blue-100'],
} as const;

type IconType = typeof Users;

interface UpcomingEmployee {
  employeeId: number;
  salaryStatus: string | null;
}

function DashboardSkeleton() {
  return <div className="space-y-6 animate-pulse" dir="rtl">
    <div className="h-48 rounded-[24px] bg-muted" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 12 }, (_, i) => <div key={i} className="h-32 rounded-2xl bg-muted" />)}</div>
    <div className="h-80 rounded-2xl bg-muted" /><div className="grid gap-6 lg:grid-cols-2"><div className="h-72 rounded-2xl bg-muted" /><div className="h-72 rounded-2xl bg-muted" /></div>
  </div>;
}

function StatCard({ title, value, icon: Icon, palette, onClick, index, label }: {
  title: string; value: number | string; icon: IconType; palette: readonly [string, string]; onClick?: () => void; index: number; label?: string;
}) {
  return <button data-testid={`card-stat-${index}`} onClick={onClick} className="card-enter group w-full rounded-2xl border border-border/70 bg-card p-4 text-right shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" style={{ animationDelay: `${index * 50}ms` }}>
    <div className="flex items-start justify-between gap-3"><div className="text-left"><p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>{label && <span className="text-xs text-muted-foreground">{label}</span>}</div><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${palette[1]} ${palette[0]} transition-transform group-hover:scale-105`}><Icon className="h-5 w-5" /></span></div>
    <p className="mt-5 text-sm font-semibold text-muted-foreground">{title}</p>
  </button>;
}

function ChartShell({ title, children, action, eyebrow }: { title: string; children: ReactNode; action?: ReactNode; eyebrow?: string }) {
  return <section className="rounded-[22px] border border-border/70 bg-card p-5 shadow-[0_12px_32px_rgba(32,54,88,.05)] sm:p-6"><div className="mb-5 flex items-end justify-between gap-3"><div>{eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}<h2 className="text-lg font-bold text-foreground">{title}</h2></div>{action}</div>{children}</section>;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { admin } = useAuth();
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const currentYear = Number(format(new Date(), 'yyyy'));
  const currentMonth = format(new Date(), 'MM');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const { data: stats, isLoading } = useGetDashboardStats(
    { month: currentMonth, year: currentYear },
    { query: { queryKey: getGetDashboardStatsQueryKey({ month: currentMonth, year: currentYear }), refetchInterval: 30_000, refetchOnWindowFocus: true } }
  );
  const { data: offices = [] } = useListOffices({ query: { queryKey: getListOfficesQueryKey(), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const { data: salaries = [] } = useListSalaries(
    { month: currentMonth, year: currentYear },
    { query: { queryKey: getListSalariesQueryKey({ month: currentMonth, year: currentYear }), refetchInterval: 30_000, refetchOnWindowFocus: true } }
  );
  const { data: advances = [] } = useListAdvances({ status: 'pending' }, { query: { queryKey: getListAdvancesQueryKey({ status: 'pending' }), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const { data: violations = [] } = useListViolations({}, { query: { queryKey: getListViolationsQueryKey({}), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const { data: notifications = [] } = useListNotifications({ unreadOnly: false }, { query: { queryKey: getListNotificationsQueryKey({ unreadOnly: false }), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const { data: attendance = [] } = useGetAttendanceChart({ period }, { query: { queryKey: getGetAttendanceChartQueryKey({ period }), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const { data: salaryChart = [] } = useGetSalaryChart({ year: selectedYear }, { query: { queryKey: getGetSalaryChartQueryKey({ year: selectedYear }), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const officeStats = stats?.officeBreakdown ?? [];
  const { data: upcoming = [], isError: upcomingError } = useQuery<UpcomingEmployee[]>({
    queryKey: ['salaries', 'upcoming'],
    queryFn: async () => {
      return adminFetch('/salaries/upcoming');
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const adminName = [admin?.firstName, admin?.lastName].filter(Boolean).join(' ') || admin?.username || 'المدير';
  const initials = adminName.split(' ').map((part: string) => part[0]).slice(0, 2).join('').toUpperCase();
  const paid = salaries.filter((s: any) => s.status === 'paid').length;
  const postponed = salaries.filter((s: any) => s.status === 'postponed').length;
  const upcomingUnpaid = upcoming.filter((employee: any) => employee.salaryStatus !== 'paid').length;
  const tooltipStyle = useMemo(() => ({ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,.1)' }), []);

  if (isLoading || !stats) return <DashboardSkeleton />;

  const statCards = [
    ['إجمالي الموظفين', stats.totalEmployees, Users, colors.blue, '/employees'],
    ['إجمالي المكاتب', offices.length, Building2, colors.indigo, '/offices'],
    ['الحاضرون اليوم', stats.presentToday, UserCheck, colors.emerald, '/attendance'],
    ['الغائبون اليوم', stats.absentToday, UserX, colors.rose, '/attendance'],
    ['المتأخرون', stats.lateToday, Clock, colors.amber, '/attendance'],
    ['الرواتب القادمة', upcomingError ? '—' : upcomingUnpaid, CalendarClock, colors.orange, '/salaries'],
    ['الرواتب المدفوعة', paid, CreditCard, colors.green, '/salaries'],
    ['الرواتب المؤجلة', postponed, Timer, colors.purple, '/salaries'],
    ['طلبات السلف المعلقة', advances.length, Wallet, colors.yellow, '/requests'],
    ['المخالفات المسجلة', violations.length, ShieldAlert, colors.red, '/violations'],
    ['الطلبات الجديدة', stats.pendingRequests ?? 0, ClipboardList, colors.sky, '/requests'],
    ['التقارير', 'عرض', BarChart3, colors.teal, '/statistics'],
  ] as const;

  const notificationIcon = (type: string) => type === 'attendance_alert' || type === 'late_alert' ? [Clock, 'text-orange-600', 'bg-orange-50'] : type === 'advance_request' ? [Wallet, 'text-amber-600', 'bg-amber-50'] : type === 'leave_request' ? [CalendarClock, 'text-sky-600', 'bg-sky-50'] : type === 'vacation_request' ? [Palmtree, 'text-teal-600', 'bg-teal-50'] : type === 'salary_due' ? [Banknote, 'text-green-600', 'bg-green-50'] : [Bell, 'text-slate-500', 'bg-slate-100'];

  return <div dir="rtl" className="min-h-[100dvh] space-y-7 pb-8">
    <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}.card-enter{animation:fadeInUp .4s ease both}`}</style>
    <header className="relative overflow-hidden rounded-[26px] bg-primary p-6 text-primary-foreground shadow-[0_18px_38px_rgba(249,115,0,.22)] sm:p-8">
       <div className="absolute -left-10 -top-20 h-64 w-64 rounded-full border-[30px] border-white/10" /><div className="absolute -bottom-32 right-20 h-72 w-72 rounded-full border-[26px] border-white/5" /><div className="relative flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
         <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold ring-1 ring-white/20">{initials}</div><div><p className="text-sm text-primary-foreground/75">مرحباً، {adminName}</p><h1 className="mt-1 text-xl font-bold sm:text-2xl">نظرة شاملة على أداء الفريق اليوم</h1><p className="mt-2 text-xs text-primary-foreground/65">قرارات أسرع، وفريق أكثر انتظاماً.</p></div></div>
        <div className="flex flex-wrap items-center gap-3"><p className="text-sm font-medium text-primary-foreground/75">{new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p><div className="flex gap-2 border-r border-white/20 pr-3"><button aria-label="البحث" data-testid="button-search" onClick={() => navigate('/search')} className="rounded-xl bg-white/15 p-3 transition hover:bg-white/25"><Search className="h-4 w-4" /></button><button aria-label="الإعدادات" data-testid="button-settings" onClick={() => navigate('/settings')} className="rounded-xl bg-white/15 p-3 transition hover:bg-white/25"><Settings className="h-4 w-4" /></button><button aria-label="الإشعارات" data-testid="button-notifications" onClick={() => navigate('/notifications')} className="relative rounded-xl bg-white/15 p-3 transition hover:bg-white/25"><Bell className="h-4 w-4" /></button></div></div>
      </div>
    </header>
     <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{statCards.map(([title, value, icon, palette, href], i) => <StatCard key={title} index={i} title={title} value={value} icon={icon} palette={palette} onClick={() => navigate(href)} />)}</div>
     <ChartShell eyebrow="الآن" title="نظرة عامة على الحضور" action={<div className="flex rounded-xl bg-muted p-1">{(['7d', '30d'] as const).map(p => <button data-testid={`button-period-${p}`} key={p} onClick={() => setPeriod(p)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${period === p ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>{p === '7d' ? '٧ أيام' : '٣٠ يوم'}</button>)}</div>}>
      <div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={attendance as any} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="#f1f5f9" vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="present" name="الحاضرون" stroke="#16a34a" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="absent" name="الغائبون" stroke="#ef4444" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="late" name="المتأخرون" stroke="#f59e0b" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>
      <div className="mt-3 flex justify-center gap-5 text-xs text-slate-500">{[['#16a34a', 'الحاضرون'], ['#ef4444', 'الغائبون'], ['#f59e0b', 'المتأخرون']].map(([c, l]) => <span key={l} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>)}</div>
    </ChartShell>
    <div className="grid gap-6 lg:grid-cols-2">
       <ChartShell eyebrow="المدفوعات" title="الرواتب الشهرية" action={<div className="flex gap-1">{[currentYear - 1, currentYear].map(y => <button data-testid={`button-year-${y}`} key={y} onClick={() => setSelectedYear(y)} className={`rounded-lg px-3 py-1 text-xs font-semibold ${selectedYear === y ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>{y}</button>)}</div>}><div className="h-[220px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={salaryChart as any} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="totalSalaries" name="إجمالي الرواتب" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></ChartShell>
       <ChartShell eyebrow="الفروع" title="توزيع الموظفين حسب المكتب"><div className="h-[220px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={officeStats as any} layout="vertical" margin={{ top: 0, right: 10, left: 5, bottom: 0 }}><CartesianGrid stroke="hsl(var(--border))" horizontal={false} /><XAxis type="number" hide /><YAxis type="category" dataKey="officeName" width={80} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="presentToday" name="حاضر" fill="#0ea5e9" radius={[0, 6, 6, 0]} /><Bar dataKey="absentToday" name="غائب" fill="#fb7185" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div></ChartShell>
    </div>
    <section><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-foreground">آخر النشاطات</h2><button data-testid="link-all-notifications" onClick={() => navigate('/notifications')} className="flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80">مشاهدة الكل <ArrowUpRight className="h-4 w-4" /></button></div><div className="grid gap-3 md:grid-cols-2">{notifications.slice(0, 8).map((n: any, i: number) => { const [Icon, color, bg] = notificationIcon(n.type); const date = new Date(n.createdAt); const relativeTime = isValid(date) ? formatDistanceToNow(date, { addSuffix: true, locale: ar }) : 'الآن'; return <div data-testid={`row-notification-${n.id ?? i}`} key={n.id ?? i} className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg} ${color}`}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-sm font-bold text-foreground">{n.title || n.message || 'نشاط جديد'}</p>{!n.isRead && <i className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}</div><p className="mt-0.5 truncate text-xs text-muted-foreground">{n.body || n.message || 'تم تسجيل نشاط جديد في النظام'}</p><p className="mt-1 text-[11px] text-muted-foreground">{relativeTime}</p></div></div>; })}</div></section>
  </div>;
}
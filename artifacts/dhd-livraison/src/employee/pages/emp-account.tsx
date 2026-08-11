import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/components/theme-provider';
import { useEmployeeAuth } from '../auth';
import { empFetch } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogOut, Moon, Sun, Bell, Wallet, Download, CheckCircle2, Clock, CalendarDays } from 'lucide-react';
import { generatePayslipPDF } from '@/lib/payslip-pdf';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { EmployeeAvatar } from '../components/EmployeeAvatar';

export default function EmpAccount() {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const { employee, logout } = useEmployeeAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loadingPdf, setLoadingPdf] = useState<number | null>(null);

  const handleDownloadPayslip = async (salaryId: number) => {
    setLoadingPdf(salaryId);
    try {
      const data = await empFetch<any>(`/employee/salaries/${salaryId}/payslip`);
      generatePayslipPDF({
        salary: data.salary,
        employee: data.employee,
        companyName: data.companyName || 'DHD Livraison',
        attendanceRecords: data.attendanceRecords || [],
        advances: data.advances || [],
        violations: data.violations || [],
        leaveRequests: data.leaveRequests || [],
        vacationRequests: data.vacationRequests || [],
        bonuses: data.bonuses || [],
      });
    } catch {
      toast({ variant: 'destructive', title: 'خطأ في تحميل كشف الراتب' });
    } finally {
      setLoadingPdf(null);
    }
  };

  const { data: salaries = [] } = useQuery({
    queryKey: ['employee', 'salaries'],
    queryFn: () => empFetch<any[]>('/employee/salaries'),
    refetchInterval: 30_000,
  });

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['employee', 'salary-balance'],
    queryFn: () => empFetch<any>('/employee/salary-balance'),
    refetchInterval: 15_000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['employee', 'notifications'],
    queryFn: () => empFetch<any[]>('/employee/notifications'),
    refetchInterval: 10_000,
  });

  const markAllRead = async () => {
    await empFetch('/employee/notifications/read-all', { method: 'PATCH' });
    queryClient.invalidateQueries({ queryKey: ['employee', 'notifications'] });
  };

  const unread = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-primary">مساحتك الشخصية</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{t('emp.acc.title')}</h1>
      </div>

      <Card className="employee-card rounded-[1.75rem]">
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="flex items-center gap-3 mb-3">
            <EmployeeAvatar employee={employee} editable size="lg" />
            <div>
              <p className="font-semibold">{employee?.firstName} {employee?.lastName}</p>
              <p className="text-muted-foreground text-xs" dir="ltr">{employee?.email}</p>
              <p className="mt-1 text-xs text-primary">اضغط على الكاميرا لتغيير الصورة</p>
            </div>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t('emp.acc.office')}</span><span>{employee?.officeName}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t('emp.acc.position')}</span><span>{employee?.position}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">رقم الهاتف</span><span dir="ltr">{employee?.phone || '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">أيام العمل</span><span className="font-medium text-primary">{Array.isArray((employee as any)?.workDays) && (employee as any).workDays.length > 0 ? (employee as any).workDays.join('، ') : 'الأحد، الإثنين، الثلاثاء، الأربعاء، الخميس'}</span></div>
          {employee?.hireDate && <div className="flex justify-between"><span className="text-muted-foreground">{t('emp.acc.hire_date')}</span><span dir="ltr">{employee.hireDate}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">{t('emp.acc.base_salary')}</span><span dir="ltr">{employee?.baseSalary?.toLocaleString()} DZD</span></div>
          {employee?.paymentDay && <div className="flex justify-between"><span className="text-muted-foreground">{t('emp.acc.payment_day')}</span><span dir="ltr">{employee.paymentDay}</span></div>}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" /> {t('emp.acc.notifications')}
            {unread > 0 && <span className="text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">{unread}</span>}
          </CardTitle>
          {unread > 0 && <Button variant="ghost" size="sm" onClick={markAllRead}>{t('notifications.mark_all')}</Button>}
        </CardHeader>
        <CardContent className="space-y-2 max-h-64 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
          ) : notifications.slice(0, 20).map(n => (
            <div key={n.id} className={`text-sm p-2 rounded-md ${n.isRead ? 'text-muted-foreground' : 'bg-primary/5 font-medium'}`}>
              {n.message}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── رصيد الراتب الحالي ─────────────────────────────────────────── */}
      <Card className="employee-card rounded-[1.5rem] border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            {t('emp.acc.salary_balance')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {balanceLoading ? (
            <p className="text-muted-foreground">{t('action.loading')}</p>
          ) : balance ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('emp.acc.base_salary')}</span>
                <span dir="ltr" className="font-medium">{balance.baseSalary?.toLocaleString()} DZD</span>
              </div>
              {balance.lateDeductions > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">خصم التأخر</span>
                  <span dir="ltr" className="text-rose-600 font-medium">-{balance.lateDeductions?.toLocaleString()} DZD</span>
                </div>
              )}
              {balance.advanceDeductions > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">استرداد السلف</span>
                  <span dir="ltr" className="text-rose-600 font-medium">-{balance.advanceDeductions?.toLocaleString()} DZD</span>
                </div>
              )}
              {balance.violationDeductions > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">خصم المخالفات</span>
                  <span dir="ltr" className="text-rose-600 font-medium">-{balance.violationDeductions?.toLocaleString()} DZD</span>
                </div>
              )}
              {balance.totalDeductions > 0 && (
                <div className="h-px bg-border my-1" />
              )}
              <div className="flex justify-between items-center pt-0.5">
                <span className="font-semibold">{t('emp.acc.current_balance')}</span>
                <span dir="ltr" className="font-bold text-primary text-base">{balance.currentBalance?.toLocaleString()} DZD</span>
              </div>
              <p className="text-xs text-muted-foreground">{balance.month}/{balance.year}</p>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="employee-card rounded-[1.5rem]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('emp.acc.salary_history')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {salaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('emp.stats.no_records')}</p>
          ) : salaries.map(s => {
            const totalDed = (s.lateDeductions ?? 0) + (s.advanceDeductions ?? 0) + (s.violationDeductions ?? 0) + (s.otherDeductions ?? 0);
            return (
                <div key={s.id} className="space-y-2 rounded-2xl border border-border/70 p-3 text-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold" dir="ltr">{s.month}/{s.year}</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {s.status === 'paid'
                        ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        : s.status === 'postponed'
                          ? <Clock className="h-3 w-3 text-amber-500" />
                          : <CalendarDays className="h-3 w-3 text-slate-400" />
                      }
                      <span className={`text-xs ${s.status === 'paid' ? 'text-emerald-600' : s.status === 'postponed' ? 'text-amber-600' : 'text-slate-500'}`}>
                        {s.status === 'paid' ? 'مدفوع' : s.status === 'postponed' ? 'مؤجل' : 'بانتظار الدفع'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-primary" dir="ltr">{(s.finalSalary ?? 0).toLocaleString()} دج</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary mt-0.5 px-1"
                      onClick={() => handleDownloadPayslip(s.id)}
                      disabled={loadingPdf === s.id}
                    >
                      {loadingPdf === s.id
                        ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        : <Download className="h-3 w-3" />
                      }
                      كشف PDF
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground bg-muted/30 rounded p-2">
                  <div>أساسي: <span className="font-medium text-foreground" dir="ltr">{(s.baseSalary ?? 0).toLocaleString()}</span></div>
                  {(s.bonuses ?? 0) > 0 && <div className="text-amber-600">+ مكافآت: {(s.bonuses ?? 0).toLocaleString()}</div>}
                  {totalDed > 0 && <div className="text-rose-600">- خصومات: {totalDed.toLocaleString()}</div>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="employee-card rounded-[1.5rem]">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('settings.language.title')}</span>
            <div className="flex gap-1">
              {(['ar', 'fr', 'en'] as const).map(l => (
                <Button key={l} size="sm" variant={language === l ? 'default' : 'outline'} onClick={() => setLanguage(l)}>
                  {l === 'ar' ? 'ع' : l.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('theme.toggle')}</span>
            <Button size="sm" variant="outline" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button variant="destructive" className="w-full" onClick={logout}>
        <LogOut className="h-4 w-4 mr-2" /> {t('emp.acc.logout')}
      </Button>
    </div>
  );
}

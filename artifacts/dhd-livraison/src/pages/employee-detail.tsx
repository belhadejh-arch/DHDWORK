import React, { useState } from 'react';
import { useGetEmployee, useGetEmployeeAttendanceSummary, useGetEmployeeSalaryHistory, getGetEmployeeQueryKey, getGetEmployeeAttendanceSummaryQueryKey, getGetEmployeeSalaryHistoryQueryKey } from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  ArrowLeft, User, Phone, Mail, MapPin, Briefcase, Calendar, Clock, Banknote,
  FileText, Calculator, CheckCircle2, AlertCircle, TrendingUp, Download, Gift,
  TrendingDown, CreditCard, ShieldAlert, ChevronDown, Plus, Trash2
} from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { useI18n } from '@/context/i18n';
import { useToast } from '@/hooks/use-toast';
import { generatePayslipPDF } from '@/lib/payslip-pdf';
import { adminFetch } from '@/lib/admin-api';

interface SalaryPreview {
  baseSalary: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  workedHours: number;
  overtimeHours: number;
  overtimeBonus: number;
  lateDeductions: number;
  advanceDeductions: number;
  violationDeductions: number;
  otherDeductions: number;
  bonuses: number;
  totalDeductions: number;
  finalSalary: number;
  pendingBonuses?: Array<{ id: number; reason: string; amount: number; date: string }>;
}

interface BonusRecord {
  id: number;
  employeeId: number;
  amount: number;
  reason: string;
  notes?: string | null;
  date: string;
  status: string;
  salaryId?: number | null;
  createdAt: string;
}

interface AdvanceRecord {
  id: number;
  employeeId: number;
  amount: number;
  reason?: string | null;
  status: string;
  requestedAt: string;
  resolvedAt?: string | null;
}

interface ViolationRecord {
  id: number;
  employeeId: number;
  reason: string;
  amount?: number | null;
  status: string;
  violationType?: string;
  violationDate?: string | null;
  createdAt: string;
}

type ReportTab = 'salaries' | 'advances' | 'bonuses' | 'violations' | 'transactions';

export default function EmployeeDetail() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, params] = useRoute('/employees/:id');
  const id = params?.id ? parseInt(params.id) : 0;

  const [summaryMonth, setSummaryMonth] = useState(format(new Date(), 'MM'));
  const [summaryYear, setSummaryYear] = useState(format(new Date(), 'yyyy'));

  // Salary management state
  const currentMonth = format(new Date(), 'MM');
  const currentYear = format(new Date(), 'yyyy');
  const [salaryMonth, setSalaryMonth] = useState(currentMonth);
  const [salaryYear, setSalaryYear] = useState(currentYear);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<SalaryPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState<number | null>(null);

  // Report tabs
  const [activeTab, setActiveTab] = useState<ReportTab>('salaries');

  // Bonus dialog state
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [bonusNotes, setBonusNotes] = useState('');
  const [bonusDate, setBonusDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bonusSaving, setBonusSaving] = useState(false);

  const { data: employee, isLoading } = useGetEmployee(id, { query: { queryKey: getGetEmployeeQueryKey(id), enabled: !!id } });
  const { data: summary } = useGetEmployeeAttendanceSummary(
    { employeeId: id, month: summaryMonth, year: parseInt(summaryYear) },
    { query: { queryKey: getGetEmployeeAttendanceSummaryQueryKey({ employeeId: id, month: summaryMonth, year: parseInt(summaryYear) }), enabled: !!id } }
  );
  const { data: salaries, refetch: refetchSalaries } = useGetEmployeeSalaryHistory(
    id,
    { query: { queryKey: getGetEmployeeSalaryHistoryQueryKey(id), enabled: !!id } }
  );

  // Fetch advances for this employee
  const { data: advances, refetch: refetchAdvances } = useQuery<AdvanceRecord[]>({
    queryKey: ['advances', id],
    queryFn: async () => {
      return adminFetch<AdvanceRecord[]>(`/advances?employeeId=${id}`);
    },
    enabled: !!id,
  });

  // Fetch bonuses for this employee
  const { data: bonuses, refetch: refetchBonuses } = useQuery<BonusRecord[]>({
    queryKey: ['bonuses', id],
    queryFn: async () => {
      return adminFetch<BonusRecord[]>(`/bonuses?employeeId=${id}`);
    },
    enabled: !!id,
  });

  // Fetch violations for this employee
  const { data: violations, refetch: refetchViolations } = useQuery<ViolationRecord[]>({
    queryKey: ['violations', id],
    queryFn: async () => {
      return adminFetch<ViolationRecord[]>(`/violations?employeeId=${id}`);
    },
    enabled: !!id,
  });

  // Fetch transactions for this employee
  const { data: transactions = [] } = useQuery<Array<{
    id: number;
    amount: number;
    type: string;
    reason: string;
    performedBy?: string | null;
    balanceBefore?: number | null;
    balanceAfter?: number | null;
    createdAt: string;
  }>>({
    queryKey: ['transactions', id],
    queryFn: async () => {
      return adminFetch(`/employees/${id}/transactions`);
    },
    enabled: !!id,
    refetchInterval: 10_000,
  });

  // Live salary balance for current month
  const { data: salaryBalance, refetch: refetchBalance } = useQuery<{
    baseSalary: number; month: string; year: number;
    lateDeductions: number; advanceDeductions: number; violationDeductions: number;
    totalDeductions: number; currentBalance: number;
    advances: Array<{ id: number; amount: number; reason?: string | null; requestedAt: string }>;
    violations: Array<{ id: number; reason: string; amount?: number | null }>;
  }>({
    queryKey: ['salary-balance', id],
    queryFn: async () => {
      return adminFetch(`/employees/${id}/salary-balance`);
    },
    enabled: !!id,
    refetchInterval: 15_000,
  });

  // Check if salary exists for selected month/year
  const existingSalary = salaries?.find(s => s.month === salaryMonth && s.year === parseInt(salaryYear));

  const handleFetchPreview = async () => {
    setPreviewLoading(true);
    try {
      const data = await adminFetch<SalaryPreview>(
        `/salaries/preview?employeeId=${id}&month=${salaryMonth}&year=${salaryYear}`,
      );
      setPreview(data);
      setPreviewOpen(true);
    } catch (e) {
      toast({ title: 'خطأ في تحميل معاينة الراتب', variant: 'destructive' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerateSalary = async () => {
    setGenerating(true);
    try {
      await adminFetch('/salaries/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: id, month: salaryMonth, year: parseInt(salaryYear) }),
      }, 15_000, [409]);
      await refetchSalaries();
      await refetchBonuses();
      queryClient.invalidateQueries({ queryKey: ['salaries', 'upcoming'] });
      toast({ title: 'تم توليد الراتب بنجاح' });
      setPreviewOpen(false);
    } catch (e: any) {
      toast({ title: 'خطأ في توليد الراتب', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handlePaySalary = async (salaryId: number) => {
    setPaying(true);
    try {
      await adminFetch(`/salaries/${salaryId}/pay`, {
        method: 'PATCH',
      });
      await refetchSalaries();
      queryClient.invalidateQueries({ queryKey: ['salaries', 'upcoming'] });
      toast({ title: t('salaries.toast.paid') });
      setPreviewOpen(false);
    } catch (e) {
      toast({ title: 'خطأ في صرف الراتب', variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  };

  const handlePrintPayslip = async (salaryId: number) => {
    setLoadingPdf(salaryId);
    try {
      const data = await adminFetch<any>(`/salaries/${salaryId}/payslip`);
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
    } catch (e) {
      toast({ title: 'خطأ في تحميل كشف الراتب', variant: 'destructive' });
    } finally {
      setLoadingPdf(null);
    }
  };

  const handleAddBonus = async () => {
    if (!bonusAmount || !bonusReason) {
      toast({ title: 'يرجى تعبئة المبلغ والسبب', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(bonusAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'المبلغ غير صحيح', variant: 'destructive' });
      return;
    }
    setBonusSaving(true);
    try {
      await adminFetch('/bonuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: id, amount, reason: bonusReason, notes: bonusNotes || undefined, date: bonusDate }),
      });
      await refetchBonuses();
      toast({ title: 'تمت إضافة المكافأة بنجاح وأُرسل إشعار للموظف' });
      setBonusOpen(false);
      setBonusAmount('');
      setBonusReason('');
      setBonusNotes('');
      setBonusDate(format(new Date(), 'yyyy-MM-dd'));
      setActiveTab('bonuses');
    } catch (e: any) {
      toast({ title: 'خطأ في إضافة المكافأة', description: e.message, variant: 'destructive' });
    } finally {
      setBonusSaving(false);
    }
  };

  const handleDeleteBonus = async (bonusId: number) => {
    try {
      await adminFetch(`/bonuses/${bonusId}`, {
        method: 'DELETE',
      });
      await refetchBonuses();
      toast({ title: 'تم حذف المكافأة' });
    } catch (e: any) {
      toast({ title: 'خطأ في حذف المكافأة', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <div>{t('action.loading')}</div>;
  if (!employee) return <div>{t('employee_detail.not_found')}</div>;

  const totalBonuses = bonuses?.reduce((s, b) => s + b.amount, 0) ?? 0;
  const pendingBonuses = bonuses?.filter(b => b.status === 'pending') ?? [];
  const totalDeductions = (salaries ?? []).reduce((s, sal) => s + ((sal as any).lateDeductions ?? 0) + ((sal as any).advanceDeductions ?? 0) + ((sal as any).violationDeductions ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/employees">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> {t('employee_detail.back')}
          </Button>
        </Link>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shadow-sm">
              {employee.firstName[0]}{employee.lastName[0]}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{employee.firstName} {employee.lastName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={employee.isActive !== false ? "outline" : "secondary"} className={employee.isActive !== false ? "bg-emerald-500/10 text-emerald-600 border-0" : ""}>
                  {employee.isActive !== false ? t('employee_detail.status.active') : t('employee_detail.status.inactive')}
                </Badge>
                <span className="text-muted-foreground text-sm flex items-center"><Briefcase className="h-3 w-3 mr-1" /> {employee.position}</span>
              </div>
            </div>
          </div>
          {/* Add Bonus button */}
          <Button
            onClick={() => setBonusOpen(true)}
            className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
            size="sm"
          >
            <Gift className="h-4 w-4" />
            إضافة مكافأة
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1 shadow-sm">
          <CardHeader>
            <CardTitle>{t('employee_detail.profile')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DetailItem icon={<Phone className="h-4 w-4" />} label={t('employee_detail.phone')} value={employee.phone} />
            <DetailItem icon={<Mail className="h-4 w-4" />} label={t('employee_detail.email')} value={employee.email || '-'} />
            <DetailItem icon={<MapPin className="h-4 w-4" />} label={t('employee_detail.office')} value={employee.officeName || '-'} />
            <DetailItem icon={<Banknote className="h-4 w-4" />} label={t('employee_detail.salary')} value={`${employee.baseSalary.toLocaleString()} دج`} />
            <DetailItem icon={<Clock className="h-4 w-4" />} label={t('employee_detail.hours')} value={`${employee.workStartTime} - ${employee.workEndTime}`} />
            <DetailItem icon={<Calendar className="h-4 w-4" />} label="أيام العمل" value={Array.isArray((employee as any).workDays) && (employee as any).workDays.length > 0 ? (employee as any).workDays.join('، ') : 'الأحد، الإثنين، الثلاثاء، الأربعاء، الخميس'} />
            <DetailItem icon={<Calendar className="h-4 w-4" />} label={t('employee_detail.joined')} value={format(new Date(employee.createdAt), 'dd MMM yyyy')} />
          </CardContent>
        </Card>

        <Card className="col-span-1 md:col-span-2 shadow-sm flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle>{t('employee_detail.attendance_summary')}</CardTitle>
              <div className="flex gap-2">
                <select value={summaryMonth} onChange={(e) => setSummaryMonth(e.target.value)} className="bg-muted border-0 rounded text-sm p-1">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i} value={(i + 1).toString().padStart(2, '0')}>{format(new Date(2000, i, 1), 'MMM')}</option>
                  ))}
                </select>
                <select value={summaryYear} onChange={(e) => setSummaryYear(e.target.value)} className="bg-muted border-0 rounded text-sm p-1">
                  {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex items-center">
            {summary ? (
              <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-emerald-500/10 p-4 rounded-xl text-center">
                  <p className="text-3xl font-bold text-emerald-600">{summary.presentDays}</p>
                  <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{t('employee_detail.present')}</p>
                </div>
                <div className="bg-rose-500/10 p-4 rounded-xl text-center">
                  <p className="text-3xl font-bold text-rose-600">{summary.absentDays}</p>
                  <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{t('employee_detail.absent')}</p>
                </div>
                <div className="bg-amber-500/10 p-4 rounded-xl text-center">
                  <p className="text-3xl font-bold text-amber-600">{summary.lateDays}</p>
                  <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{t('employee_detail.late')}</p>
                </div>
                <div className="bg-primary/10 p-4 rounded-xl text-center">
                  <p className="text-3xl font-bold text-primary">{Math.floor(summary.totalHours)}<span className="text-base font-normal opacity-70">h</span></p>
                  <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{t('employee_detail.worked')}</p>
                </div>
              </div>
            ) : (
              <div className="text-center w-full text-muted-foreground">{t('employee_detail.no_data')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── رصيد الراتب الحالي ─────────────────────────────────────────── */}
      {salaryBalance && (
        <Card className="shadow-sm border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Banknote className="h-5 w-5 text-primary" />
                رصيد الراتب الحالي — {salaryBalance.month}/{salaryBalance.year}
              </CardTitle>
              <span className="text-2xl font-bold text-primary" dir="ltr">
                {salaryBalance.currentBalance.toLocaleString()} DZD
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-background rounded-lg p-3 text-center border">
                <p className="text-muted-foreground text-xs mb-1">الراتب الأصلي</p>
                <p className="font-bold" dir="ltr">{salaryBalance.baseSalary.toLocaleString()}</p>
              </div>
              <div className="bg-background rounded-lg p-3 text-center border">
                <p className="text-muted-foreground text-xs mb-1">خصم التأخر</p>
                <p className="font-bold text-rose-600" dir="ltr">
                  {salaryBalance.lateDeductions > 0 ? `-${salaryBalance.lateDeductions.toLocaleString()}` : '—'}
                </p>
              </div>
              <div className="bg-background rounded-lg p-3 text-center border">
                <p className="text-muted-foreground text-xs mb-1">استرداد السلف</p>
                <p className="font-bold text-rose-600" dir="ltr">
                  {salaryBalance.advanceDeductions > 0 ? `-${salaryBalance.advanceDeductions.toLocaleString()}` : '—'}
                </p>
              </div>
              <div className="bg-background rounded-lg p-3 text-center border">
                <p className="text-muted-foreground text-xs mb-1">خصم المخالفات</p>
                <p className="font-bold text-rose-600" dir="ltr">
                  {salaryBalance.violationDeductions > 0 ? `-${salaryBalance.violationDeductions.toLocaleString()}` : '—'}
                </p>
              </div>
            </div>
            {salaryBalance.advances.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">سلف معتمدة في انتظار الخصم:</p>
                {salaryBalance.advances.map(a => (
                  <div key={a.id} className="flex justify-between text-xs bg-background rounded px-2 py-1 border">
                    <span className="text-muted-foreground">{a.reason || 'سلفة'}</span>
                    <span className="font-medium text-rose-600" dir="ltr">{a.amount.toLocaleString()} DZD</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Salary Management ─────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-primary" />
                إدارة الراتب
              </CardTitle>
              <CardDescription>توليد ودفع راتب الموظف وتنزيل كشف الراتب</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {/* Month/Year selector */}
              <div className="flex items-center gap-2 bg-muted/40 rounded-lg border p-1.5 text-sm">
                <select value={salaryMonth} onChange={e => setSalaryMonth(e.target.value)} className="bg-transparent border-0 text-sm focus:outline-none">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const m = (i + 1).toString().padStart(2, '0');
                    return <option key={m} value={m}>{format(new Date(2000, i, 1), 'MMMM')}</option>;
                  })}
                </select>
                <span className="text-muted-foreground">/</span>
                <select value={salaryYear} onChange={e => setSalaryYear(e.target.value)} className="bg-transparent border-0 text-sm focus:outline-none">
                  {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {!existingSalary ? (
                <Button onClick={handleFetchPreview} disabled={previewLoading} className="gap-1.5">
                  <Calculator className="h-4 w-4" />
                  {previewLoading ? 'جارٍ الحساب...' : 'احتساب الراتب'}
                </Button>
              ) : existingSalary.status !== 'paid' ? (
                <Button onClick={handleFetchPreview} disabled={previewLoading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                  <Banknote className="h-4 w-4" />
                  {previewLoading ? 'جارٍ التحميل...' : 'مراجعة ودفع الراتب'}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => handlePrintPayslip(existingSalary.id)} disabled={loadingPdf === existingSalary.id} className="gap-1.5">
                  <Download className="h-4 w-4" />
                  {loadingPdf === existingSalary.id ? 'جارٍ التحميل...' : 'تحميل كشف الراتب'}
                </Button>
              )}
            </div>
          </div>

          {existingSalary && (
            <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
              {existingSalary.status === 'paid' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              )}
              <div className="text-sm">
                <span className="font-medium">{salaryMonth}/{salaryYear} —</span>
                {' '}الراتب الصافي:{' '}
                <span className="font-bold text-primary">{existingSalary.finalSalary?.toLocaleString()} دج</span>
                {' '}—
                {existingSalary.status === 'paid'
                  ? ` مدفوع بتاريخ ${existingSalary.paidAt ? format(new Date(existingSalary.paidAt), 'dd MMM yyyy') : '-'}`
                  : ' في انتظار الدفع'}
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* ── تقارير الرواتب ─────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              تقارير الرواتب
            </CardTitle>
            {/* Summary badges */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-1 font-medium">
                {salaries?.length ?? 0} راتب
              </span>
              <span className="text-xs bg-amber-500/10 text-amber-600 rounded-full px-2 py-1 font-medium">
                {bonuses?.length ?? 0} مكافأة
              </span>
              <span className="text-xs bg-orange-500/10 text-orange-600 rounded-full px-2 py-1 font-medium">
                {advances?.length ?? 0} سلفة
              </span>
              <span className="text-xs bg-rose-500/10 text-rose-600 rounded-full px-2 py-1 font-medium">
                {violations?.length ?? 0} مخالفة
              </span>
              <span className="text-xs bg-indigo-500/10 text-indigo-600 rounded-full px-2 py-1 font-medium">
                {transactions?.length ?? 0} معاملة
              </span>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-4 border-b pb-0 overflow-x-auto">
            {([
              { key: 'salaries', label: 'كشوف الرواتب', icon: <Banknote className="h-3.5 w-3.5" /> },
              { key: 'transactions', label: 'سجل المعاملات والخصومات', icon: <FileText className="h-3.5 w-3.5" /> },
              { key: 'bonuses', label: 'المكافآت', icon: <Gift className="h-3.5 w-3.5" /> },
              { key: 'advances', label: 'السلف', icon: <CreditCard className="h-3.5 w-3.5" /> },
              { key: 'violations', label: 'المخالفات', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {/* Tab: Salaries */}
          {activeTab === 'salaries' && (
            <div className="space-y-3">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-primary/5 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{salaries?.length ?? 0}</div>
                  <div className="text-xs text-muted-foreground">إجمالي الرواتب</div>
                </div>
                <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-emerald-600">{salaries?.filter(s => s.status === 'paid').length ?? 0}</div>
                  <div className="text-xs text-muted-foreground">مدفوع</div>
                </div>
                <div className="bg-amber-500/10 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-amber-600">
                    {(salaries?.reduce((s, sal) => s + (sal.finalSalary ?? 0), 0) ?? 0).toLocaleString()} دج
                  </div>
                  <div className="text-xs text-muted-foreground">إجمالي المدفوع</div>
                </div>
                <div className="bg-rose-500/10 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-rose-600">
                    {totalDeductions.toLocaleString()} دج
                  </div>
                  <div className="text-xs text-muted-foreground">إجمالي الخصومات</div>
                </div>
              </div>

              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">الفترة</th>
                      <th className="px-4 py-3 font-medium">الراتب الأساسي</th>
                      <th className="px-4 py-3 font-medium">التفصيل</th>
                      <th className="px-4 py-3 font-medium">المكافآت</th>
                      <th className="px-4 py-3 font-medium">الصافي</th>
                      <th className="px-4 py-3 font-medium">الحالة</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">تاريخ الدفع</th>
                      <th className="px-4 py-3 font-medium text-right">كشف PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {salaries && salaries.length > 0 ? salaries.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{s.month}/{s.year}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{s.baseSalary?.toLocaleString()} دج</td>
                        <td className="px-4 py-3">
                          <div className="text-xs space-y-0.5">
                            {(s as any).overtimeBonus > 0 && <div className="text-emerald-600">+ {(s as any).overtimeBonus?.toLocaleString()} إضافي</div>}
                            {(s as any).lateDeductions > 0 && <div className="text-rose-600">- {(s as any).lateDeductions?.toLocaleString()} تأخر</div>}
                            {(s as any).advanceDeductions > 0 && <div className="text-amber-600">- {(s as any).advanceDeductions?.toLocaleString()} سلفة</div>}
                            {(s as any).violationDeductions > 0 && <div className="text-rose-700">- {(s as any).violationDeductions?.toLocaleString()} مخالفة</div>}
                            {!(s as any).overtimeBonus && !(s as any).lateDeductions && !(s as any).advanceDeductions && !(s as any).violationDeductions && <span className="text-muted-foreground">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {(s as any).bonuses > 0 ? (
                            <span className="text-xs text-amber-600 font-medium">+ {(s as any).bonuses?.toLocaleString()} دج</span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 font-bold text-primary">{s.finalSalary?.toLocaleString()} دج</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={
                            s.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600 border-0' :
                            s.status === 'postponed' ? 'bg-amber-500/10 text-amber-600 border-0' :
                            'bg-slate-100 text-slate-600 border-0'
                          }>
                            {s.status === 'paid' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                            {t(`status.${s.status}`)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {s.paidAt ? format(new Date(s.paidAt), 'dd MMM yyyy') : '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary"
                            title="تحميل كشف الراتب PDF"
                            onClick={() => handlePrintPayslip(s.id)}
                            disabled={loadingPdf === s.id}
                          >
                            {loadingPdf === s.id
                              ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                              : <Download className="h-3.5 w-3.5" />
                            }
                          </Button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد رواتب مسجلة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Bonuses */}
          {activeTab === 'bonuses' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-2">
                <div className="flex gap-3">
                  <div className="bg-amber-500/10 rounded-lg px-3 py-2 text-center">
                    <span className="text-lg font-bold text-amber-600">{bonuses?.length ?? 0}</span>
                    <span className="text-xs text-muted-foreground mr-1">مكافأة</span>
                  </div>
                  <div className="bg-emerald-500/10 rounded-lg px-3 py-2 text-center">
                    <span className="text-lg font-bold text-emerald-600">{totalBonuses.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground mr-1">دج إجمالاً</span>
                  </div>
                  <div className="bg-blue-500/10 rounded-lg px-3 py-2 text-center">
                    <span className="text-lg font-bold text-blue-600">{pendingBonuses.length}</span>
                    <span className="text-xs text-muted-foreground mr-1">بانتظار التطبيق</span>
                  </div>
                </div>
                <Button size="sm" onClick={() => setBonusOpen(true)} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
                  <Plus className="h-3.5 w-3.5" /> إضافة مكافأة
                </Button>
              </div>

              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                      <th className="px-4 py-3 font-medium">السبب</th>
                      <th className="px-4 py-3 font-medium">ملاحظات</th>
                      <th className="px-4 py-3 font-medium">المبلغ</th>
                      <th className="px-4 py-3 font-medium">الحالة</th>
                      <th className="px-4 py-3 font-medium text-right">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bonuses && bonuses.length > 0 ? bonuses.map((b) => (
                      <tr key={b.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{b.date}</td>
                        <td className="px-4 py-3 font-medium">{b.reason}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{b.notes || '—'}</td>
                        <td className="px-4 py-3 font-bold text-amber-600">+ {b.amount.toLocaleString()} دج</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={
                            b.status === 'applied'
                              ? 'bg-emerald-500/10 text-emerald-600 border-0'
                              : 'bg-amber-500/10 text-amber-600 border-0'
                          }>
                            {b.status === 'applied' ? 'مُطبَّق' : 'بانتظار التطبيق'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {b.status === 'pending' && (
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-rose-400 hover:text-rose-600"
                              title="حذف المكافأة"
                              onClick={() => handleDeleteBonus(b.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد مكافآت مسجلة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Advances */}
          {activeTab === 'advances' && (
            <div className="space-y-3">
              <div className="flex gap-3 mb-2">
                <div className="bg-orange-500/10 rounded-lg px-3 py-2">
                  <span className="text-lg font-bold text-orange-600">{advances?.length ?? 0}</span>
                  <span className="text-xs text-muted-foreground mr-1">طلب سلفة</span>
                </div>
                <div className="bg-emerald-500/10 rounded-lg px-3 py-2">
                  <span className="text-lg font-bold text-emerald-600">
                    {advances?.filter(a => a.status === 'approved').reduce((s, a) => s + a.amount, 0).toLocaleString() ?? 0}
                  </span>
                  <span className="text-xs text-muted-foreground mr-1">دج معتمد</span>
                </div>
              </div>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">تاريخ الطلب</th>
                      <th className="px-4 py-3 font-medium">المبلغ</th>
                      <th className="px-4 py-3 font-medium">السبب</th>
                      <th className="px-4 py-3 font-medium">الحالة</th>
                      <th className="px-4 py-3 font-medium">تاريخ الحل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {advances && advances.length > 0 ? advances.map((a) => (
                      <tr key={a.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{format(new Date(a.requestedAt), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3 font-bold text-orange-600">{a.amount.toLocaleString()} دج</td>
                        <td className="px-4 py-3 text-muted-foreground">{a.reason || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={
                            a.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-0' :
                            a.status === 'rejected' ? 'bg-rose-500/10 text-rose-600 border-0' :
                            'bg-amber-500/10 text-amber-600 border-0'
                          }>
                            {a.status === 'approved' ? 'معتمد' : a.status === 'rejected' ? 'مرفوض' : 'بانتظار الموافقة'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {a.resolvedAt ? format(new Date(a.resolvedAt), 'dd MMM yyyy') : '—'}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد سلف مسجلة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Violations */}
          {activeTab === 'violations' && (
            <div className="space-y-3">
              <div className="flex gap-3 mb-2">
                <div className="bg-rose-500/10 rounded-lg px-3 py-2">
                  <span className="text-lg font-bold text-rose-600">{violations?.length ?? 0}</span>
                  <span className="text-xs text-muted-foreground mr-1">مخالفة</span>
                </div>
                <div className="bg-rose-500/10 rounded-lg px-3 py-2">
                  <span className="text-lg font-bold text-rose-600">
                    {violations?.reduce((s, v) => s + (v.amount ?? 0), 0).toLocaleString() ?? 0}
                  </span>
                  <span className="text-xs text-muted-foreground mr-1">دج إجمالي الخصومات</span>
                </div>
              </div>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                      <th className="px-4 py-3 font-medium">السبب</th>
                      <th className="px-4 py-3 font-medium">النوع</th>
                      <th className="px-4 py-3 font-medium">مبلغ الخصم</th>
                      <th className="px-4 py-3 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {violations && violations.length > 0 ? violations.map((v) => (
                      <tr key={v.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{v.violationDate || format(new Date(v.createdAt), 'yyyy-MM-dd')}</td>
                        <td className="px-4 py-3">{v.reason}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{v.violationType || '—'}</td>
                        <td className="px-4 py-3 font-bold text-rose-600">
                          {v.amount ? `- ${v.amount.toLocaleString()} دج` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={
                            v.status === 'deducted' ? 'bg-rose-500/10 text-rose-600 border-0' :
                            'bg-amber-500/10 text-amber-600 border-0'
                          }>
                            {v.status === 'deducted' ? 'مخصوم' : 'بانتظار الخصم'}
                          </Badge>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد مخالفات مسجلة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Transactions Audit Log */}
          {activeTab === 'transactions' && (
            <div className="space-y-3">
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm text-right">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">التاريخ والوقت</th>
                      <th className="px-4 py-3 font-medium">نوع العملية</th>
                      <th className="px-4 py-3 font-medium">السبب / البيان</th>
                      <th className="px-4 py-3 font-medium">المبلغ</th>
                      <th className="px-4 py-3 font-medium">الرصيد قبل / بعد</th>
                      <th className="px-4 py-3 font-medium">المنفذ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions && transactions.length > 0 ? (
                      transactions.map((tx) => {
                        const isPositive = tx.amount > 0;
                        return (
                          <tr key={tx.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-mono text-muted-foreground text-xs whitespace-nowrap">
                              {format(new Date(tx.createdAt), 'dd/MM/yyyy HH:mm')}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={
                                  tx.type === 'bonus' || tx.type === 'raise'
                                    ? 'bg-emerald-500/10 text-emerald-600 border-0'
                                    : tx.type === 'violation' || tx.type === 'late_deduction' || tx.type === 'absence_deduction' || tx.type === 'deduction'
                                    ? 'bg-rose-500/10 text-rose-600 border-0'
                                    : 'bg-amber-500/10 text-amber-600 border-0'
                                }
                              >
                                {tx.type === 'bonus'
                                  ? 'مكافأة'
                                  : tx.type === 'raise'
                                  ? 'زيادة راتب'
                                  : tx.type === 'deduction'
                                  ? 'خصم مباشر'
                                  : tx.type === 'violation'
                                  ? 'خصم مخالفة'
                                  : tx.type === 'late_deduction'
                                  ? 'خصم تأخير'
                                  : tx.type === 'absence_deduction'
                                  ? 'خصم غياب'
                                  : tx.type === 'advance'
                                  ? 'سلفة'
                                  : tx.type}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-medium max-w-[220px] truncate">{tx.reason}</td>
                            <td className="px-4 py-3 font-bold font-mono whitespace-nowrap" dir="ltr">
                              <span className={isPositive ? 'text-emerald-600' : 'text-rose-600'}>
                                {isPositive ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()} DZD
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap" dir="ltr">
                              {tx.balanceBefore != null && tx.balanceAfter != null ? (
                                <span>{tx.balanceBefore.toLocaleString()} → <strong className="text-foreground">{tx.balanceAfter.toLocaleString()}</strong> DZD</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{tx.performedBy || 'النظام'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground">
                          لا توجد معاملات مسجلة في هذا السجل
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Salary Preview / Pay Modal ─────────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              {existingSalary ? 'مراجعة الراتب قبل الصرف' : 'معاينة احتساب الراتب'}
            </DialogTitle>
          </DialogHeader>

          {preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                <span>{employee.firstName} {employee.lastName}</span>
                <span className="font-medium">{salaryMonth}/{salaryYear}</span>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center bg-emerald-50 rounded-lg p-2">
                  <div className="text-xl font-bold text-emerald-600">{preview.presentDays}</div>
                  <div className="text-xs text-muted-foreground">حضور</div>
                </div>
                <div className="text-center bg-rose-50 rounded-lg p-2">
                  <div className="text-xl font-bold text-rose-600">{preview.absentDays}</div>
                  <div className="text-xs text-muted-foreground">غياب</div>
                </div>
                <div className="text-center bg-amber-50 rounded-lg p-2">
                  <div className="text-xl font-bold text-amber-600">{preview.lateDays}</div>
                  <div className="text-xs text-muted-foreground">تأخر</div>
                </div>
                <div className="text-center bg-blue-50 rounded-lg p-2">
                  <div className="text-xl font-bold text-blue-600">{preview.overtimeHours.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">إضافي</div>
                </div>
              </div>

              {/* Bonuses notice */}
              {preview.bonuses > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
                  <Gift className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-amber-700">
                    يشمل <strong>{preview.pendingBonuses?.length ?? 0}</strong> مكافأة بإجمالي <strong>{preview.bonuses.toLocaleString()} دج</strong>
                  </span>
                </div>
              )}

              {/* Breakdown */}
              <div className="rounded-lg border overflow-hidden">
                <div className="divide-y">
                  <BreakdownRow label="الراتب الأساسي" amount={preview.baseSalary} type="base" />
                  {preview.overtimeBonus > 0 && (
                    <BreakdownRow label={`مكافأة الوقت الإضافي (${preview.overtimeHours.toFixed(1)}س)`} amount={preview.overtimeBonus} type="positive" />
                  )}
                  {preview.bonuses > 0 && (
                    <BreakdownRow label="المكافآت الإدارية" amount={preview.bonuses} type="positive" />
                  )}
                  {preview.lateDeductions > 0 && (
                    <BreakdownRow label="خصم التأخر" amount={-preview.lateDeductions} type="negative" />
                  )}
                  {preview.advanceDeductions > 0 && (
                    <BreakdownRow label="استرداد السلف" amount={-preview.advanceDeductions} type="negative" />
                  )}
                  {preview.violationDeductions > 0 && (
                    <BreakdownRow label="خصم المخالفات" amount={-preview.violationDeductions} type="negative" />
                  )}
                  {preview.otherDeductions > 0 && (
                    <BreakdownRow label="خصومات أخرى" amount={-preview.otherDeductions} type="negative" />
                  )}
                </div>
                <div className="bg-primary/5 px-4 py-3 flex justify-between items-center">
                  <span className="font-bold text-sm">💰 الراتب الصافي النهائي</span>
                  <span className="text-xl font-black text-primary">{preview.finalSalary.toLocaleString()} دج</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>{t('action.cancel')}</Button>
            {!existingSalary ? (
              <Button onClick={handleGenerateSalary} disabled={generating} className="gap-1.5">
                <Calculator className="h-4 w-4" />
                {generating ? 'جارٍ التوليد...' : 'توليد كشف الراتب'}
              </Button>
            ) : existingSalary.status !== 'paid' ? (
              <Button onClick={() => handlePaySalary(existingSalary.id)} disabled={paying} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                <Banknote className="h-4 w-4" />
                {paying ? 'جارٍ الدفع...' : 'تأكيد صرف الراتب'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Bonus Dialog ─────────────────────────────────────────────── */}
      <Dialog open={bonusOpen} onOpenChange={setBonusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-500" />
              إضافة مكافأة للموظف
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/30 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{employee.firstName} {employee.lastName}</span>
              <span className="text-muted-foreground">— {employee.position}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bonus-amount">المبلغ (دج) *</Label>
              <Input
                id="bonus-amount"
                type="number"
                min="1"
                placeholder="مثال: 5000"
                value={bonusAmount}
                onChange={e => setBonusAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bonus-reason">السبب / العنوان *</Label>
              <Input
                id="bonus-reason"
                placeholder="مثال: مكافأة الأداء المتميز"
                value={bonusReason}
                onChange={e => setBonusReason(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bonus-date">التاريخ</Label>
              <Input
                id="bonus-date"
                type="date"
                value={bonusDate}
                onChange={e => setBonusDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bonus-notes">ملاحظات إضافية (اختياري)</Label>
              <Textarea
                id="bonus-notes"
                placeholder="تفاصيل إضافية حول المكافأة..."
                value={bonusNotes}
                onChange={e => setBonusNotes(e.target.value)}
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-100 rounded-lg p-2">
              💡 ستُضاف المكافأة تلقائياً إلى راتب الموظف عند توليد كشف الراتب التالي، وسيصل إشعار فوري للموظف.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBonusOpen(false)} disabled={bonusSaving}>إلغاء</Button>
            <Button onClick={handleAddBonus} disabled={bonusSaving} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
              <Gift className="h-4 w-4" />
              {bonusSaving ? 'جارٍ الحفظ...' : 'تأكيد المكافأة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground bg-muted p-1.5 rounded-md">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function BreakdownRow({ label, amount, type }: { label: string; amount: number; type: 'base' | 'positive' | 'negative' }) {
  const amtClass = type === 'positive' ? 'text-emerald-600' : type === 'negative' ? 'text-rose-600' : 'text-foreground';
  const sign = type === 'positive' ? '+' : type === 'negative' ? '' : '';
  return (
    <div className="px-4 py-2.5 flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold font-mono ${amtClass}`}>
        {sign}{amount.toLocaleString()} دج
      </span>
    </div>
  );
}

import React, { useState } from 'react';
import { useListSalaries, useGenerateSalaries, usePaySalary, usePostponeSalary, getListSalariesQueryKey } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/context/i18n';
import { format, subMonths } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calculator, CheckCircle2, Clock, CalendarDays, FileText,
  Bell, AlertCircle, TrendingUp, Banknote, Users, Eye, Gift, ShieldAlert, CreditCard,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { generatePayslipPDF } from '@/lib/payslip-pdf';
import { Link } from 'wouter';
import { adminFetch } from '@/lib/admin-api';

interface UpcomingEmployee {
  employeeId: number;
  employeeName: string;
  officeId: number;
  officeName: string | null;
  paymentDay: number;
  nextPaymentDate: string;
  daysRemaining: number;
  currentMonth: string;
  currentYear: number;
  salaryId: number | null;
  salaryStatus: string | null;
  finalSalary: number | null;
  baseSalary: number;
}

export default function Salaries() {
  const { t } = useI18n();
  const lastMonth = subMonths(new Date(), 1);
  const [month, setMonth] = useState(format(lastMonth, 'MM'));
  const [year, setYear] = useState(format(lastMonth, 'yyyy'));
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [postponeDays, setPostponeDays] = useState('3');
  const [postponingId, setPostponingId] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [generatingSingleId, setGeneratingSingleId] = useState<number | null>(null);
  const [loadingPdf, setLoadingPdf] = useState<number | null>(null);

  // Review dialog state
  const [reviewEmp, setReviewEmp] = useState<UpcomingEmployee | null>(null);
  const [reviewPreview, setReviewPreview] = useState<any | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewGenerating, setReviewGenerating] = useState(false);
  const [reviewPaying, setReviewPaying] = useState(false);
  // live salaryId resolved after auto-generate (may differ from reviewEmp.salaryId)
  const [resolvedSalaryId, setResolvedSalaryId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: salaries = [], isLoading } = useListSalaries({ month, year: parseInt(year) });
  const generateMutation = useGenerateSalaries();
  const payMutation = usePaySalary();
  const postponeMutation = usePostponeSalary();

  // Upcoming salaries
  const { data: upcoming = [], isLoading: upcomingLoading } = useQuery<UpcomingEmployee[]>({
    queryKey: ['salaries', 'upcoming'],
    queryFn: async () => {
      return adminFetch<UpcomingEmployee[]>('/salaries/upcoming');
    },
    refetchInterval: 60000,
  });

  const paidSalaries = salaries.filter(s => s.status === 'paid');
  const unpaidSalaries = salaries.filter(s => s.status !== 'paid');

  const withPending = upcoming.filter(e => e.salaryId && e.salaryStatus !== 'paid');
  const dueSoon = upcoming.filter(e => e.daysRemaining <= 2);

  // ── Review Dialog Handlers ─────────────────────────────────────────────────
  const handleOpenReview = async (emp: UpcomingEmployee) => {
    setReviewEmp(emp);
    setReviewPreview(null);
    setReviewLoading(true);
    setResolvedSalaryId(emp.salaryId);
    try {
      const previewData = await adminFetch<any>(
        `/salaries/preview?employeeId=${emp.employeeId}&month=${emp.currentMonth}&year=${emp.currentYear}`,
      );
      // Use saved finalSalary if salary already generated, else use preview
      setReviewPreview(
        emp.salaryId
          ? { ...previewData, finalSalary: emp.finalSalary ?? previewData.finalSalary }
          : previewData
      );
    } catch {
      toast({ title: 'خطأ في تحميل بيانات الراتب', variant: 'destructive' });
      setReviewEmp(null);
    } finally {
      setReviewLoading(false);
    }
  };

  // Unified: auto-generate salary (if needed) then pay in one step
  const handleReviewPay = async () => {
    if (!reviewEmp) return;
    setReviewPaying(true);
    try {
      let salaryId = resolvedSalaryId;

      // Auto-generate salary if it hasn't been created yet
      if (!salaryId) {
        const genData = await adminFetch<any>('/salaries/single', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: reviewEmp.employeeId,
            month: reviewEmp.currentMonth,
            year: reviewEmp.currentYear,
          }),
        }, 15_000, [409]);
        salaryId = genData.id ?? genData.salary?.id;
        if (!salaryId) throw new Error('لم يتم الحصول على معرف الراتب');
        setResolvedSalaryId(salaryId);
      }

      // Pay the salary (API also creates employee + admin notifications)
      await adminFetch(`/salaries/${salaryId}/pay`, {
        method: 'PATCH', credentials: 'include',
      });

      queryClient.invalidateQueries({ queryKey: getListSalariesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ['salaries', 'upcoming'] });
      toast({ title: `✅ تم صرف راتب ${reviewEmp.employeeName} وإرسال إشعار للموظف` });
      setReviewEmp(null);
      setReviewPreview(null);
      setResolvedSalaryId(null);
    } catch (e: any) {
      toast({ title: 'خطأ في صرف الراتب', description: e.message, variant: 'destructive' });
    } finally {
      setReviewPaying(false);
    }
  };

  // Defer from upcoming tab: auto-generate if needed then postpone
  const handleDeferFromUpcoming = async (emp: UpcomingEmployee) => {
    if (emp.salaryId) {
      // Salary exists — open the postpone dialog directly
      setPostponingId(emp.salaryId);
      return;
    }
    // No salary yet — generate it then postpone
    setGeneratingSingleId(emp.employeeId);
    try {
      const genData = await adminFetch<any>('/salaries/single', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: emp.employeeId,
          month: emp.currentMonth,
          year: emp.currentYear,
        }),
      }, 15_000, [409]);
      const salaryId = genData.id ?? genData.salary?.id;
      if (!salaryId) throw new Error('لم يتم الحصول على معرف الراتب');
      queryClient.invalidateQueries({ queryKey: ['salaries', 'upcoming'] });
      queryClient.invalidateQueries({ queryKey: getListSalariesQueryKey() });
      setPostponingId(salaryId);
    } catch (e: any) {
      toast({ title: 'خطأ في التأجيل', description: e.message, variant: 'destructive' });
    } finally {
      setGeneratingSingleId(null);
    }
  };

  // ── Standard Handlers ─────────────────────────────────────────────────────
  const handleGenerate = () => {
    generateMutation.mutate(
      { data: { month, year: parseInt(year) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSalariesQueryKey() });
          queryClient.invalidateQueries({ queryKey: ['salaries', 'upcoming'] });
          setIsGenerateOpen(false);
          toast({ title: t('salaries.toast.generated') });
        }
      }
    );
  };

  const handlePay = (id: number) => {
    setPayingId(id);
    payMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSalariesQueryKey() });
          queryClient.invalidateQueries({ queryKey: ['salaries', 'upcoming'] });
          toast({ title: t('salaries.toast.paid') });
          setPayingId(null);
        },
        onError: () => setPayingId(null),
      }
    );
  };

  const handlePostpone = () => {
    if (!postponingId) return;
    postponeMutation.mutate(
      { id: postponingId, data: { days: parseInt(postponeDays) as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSalariesQueryKey() });
          setPostponingId(null);
          toast({ title: t('salaries.toast.postponed', { days: postponeDays }) });
        }
      }
    );
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

  const statusBadge = (status: string | null) => {
    if (status === 'paid') return <Badge className="bg-emerald-500/10 text-emerald-600 border-0 gap-1"><CheckCircle2 className="w-3 h-3" />{t('status.paid')}</Badge>;
    if (status === 'postponed') return <Badge className="bg-amber-500/10 text-amber-600 border-0 gap-1"><Clock className="w-3 h-3" />{t('status.postponed')}</Badge>;
    if (status === 'pending') return <Badge className="bg-slate-100 text-slate-600 border-0 gap-1"><CalendarDays className="w-3 h-3" />{t('status.pending')}</Badge>;
    return <Badge className="bg-slate-50 text-slate-400 border-dashed gap-1"><AlertCircle className="w-3 h-3" />لم يُولَّد</Badge>;
  };

  const daysColor = (days: number) => {
    if (days <= 0) return 'text-red-600 font-bold';
    if (days <= 2) return 'text-amber-600 font-bold';
    if (days <= 7) return 'text-orange-500 font-semibold';
    return 'text-slate-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('nav.salaries')}</h1>
          <p className="text-muted-foreground mt-1">{t('salaries.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {dueSoon.length > 0 && (
            <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 gap-1.5 px-3 py-1.5">
              <Bell className="w-3.5 h-3.5" />
              {dueSoon.length} {dueSoon.length === 1 ? 'راتب مستحق قريباً' : 'رواتب مستحقة قريباً'}
            </Badge>
          )}
          <Button onClick={() => setIsGenerateOpen(true)} className="shadow-sm">
            <Calculator className="mr-2 h-4 w-4" /> {t('salaries.generate')}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList className="grid w-full grid-cols-3 mb-2">
          <TabsTrigger value="upcoming" className="gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            الرواتب القادمة
            {withPending.length > 0 && (
              <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {withPending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="paid" className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            المودَعة
          </TabsTrigger>
          <TabsTrigger value="unpaid" className="gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            غير المودَعة
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: UPCOMING ─────────────────────────────────────────────── */}
        <TabsContent value="upcoming">
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                جميع الموظفين النشطين — مواعيد الرواتب القادمة
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="rounded-md border overflow-hidden mx-6 mb-6">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>الموظف</TableHead>
                      <TableHead>الراتب الأساسي</TableHead>
                      <TableHead>يوم الدفع</TableHead>
                      <TableHead>تاريخ الاستحقاق</TableHead>
                      <TableHead>الأيام المتبقية</TableHead>
                      <TableHead>حالة الشهر الحالي</TableHead>
                      <TableHead className="text-right">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8">{t('action.loading')}</TableCell></TableRow>
                    ) : upcoming.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          <Users className="h-10 w-10 text-muted-foreground/30 mb-3 mx-auto" />
                           <p>لا يوجد موظفون نشطون لعرض مواعيد رواتبهم</p>
                           <p className="mt-1 text-xs">أضف موظفًا أو فعّل موظفًا من صفحة الموظفين، ثم ستظهر مواعيد الدفع تلقائيًا هنا.</p>
                           <Button variant="outline" size="sm" className="mt-4" asChild>
                             <Link href="/employees">إدارة الموظفين</Link>
                           </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      upcoming.map((emp) => {
                        const isDueSoon = emp.daysRemaining <= 2;
                        const isPaid = emp.salaryStatus === 'paid';
                        return (
                          <TableRow
                            key={emp.employeeId}
                            className={`hover:bg-muted/30 transition-colors ${isDueSoon && !isPaid ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}
                          >
                            <TableCell className="font-medium">
                              <Link
                                href={`/employees/${emp.employeeId}`}
                                className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                              >
                                {emp.employeeName}
                              </Link>
                              <div className="text-xs text-muted-foreground font-normal mt-0.5">{emp.officeName}</div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{emp.baseSalary.toLocaleString()} دج</TableCell>
                            <TableCell>
                              <span className="bg-primary/10 text-primary font-bold rounded px-2 py-0.5 text-sm">{emp.paymentDay}</span>
                            </TableCell>
                            <TableCell className="font-mono text-sm text-slate-600">{emp.nextPaymentDate}</TableCell>
                            <TableCell>
                              <span className={`text-sm ${daysColor(emp.daysRemaining)}`}>
                                {emp.daysRemaining === 0 ? '⚠️ اليوم' :
                                 emp.daysRemaining === 1 ? '⚠️ غداً' :
                                 emp.daysRemaining <= 2 ? `🔔 ${emp.daysRemaining} أيام` :
                                 `${emp.daysRemaining} يوم`}
                              </span>
                            </TableCell>
                            <TableCell>
                              {statusBadge(emp.salaryStatus)}
                              {isDueSoon && !isPaid && (
                                <div className="text-xs text-amber-600 font-medium mt-1">⚡ مستحق قريباً</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2 flex-wrap">
                                {emp.salaryStatus === 'paid' ? (
                                  /* Already paid — show payslip only */
                                  <Button
                                    size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground gap-1"
                                    onClick={() => handlePrintPayslip(emp.salaryId!)}
                                    disabled={loadingPdf === emp.salaryId}
                                  >
                                    <FileText className="w-3 h-3" />
                                    {loadingPdf === emp.salaryId ? 'جاري...' : 'كشف الراتب'}
                                  </Button>
                                ) : (
                                  /* Unpaid — always show Defer + Pay */
                                  <>
                                    <Button
                                      size="sm" variant="outline" className="h-8 text-xs"
                                      onClick={() => handleDeferFromUpcoming(emp)}
                                      disabled={generatingSingleId === emp.employeeId}
                                    >
                                      <Clock className="w-3 h-3 mr-1" />
                                      تأجيل
                                    </Button>
                                    <Button
                                      size="sm"
                                      className={`h-8 text-xs gap-1 ${isDueSoon ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                      onClick={() => handleOpenReview(emp)}
                                      disabled={generatingSingleId === emp.employeeId}
                                    >
                                      <Banknote className="w-3 h-3" />
                                      دفع
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: PAID ─────────────────────────────────────────────────── */}
        <TabsContent value="paid">
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  الرواتب المودَعة
                </CardTitle>
                <MonthYearPicker month={month} year={year} setMonth={setMonth} setYear={setYear} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <SalaryTable
                salaries={paidSalaries}
                isLoading={isLoading}
                onPostpone={setPostponingId}
                onPay={handlePay}
                onPrint={handlePrintPayslip}
                payingId={payingId}
                loadingPdf={loadingPdf}
                t={t}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: UNPAID ───────────────────────────────────────────────── */}
        <TabsContent value="unpaid">
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  الرواتب غير المودَعة
                </CardTitle>
                <MonthYearPicker month={month} year={year} setMonth={setMonth} setYear={setYear} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <SalaryTable
                salaries={unpaidSalaries}
                isLoading={isLoading}
                onPostpone={setPostponingId}
                onPay={handlePay}
                onPrint={handlePrintPayslip}
                payingId={payingId}
                loadingPdf={loadingPdf}
                t={t}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Generate All Modal ──────────────────────────────────────────── */}
      <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('salaries.modal.title')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <MonthYearPicker month={month} year={year} setMonth={setMonth} setYear={setYear} />
            <p className="text-sm text-muted-foreground">
              {t('salaries.modal.desc1')} {month}/{year}, {t('salaries.modal.desc2')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGenerateOpen(false)}>{t('action.cancel')}</Button>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>{t('salaries.generate_now')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Postpone Modal ──────────────────────────────────────────────── */}
      <Dialog open={!!postponingId} onOpenChange={(open) => !open && setPostponingId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('salaries.postpone.title')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <label className="text-sm font-medium">{t('salaries.postpone.delay_label')}</label>
            <Select value={postponeDays} onValueChange={setPostponeDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('salaries.postpone.1day')}</SelectItem>
                <SelectItem value="2">{t('salaries.postpone.2days')}</SelectItem>
                <SelectItem value="3">{t('salaries.postpone.3days')}</SelectItem>
                <SelectItem value="5">{t('salaries.postpone.5days')}</SelectItem>
                <SelectItem value="7">{t('salaries.postpone.1week')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostponingId(null)}>{t('action.cancel')}</Button>
            <Button onClick={handlePostpone} disabled={postponeMutation.isPending}>{t('salaries.postpone.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Salary Review / Pay Dialog ──────────────────────────────────── */}
      <Dialog open={!!reviewEmp} onOpenChange={(open) => { if (!open) { setReviewEmp(null); setReviewPreview(null); setResolvedSalaryId(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Banknote className="h-5 w-5 text-emerald-600 shrink-0" />
              صرف الراتب
              {reviewEmp && (
                <span className="text-sm font-normal text-muted-foreground">— {reviewEmp.employeeName}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {reviewLoading ? (
            <div className="py-10 text-center text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
              جارٍ تحميل بيانات الراتب...
            </div>
          ) : reviewPreview ? (
            <div className="space-y-4">
              {/* Period badge */}
              <div className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2">
                <span className="text-muted-foreground">الفترة</span>
                <span className="font-medium">{reviewEmp?.currentMonth}/{reviewEmp?.currentYear}</span>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-2">
                  <div className="text-xl font-bold text-emerald-600">{reviewPreview.presentDays ?? 0}</div>
                  <div className="text-xs text-muted-foreground">حضور</div>
                </div>
                <div className="text-center bg-rose-50 dark:bg-rose-950/30 rounded-lg p-2">
                  <div className="text-xl font-bold text-rose-600">{reviewPreview.absentDays ?? 0}</div>
                  <div className="text-xs text-muted-foreground">غياب</div>
                </div>
                <div className="text-center bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
                  <div className="text-xl font-bold text-amber-600">{reviewPreview.lateDays ?? 0}</div>
                  <div className="text-xs text-muted-foreground">تأخر</div>
                </div>
                <div className="text-center bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2">
                  <div className="text-xl font-bold text-blue-600">{(reviewPreview.overtimeHours ?? 0).toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">إضافي</div>
                </div>
              </div>

              {/* Deductions and bonuses summary */}
              {(reviewPreview.bonuses > 0 || reviewPreview.advanceDeductions > 0 || reviewPreview.violationDeductions > 0) && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {reviewPreview.bonuses > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-center">
                      <Gift className="h-3 w-3 text-amber-500 mx-auto mb-1" />
                      <div className="font-bold text-amber-600">+{reviewPreview.bonuses.toLocaleString()}</div>
                      <div className="text-muted-foreground">مكافآت</div>
                    </div>
                  )}
                  {reviewPreview.advanceDeductions > 0 && (
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2 text-center">
                      <CreditCard className="h-3 w-3 text-orange-500 mx-auto mb-1" />
                      <div className="font-bold text-orange-600">-{reviewPreview.advanceDeductions.toLocaleString()}</div>
                      <div className="text-muted-foreground">سلف</div>
                    </div>
                  )}
                  {reviewPreview.violationDeductions > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-950/30 rounded-lg p-2 text-center">
                      <ShieldAlert className="h-3 w-3 text-rose-500 mx-auto mb-1" />
                      <div className="font-bold text-rose-600">-{reviewPreview.violationDeductions.toLocaleString()}</div>
                      <div className="text-muted-foreground">مخالفات</div>
                    </div>
                  )}
                </div>
              )}

              {/* Full breakdown */}
              <div className="rounded-lg border overflow-hidden">
                <div className="divide-y">
                  <BreakdownRow label="الراتب الأساسي" amount={reviewPreview.baseSalary} sign="" color="" />
                  {(reviewPreview.overtimeBonus ?? 0) > 0 && (
                    <BreakdownRow label={`مكافأة الوقت الإضافي (${(reviewPreview.overtimeHours ?? 0).toFixed(1)}س)`} amount={reviewPreview.overtimeBonus} sign="+" color="text-emerald-600" />
                  )}
                  {(reviewPreview.bonuses ?? 0) > 0 && (
                    <BreakdownRow label="المكافآت الإدارية" amount={reviewPreview.bonuses} sign="+" color="text-amber-600" />
                  )}
                  {(reviewPreview.lateDeductions ?? 0) > 0 && (
                    <BreakdownRow label="خصم التأخر" amount={reviewPreview.lateDeductions} sign="-" color="text-rose-600" />
                  )}
                  {(reviewPreview.advanceDeductions ?? 0) > 0 && (
                    <BreakdownRow label="استرداد السلف" amount={reviewPreview.advanceDeductions} sign="-" color="text-rose-600" />
                  )}
                  {(reviewPreview.violationDeductions ?? 0) > 0 && (
                    <BreakdownRow label="خصم المخالفات" amount={reviewPreview.violationDeductions} sign="-" color="text-rose-600" />
                  )}
                </div>
                <div className="bg-primary/5 px-4 py-3 flex justify-between items-center">
                  <span className="font-bold text-sm">💰 الراتب الصافي النهائي</span>
                  <span className="text-xl font-black text-primary">{(reviewPreview.finalSalary ?? 0).toLocaleString()} دج</span>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setReviewEmp(null); setReviewPreview(null); setResolvedSalaryId(null); }}>إغلاق</Button>
            {reviewEmp && reviewEmp.salaryStatus !== 'paid' && reviewPreview && (
              <Button
                onClick={handleReviewPay}
                disabled={reviewPaying || reviewLoading}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              >
                <Banknote className="h-4 w-4" />
                {reviewPaying
                  ? (!resolvedSalaryId ? 'جارٍ الاحتساب...' : 'جارٍ الصرف...')
                  : 'تأكيد الدفع وإشعار الموظف'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function BreakdownRow({ label, amount, sign, color }: { label: string; amount: number; sign: string; color: string }) {
  return (
    <div className="px-4 py-2.5 flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold font-mono ${color || 'text-foreground'}`}>
        {sign}{amount.toLocaleString()} دج
      </span>
    </div>
  );
}

function MonthYearPicker({ month, year, setMonth, setYear }: {
  month: string; year: string;
  setMonth: (m: string) => void; setYear: (y: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg border w-fit">
      <Select value={month} onValueChange={setMonth}>
        <SelectTrigger className="w-[120px] bg-transparent border-0 shadow-none focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 12 }).map((_, i) => {
            const m = (i + 1).toString().padStart(2, '0');
            return <SelectItem key={m} value={m}>{format(new Date(2000, i, 1), 'MMMM')}</SelectItem>;
          })}
        </SelectContent>
      </Select>
      <div className="w-px h-6 bg-border" />
      <Select value={year} onValueChange={setYear}>
        <SelectTrigger className="w-[100px] bg-transparent border-0 shadow-none focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[2023, 2024, 2025, 2026].map(y => (
            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SalaryTable({ salaries, isLoading, onPostpone, onPay, onPrint, payingId, loadingPdf, t }: {
  salaries: any[];
  isLoading: boolean;
  onPostpone: (id: number) => void;
  onPay: (id: number) => void;
  onPrint: (id: number) => void;
  payingId: number | null;
  loadingPdf: number | null;
  t: (key: string) => string;
}) {
  return (
    <div className="rounded-md border overflow-hidden mx-6 mb-6">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead>{t('salaries.col.employee')}</TableHead>
            <TableHead>{t('salaries.col.base')}</TableHead>
            <TableHead>{t('salaries.col.breakdown')}</TableHead>
            <TableHead>{t('salaries.col.net')}</TableHead>
            <TableHead>{t('salaries.col.status')}</TableHead>
            <TableHead className="text-right">{t('table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8">{t('action.loading')}</TableCell></TableRow>
          ) : salaries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                <Calculator className="h-10 w-10 text-muted-foreground/30 mb-3 mx-auto" />
                <p>لا توجد رواتب في هذه الفترة</p>
              </TableCell>
            </TableRow>
          ) : (
            salaries.map((s) => (
              <TableRow key={s.id} className="hover:bg-muted/30">
                <TableCell className="font-medium">
                  <Link href={`/employees/${s.employeeId}`} className="hover:text-primary hover:underline underline-offset-2">
                    {s.employeeName}
                  </Link>
                  <div className="text-xs text-muted-foreground font-normal mt-0.5">{s.officeName} — {s.month}/{s.year}</div>
                </TableCell>
                <TableCell className="font-mono text-sm">{s.baseSalary.toLocaleString()} دج</TableCell>
                <TableCell>
                  <div className="text-xs space-y-0.5">
                    {s.overtimeBonus > 0 && <div className="text-emerald-600">+ {s.overtimeBonus} {t('salaries.overtime_label')}</div>}
                    {s.lateDeductions > 0 && <div className="text-rose-600">- {s.lateDeductions} {t('salaries.late_label')}</div>}
                    {s.advanceDeductions > 0 && <div className="text-amber-600">- {s.advanceDeductions} {t('salaries.advance_label')}</div>}
                    {(s as any).violationDeductions > 0 && <div className="text-rose-700 font-medium">- {(s as any).violationDeductions} {t('violations.salary_label')}</div>}
                    {(s as any).bonuses > 0 && <div className="text-amber-600">+ {(s as any).bonuses} مكافآت</div>}
                  </div>
                </TableCell>
                <TableCell className="font-bold font-mono text-primary text-base">
                  {s.finalSalary?.toLocaleString()} دج
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={
                    s.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600 border-0' :
                    s.status === 'postponed' ? 'bg-amber-500/10 text-amber-600 border-0' :
                    'bg-slate-100 text-slate-600 border-0'
                  }>
                    {s.status === 'paid' ? <CheckCircle2 className="w-3 h-3 mr-1" /> :
                     s.status === 'postponed' ? <Clock className="w-3 h-3 mr-1" /> :
                     <CalendarDays className="w-3 h-3 mr-1" />}
                    {t(`status.${s.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 items-center">
                    {s.status !== 'paid' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onPostpone(s.id)} className="h-8">
                          {t('status.postponed')}
                        </Button>
                        <Button size="sm" onClick={() => onPay(s.id)} className="h-8 bg-emerald-600 hover:bg-emerald-700" disabled={payingId === s.id}>
                          <Banknote className="w-3 h-3 mr-1" />
                          {payingId === s.id ? 'جاري...' : t('status.paid')}
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"
                      title={t('salaries.print')}
                      onClick={() => onPrint(s.id)}
                      disabled={loadingPdf === s.id}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

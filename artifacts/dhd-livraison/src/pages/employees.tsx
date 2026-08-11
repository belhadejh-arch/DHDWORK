import React, { useState } from 'react';
import { useListOffices, getListEmployeesQueryKey } from '@workspace/api-client-react';
import { useI18n } from '@/context/i18n';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Plus, Edit, Trash2, ChevronRight, QrCode, RefreshCw, Users, UserX, Download, Printer, Clock, Calendar } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import QRCode from 'react-qr-code';

import { API_BASE } from '@/lib/api-base';

function adminFetch(token: string, path: string, options: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  }).then(async r => {
    const data = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(data?.error ?? r.statusText), { status: r.status });
    return data;
  });
}

const DAYS_OF_WEEK = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DEFAULT_WORK_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

const employeeSchema = z.object({
  officeId: z.coerce.number().min(1, 'Office is required'),
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  phone: z.string().min(1, 'Phone required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  position: z.string().min(1, 'Position required'),
  hireDate: z.string().optional().or(z.literal('')),
  baseSalary: z.coerce.number().min(0, 'Must be positive'),
  paymentDay: z.coerce.number().min(1).max(31).optional().or(z.literal('').transform(() => undefined)),
  workStartTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
  workEndTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
  workDays: z.array(z.string()).min(1, 'اختر يوم عمل واحد على الأقل').default(DEFAULT_WORK_DAYS),
  isUnrestricted: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export default function Employees() {
  const { t } = useI18n();
  const token = localStorage.getItem('dhd_admin_token') ?? '';
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [qrEmployee, setQrEmployee] = useState<{ id: number; name: string } | null>(null);
  const [qrData, setQrData] = useState<{ serialNumber: string; qrCodeData: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: number; name: string } | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', search, officeFilter],
    queryFn: () => adminFetch(token, `/employees?${new URLSearchParams({
      ...(search ? { search } : {}),
      ...(officeFilter !== 'all' ? { officeId: officeFilter } : {}),
    })}`),
    enabled: !!token,
  });

  const { data: offices = [] } = useListOffices();

  const createMutation = useMutation({
    mutationFn: (data: any) => adminFetch(token, '/employees', { method: 'POST', body: data }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminFetch(token, `/employees/${id}`, { method: 'PATCH', body: data }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      adminFetch(token, `/employees/${id}`, { method: 'DELETE', body: { reason: reason || null } }),
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: () => adminFetch(token, '/employees/seed-defaults', { method: 'POST' }),
  });

  const form = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      firstName: '', lastName: '', phone: '', email: '', position: 'سائق توصيل',
      baseSalary: 40000, workStartTime: '08:00', workEndTime: '17:00',
      workDays: DEFAULT_WORK_DAYS,
      isUnrestricted: false,
    },
  });

  const onSubmit = (values: z.infer<typeof employeeSchema>) => {
    const data: any = { ...values };
    if (!data.email) data.email = null;
    if (!data.hireDate) delete data.hireDate;
    if (data.paymentDay === undefined || data.paymentDay === null || Number.isNaN(data.paymentDay)) delete data.paymentDay;
    delete data.password;

    if (editingEmployee) {
      updateMutation.mutate(
        { id: editingEmployee.id, data },
        {
          onSuccess: (updated: any) => {
            // Invalidate all caches that could hold this employee's data
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
            queryClient.invalidateQueries({ queryKey: ['employee-detail', updated?.id] });
            queryClient.invalidateQueries({ queryKey: ['advances', updated?.id] });
            queryClient.invalidateQueries({ queryKey: ['bonuses', updated?.id] });
            queryClient.invalidateQueries({ queryKey: ['violations', updated?.id] });
            queryClient.invalidateQueries({ queryKey: ['salaries'] });
            queryClient.invalidateQueries({ queryKey: ['salaries', 'upcoming'] });
            // Invalidate employee app session so profile refreshes on next load
            queryClient.invalidateQueries({ queryKey: ['employee', 'me'] });
            setEditingEmployee(null);
            toast({ title: t('employees.toast.updated') });
          },
          onError: (err: any) => {
            toast({ variant: 'destructive', title: err?.status === 409 ? t('employees.error.email_exists') : String(err?.message ?? '') });
          },
        }
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: (newEmp) => {
          queryClient.invalidateQueries({ queryKey: ['employees'] });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          setIsAddOpen(false);
          form.reset();
          toast({ title: `✅ تم إنشاء الموظف — الرقم التسلسلي: ${newEmp.serialNumber}` });
          // Auto-open QR dialog so admin can immediately download/print
          openQrDialog({ id: newEmp.id, firstName: newEmp.firstName, lastName: newEmp.lastName });
        },
        onError: (err: any) => {
          const msg = err?.status === 409 ? t('employees.error.email_exists') : String(err?.message ?? '');
          toast({ variant: 'destructive', title: msg });
        },
      });
    }
  };

  const handleEdit = async (emp: any) => {
    // Open dialog immediately with list data as a placeholder
    setEditingEmployee(emp);
    setEditLoading(true);
    form.reset({
      officeId: emp.officeId,
      firstName: emp.firstName,
      lastName: emp.lastName,
      phone: emp.phone,
      email: emp.email || '',
      position: emp.position,
      hireDate: emp.hireDate || '',
      baseSalary: emp.baseSalary,
      paymentDay: emp.paymentDay ?? undefined,
      isActive: emp.isActive !== false,
      workStartTime: emp.workStartTime,
      workEndTime: emp.workEndTime,
      workDays: Array.isArray(emp.workDays) && emp.workDays.length > 0 ? emp.workDays : DEFAULT_WORK_DAYS,
      isUnrestricted: emp.isUnrestricted === true,
    });
    try {
      // Fetch complete fresh data from DB (list query omits hireDate/paymentDay)
      const fresh = await adminFetch(token, `/employees/${emp.id}`);
      form.reset({
        officeId: fresh.officeId,
        firstName: fresh.firstName,
        lastName: fresh.lastName,
        phone: fresh.phone,
        email: fresh.email || '',
        position: fresh.position,
        hireDate: fresh.hireDate || '',
        baseSalary: fresh.baseSalary,
        paymentDay: fresh.paymentDay ?? undefined,
        isActive: fresh.isActive !== false,
        workStartTime: fresh.workStartTime,
        workEndTime: fresh.workEndTime,
        workDays: Array.isArray(fresh.workDays) && fresh.workDays.length > 0 ? fresh.workDays : DEFAULT_WORK_DAYS,
        isUnrestricted: fresh.isUnrestricted === true,
      });
    } catch {
      toast({ variant: 'destructive', title: 'تعذّر تحميل بيانات الموظف من الخادم' });
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = (emp: any) => {
    setDeactivateReason('');
    setDeactivateTarget({ id: emp.id, name: `${emp.firstName} ${emp.lastName}` });
  };

  const confirmDeactivate = () => {
    if (!deactivateTarget) return;
    deleteMutation.mutate(
      { id: deactivateTarget.id, reason: deactivateReason },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['employees'] });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          queryClient.invalidateQueries({ queryKey: ['employees-former'] });
          setDeactivateTarget(null);
          setDeactivateReason('');
          toast({ title: t('employees.toast.deleted') });
        },
        onError: () => toast({ variant: 'destructive', title: 'فشل إيقاف الموظف' }),
      }
    );
  };

  const openQrDialog = async (emp: any) => {
    setQrEmployee({ id: emp.id, name: `${emp.firstName} ${emp.lastName}` });
    setQrData(null);
    setQrLoading(true);
    try {
      const data = await adminFetch(token, `/employees/${emp.id}/qrcode`);
      setQrData(data);
    } catch {
      toast({ variant: 'destructive', title: 'فشل تحميل QR Code' });
    } finally {
      setQrLoading(false);
    }
  };

  const regenerateQr = async () => {
    if (!qrEmployee) return;
    setQrLoading(true);
    try {
      const data = await adminFetch(token, `/employees/${qrEmployee.id}/qrcode/regenerate`, { method: 'POST' });
      setQrData(data);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: 'تم توليد QR Code جديد بنجاح' });
    } catch {
      toast({ variant: 'destructive', title: 'فشل توليد QR Code' });
    } finally {
      setQrLoading(false);
    }
  };

  const handleSeedDefaults = () => {
    if (!confirm('هل تريد إنشاء 15 حساب موظف افتراضي؟ سيتم توليد QR Codes وأرقام تسلسلية تلقائياً.')) return;
    seedDefaultsMutation.mutate(undefined, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: ['employees'] });
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        toast({ title: `✅ تم إنشاء ${result.created} موظف افتراضي بنجاح` });
      },
      onError: () => {
        toast({ variant: 'destructive', title: 'فشل إنشاء الموظفين الافتراضيين' });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('nav.employees')}</h1>
          <p className="text-muted-foreground mt-1">{t('employees.subtitle')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleSeedDefaults} disabled={seedDefaultsMutation.isPending} className="shadow-sm">
            <Users className="mr-2 h-4 w-4" />
            {seedDefaultsMutation.isPending ? 'جارٍ الإنشاء...' : 'إنشاء 15 موظف افتراضي'}
          </Button>
          <Button onClick={() => { form.reset(); setIsAddOpen(true); }} className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" /> {t('employees.add')}
          </Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('action.search')}
                className="pl-9 bg-muted/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={officeFilter} onValueChange={setOfficeFilter}>
              <SelectTrigger className="w-full sm:w-[200px] bg-muted/50">
                <SelectValue placeholder={t('employees.all_offices')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('employees.all_offices')}</SelectItem>
                {offices.map(o => (
                  <SelectItem key={o.id} value={o.id.toString()}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('employees.col.name')}</TableHead>
                  <TableHead>الرقم التسلسلي</TableHead>
                  <TableHead>{t('employees.col.position')}</TableHead>
                  <TableHead>{t('employees.col.office')}</TableHead>
                  <TableHead>{t('employees.col.status')}</TableHead>
                  <TableHead className="text-right">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('action.loading')}</TableCell></TableRow>
                ) : employees.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('employees.empty')}</TableCell></TableRow>
                ) : (
                  employees.map((emp: any) => (
                    <TableRow key={emp.id} className="hover:bg-muted/30 transition-colors group">
                      <TableCell className="font-medium">
                        <Link href={`/employees/${emp.id}`} className="hover:text-primary transition-colors flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {emp.firstName[0]}{emp.lastName[0]}
                          </div>
                          {emp.firstName} {emp.lastName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded tracking-wider">
                          {emp.serialNumber ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>{emp.position}</TableCell>
                      <TableCell>{emp.officeName}</TableCell>
                      <TableCell>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${emp.isActive !== false ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {emp.isActive !== false ? t('employees.status.active') : t('employees.status.inactive')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openQrDialog(emp)} className="h-8 w-8" title="عرض QR Code">
                            <QrCode className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(emp)} className="h-8 w-8">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(emp)} className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Link href={`/employees/${emp.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={isAddOpen || !!editingEmployee} onOpenChange={(open) => {
        if (!open) { setIsAddOpen(false); setEditingEmployee(null); }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? t('employees.edit') : t('employees.add')}</DialogTitle>
            {!editingEmployee && (
              <p className="text-sm text-muted-foreground">سيتم توليد الرقم التسلسلي ورمز QR تلقائياً</p>
            )}
          </DialogHeader>
          {editLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                <p className="text-sm">جارٍ تحميل بيانات الموظف…</p>
              </div>
            </div>
          ) : null}
          <div className={editLoading ? 'hidden' : ''}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.first_name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.last_name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.phone')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.email')} <span className="text-muted-foreground text-xs">(اختياري)</span></FormLabel><FormControl><Input {...field} type="email" dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="officeId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('employees.form.office')}</FormLabel>
                    <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString() || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t('employees.form.select_office')} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {offices.map(o => <SelectItem key={o.id} value={o.id.toString()}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="position" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.position')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="baseSalary" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.salary')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="hireDate" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.hire_date')}</FormLabel><FormControl><Input type="date" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="paymentDay" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.payment_day')}</FormLabel><FormControl><Input type="number" min={1} max={31} {...field} value={field.value ?? ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="isActive" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('employees.form.status')}</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v === 'active')} value={field.value === false ? 'suspended' : 'active'}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="active">{t('employees.form.active')}</SelectItem>
                        <SelectItem value="suspended">{t('employees.form.suspended')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="col-span-2">
                  <FormField control={form.control} name="isUnrestricted" render={({ field }) => (
                    <FormItem>
                      <div className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${field.value ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30' : 'border-border bg-muted/30'}`}>
                        <input
                          type="checkbox"
                          id="isUnrestricted"
                          checked={field.value ?? false}
                          onChange={e => field.onChange(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer"
                        />
                        <div>
                          <label htmlFor="isUnrestricted" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                            غير مقيد بالوقت
                          </label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            يُسجَّل وقت الدخول والخروج وساعات العمل دون احتساب تأخير أو خصومات زمنية
                          </p>
                        </div>
                      </div>
                    </FormItem>
                  )} />
                </div>
                <div className="col-span-2">
                  <FormField control={form.control} name="workDays" render={({ field }) => {
                    const selectedDays: string[] = field.value || DEFAULT_WORK_DAYS;
                    const toggleDay = (day: string) => {
                      if (selectedDays.includes(day)) {
                        if (selectedDays.length <= 1) {
                          toast({ title: 'يجب اختيار يوم عمل واحد على الأقل', variant: 'destructive' });
                          return;
                        }
                        field.onChange(selectedDays.filter(d => d !== day));
                      } else {
                        field.onChange([...selectedDays, day]);
                      }
                    };
                    return (
                      <FormItem className="space-y-2 rounded-lg border p-3 bg-muted/20">
                        <FormLabel className="text-sm font-medium flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-primary" />
                          أيام العمل (اختيار متعدد)
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          يُحسب الحضور والغياب والتأخير والخصومات للموظف في هذه الأيام فقط.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {DAYS_OF_WEEK.map((day) => {
                            const isSelected = selectedDays.includes(day);
                            return (
                              <button
                                type="button"
                                key={day}
                                onClick={() => toggleDay(day)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                                  isSelected
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : 'bg-background text-muted-foreground border-border hover:bg-muted/60'
                                }`}
                              >
                                <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-primary-foreground' : 'bg-muted-foreground/30'}`} />
                                {day}
                              </button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="workStartTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        {t('employees.form.start_time')}
                        {form.watch('isUnrestricted') && <span className="text-xs text-muted-foreground font-normal">(مرجعي)</span>}
                      </FormLabel>
                      <FormControl><Input type="time" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="workEndTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        {t('employees.form.end_time')}
                        {form.watch('isUnrestricted') && <span className="text-xs text-muted-foreground font-normal">(مرجعي)</span>}
                      </FormLabel>
                      <FormControl><Input type="time" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => { setIsAddOpen(false); setEditingEmployee(null); }}>{t('action.cancel')}</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{t('action.save')}</Button>
              </DialogFooter>
            </form>
          </Form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivate Employee Dialog */}
      <Dialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) { setDeactivateTarget(null); setDeactivateReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-amber-500" />
              {t('employees.deactivate_title')}
            </DialogTitle>
            <DialogDescription>{t('employees.deactivate_desc')}</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="bg-muted rounded-lg p-3 text-center font-semibold">{deactivateTarget?.name}</div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('employees.deactivate_reason')}</label>
              <Textarea
                placeholder={t('employees.deactivate_reason_placeholder')}
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDeactivateTarget(null); setDeactivateReason(''); }}>{t('action.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={confirmDeactivate}
              disabled={deleteMutation.isPending}
            >
              {t('employees.deactivate_confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!qrEmployee} onOpenChange={(open) => { if (!open) { setQrEmployee(null); setQrData(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>بيانات تسجيل الدخول — {qrEmployee?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {qrLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : qrData ? (
              <>
                <div className="text-center space-y-1">
                  <p className="text-sm text-muted-foreground">الرقم التسلسلي</p>
                  <p className="font-mono text-2xl font-bold tracking-widest text-primary">{qrData.serialNumber}</p>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground">رمز QR</p>
                  <div id="emp-qr-container" className="bg-white p-4 rounded-xl shadow-sm">
                    <QRCode value={qrData.qrCodeData ?? ''} size={180} />
                  </div>
                </div>
                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const svg = document.querySelector('#emp-qr-container svg') as SVGSVGElement;
                      if (!svg || !qrData) return;
                      const svgStr = new XMLSerializer().serializeToString(svg);
                      const canvas = document.createElement('canvas');
                      canvas.width = 220; canvas.height = 220;
                      const ctx = canvas.getContext('2d')!;
                      const img = new Image();
                      img.onload = () => {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, 220, 220);
                        ctx.drawImage(img, 20, 20, 180, 180);
                        const a = document.createElement('a');
                        a.download = `qr-${qrEmployee?.name}-${qrData.serialNumber}.png`;
                        a.href = canvas.toDataURL('image/png');
                        a.click();
                      };
                      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
                    }}
                  >
                    <Download className="h-4 w-4 me-2" />
                    تحميل PNG
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const svg = document.querySelector('#emp-qr-container svg') as SVGSVGElement;
                      if (!svg || !qrData || !qrEmployee) return;
                      const svgStr = new XMLSerializer().serializeToString(svg);
                      const pw = window.open('', '_blank');
                      if (!pw) return;
                      pw.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>QR - ${qrEmployee.name}</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;padding:40px}h2{margin-bottom:8px}p{font-size:22px;font-weight:bold;letter-spacing:6px;margin-bottom:16px}svg{display:block}</style></head><body><h2>${qrEmployee.name}</h2><p>${qrData.serialNumber}</p>${svgStr}<script>setTimeout(()=>{window.print();window.close();},300)<\/script></body></html>`);
                      pw.document.close();
                    }}
                  >
                    <Printer className="h-4 w-4 me-2" />
                    طباعة
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={regenerateQr}
                  disabled={qrLoading}
                >
                  <RefreshCw className="h-4 w-4 me-2" />
                  توليد QR Code جديد
                </Button>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-4">فشل تحميل البيانات</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

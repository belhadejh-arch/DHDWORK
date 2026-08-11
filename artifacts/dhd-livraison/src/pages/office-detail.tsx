import React, { useRef, useState } from 'react';
import { useRoute, Link } from 'wouter';
import {
  useListOffices, useGetOfficeQrCode, useListEmployees, useListAttendance, getGetOfficeQrCodeQueryKey,
  useCreateEmployee, useUpdateEmployee, useDeleteEmployee, getListEmployeesQueryKey,
} from '@workspace/api-client-react';
import QRCode from 'react-qr-code';
import { useI18n } from '@/context/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ArrowLeft, MapPin, Search, Download, Printer, Users, UserCheck, Clock, UserX, Plus, Edit, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';

const employeeSchema = z.object({
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  phone: z.string().min(1, 'Phone required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Min 6 characters').optional().or(z.literal('')),
  position: z.string().min(1, 'Position required'),
  hireDate: z.string().optional().or(z.literal('')),
  baseSalary: z.coerce.number().min(0, 'Must be positive'),
  paymentDay: z.coerce.number().min(1).max(31).optional().or(z.literal('').transform(() => undefined)),
  workStartTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
  workEndTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
  isActive: z.boolean().optional(),
});

type EmployeeForm = z.infer<typeof employeeSchema>;

export default function OfficeDetail() {
  const { t } = useI18n();
  const [, params] = useRoute('/offices/:id');
  const officeId = Number(params?.id);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: offices = [] } = useListOffices();
  const office = offices.find(o => o.id === officeId);
  const [qrRenewing, setQrRenewing] = useState(false);
  const { data: qrData, refetch: refetchQr, isFetching: qrFetching } = useGetOfficeQrCode(officeId, {
    query: { queryKey: getGetOfficeQrCodeQueryKey(officeId), refetchInterval: 300000, enabled: !!officeId }
  });

  const renewQr = async () => {
    setQrRenewing(true);
    try {
      const token = localStorage.getItem('dhd_admin_token') ?? '';
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
      const res = await fetch(`${BASE}/api/offices/${officeId}/qrcode/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('failed');
      await refetchQr();
      toast({ title: 'تم تجديد QR المكتب بنجاح' });
    } catch {
      toast({ variant: 'destructive', title: 'فشل تجديد QR المكتب' });
    } finally {
      setQrRenewing(false);
    }
  };
  const { data: employees = [], isLoading: empLoading } = useListEmployees({
    officeId,
    search: search || undefined,
  });
  const today = new Date().toISOString().slice(0, 10);
  const { data: attendance = [] } = useListAttendance({ date: today }, { query: { refetchInterval: 15000 } } as any);
  const officeAttendance = (attendance as any[]).filter(a => a.officeId === officeId);
  const present = officeAttendance.filter(a => a.checkInTime).length;
  const late = officeAttendance.filter(a => (a.lateMinutes ?? 0) > 0).length;
  const absent = officeAttendance.filter(a => a.isAbsent).length;

  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee();
  const deleteMutation = useDeleteEmployee();

  const form = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      firstName: '', lastName: '', phone: '', email: '', password: '',
      position: 'سائق توصيل', baseSalary: 40000,
      workStartTime: '08:00', workEndTime: '17:00', isActive: true,
    },
  });

  const openAdd = () => {
    setEditingId(null);
    form.reset({
      firstName: '', lastName: '', phone: '', email: '', password: '',
      position: 'سائق توصيل', baseSalary: 40000,
      workStartTime: '08:00', workEndTime: '17:00', isActive: true,
    });
    setIsDialogOpen(true);
  };

  const openEdit = (emp: any) => {
    setEditingId(emp.id);
    form.reset({
      firstName: emp.firstName,
      lastName: emp.lastName,
      phone: emp.phone,
      email: emp.email || '',
      password: '',
      position: emp.position,
      hireDate: emp.hireDate || '',
      baseSalary: emp.baseSalary,
      paymentDay: emp.paymentDay ?? undefined,
      workStartTime: emp.workStartTime,
      workEndTime: emp.workEndTime,
      isActive: emp.isActive !== false,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (emp: any) => {
    if (!confirm(t('employees.delete_confirm'))) return;
    deleteMutation.mutate({ id: emp.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        toast({ title: t('employees.toast.deleted') });
      },
    });
  };

  const onSubmit = (values: EmployeeForm) => {
    const data: any = { ...values, officeId };
    if (!data.password) delete data.password;
    if (!data.hireDate) delete data.hireDate;
    if (data.paymentDay === undefined || data.paymentDay === null || Number.isNaN(data.paymentDay)) delete data.paymentDay;

    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          setIsDialogOpen(false);
          toast({ title: t('employees.toast.updated') });
        },
        onError: (err: any) => {
          const msg = err?.status === 409 ? t('employees.error.email_exists') : String(err?.message ?? '');
          toast({ variant: 'destructive', title: msg });
        },
      });
    } else {
      if (!data.password) {
        form.setError('password', { message: t('employees.form.password') });
        return;
      }
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          setIsDialogOpen(false);
          toast({ title: t('employees.toast.created') });
        },
        onError: (err: any) => {
          const msg = err?.status === 409 ? t('employees.error.email_exists') : String(err?.message ?? '');
          toast({ variant: 'destructive', title: msg });
        },
      });
    }
  };

  const downloadQr = () => {
    const svg = qrWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 800;
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 800, 800);
      ctx.drawImage(img, 40, 40, 720, 720);
      const a = document.createElement('a');
      a.download = `office-${officeId}-qr.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
  };

  const printQr = () => {
    const svg = qrWrapRef.current?.querySelector('svg');
    if (!svg || !office) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${office.name}</title></head><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">
      <h1>${office.name}</h1>${new XMLSerializer().serializeToString(svg)}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  if (!office) return <p className="text-muted-foreground">{t('action.loading')}</p>;

  const stats = [
    { label: t('office.total_employees'), value: employees.length, icon: Users, color: 'text-blue-600' },
    { label: t('office.present_today'), value: present, icon: UserCheck, color: 'text-emerald-600' },
    { label: t('office.late_today'), value: late, icon: Clock, color: 'text-amber-600' },
    { label: t('office.absent_today'), value: absent, icon: UserX, color: 'text-red-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/offices">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5 rtl:rotate-180" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{office.name}</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
            <MapPin className="h-3.5 w-3.5" />
            {(office as any).address || `${office.latitude.toFixed(5)}, ${office.longitude.toFixed(5)}`}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="pt-6 pb-4 flex items-center gap-4">
              <s.icon className={`h-8 w-8 ${s.color} shrink-0`} />
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* QR Code */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t('office.qr_title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div ref={qrWrapRef} className="bg-white p-4 rounded-xl border shadow-sm">
              {qrData ? (
                <QRCode value={qrData.token} size={180} level="H" />
              ) : (
                <div className="h-[180px] w-[180px] bg-muted animate-pulse rounded" />
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">{t('offices.qr_hint')}</p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" size="sm" className="flex-1" onClick={downloadQr}>
                <Download className="h-4 w-4 mr-1" />{t('office.download_qr')}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={printQr}>
                <Printer className="h-4 w-4 mr-1" />{t('office.print_qr')}
              </Button>
            </div>
            <Button
              variant="default"
              size="sm"
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              onClick={renewQr}
              disabled={qrRenewing || qrFetching}
            >
              {qrRenewing ? t('offices.qr_refreshing') : t('offices.qr_renew')}
            </Button>
          </CardContent>
        </Card>

        {/* Employees */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t('office.employees')}</CardTitle>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" />{t('employees.add')}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:left-auto rtl:right-3" />
              <Input
                placeholder={t('action.search')}
                className="pl-9 rtl:pl-3 rtl:pr-9 bg-muted/50"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>{t('employees.col.name')}</TableHead>
                    <TableHead>{t('employees.col.position')}</TableHead>
                    <TableHead>{t('employees.col.phone')}</TableHead>
                    <TableHead>{t('employees.col.status')}</TableHead>
                    <TableHead className="text-center w-20">{t('action.edit')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">{t('action.loading')}</TableCell></TableRow>
                  ) : employees.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">{t('employees.empty')}</TableCell></TableRow>
                  ) : employees.map((emp: any) => (
                    <TableRow key={emp.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">
                        <Link href={`/employees/${emp.id}`} className="hover:text-primary">
                          {emp.firstName} {emp.lastName}
                        </Link>
                      </TableCell>
                      <TableCell>{emp.position}</TableCell>
                      <TableCell dir="ltr">{emp.phone}</TableCell>
                      <TableCell>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${emp.isActive !== false ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {emp.isActive !== false ? t('employees.status.active') : t('employees.status.inactive')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(emp)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(emp)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={open => { if (!open) { setIsDialogOpen(false); setEditingId(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t('employees.edit') : t('employees.add')}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.first_name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.last_name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('employees.form.email')} *</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('employees.form.password')} {!editingId && '*'}
                  </FormLabel>
                  <FormControl><Input type="password" placeholder={editingId ? t('employees.form.password_hint') : ''} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>{t('employees.form.phone')}</FormLabel><FormControl><Input dir="ltr" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="position" render={({ field }) => (
                <FormItem><FormLabel>{t('employees.form.position')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="baseSalary" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.salary')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="paymentDay" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.payment_day')}</FormLabel><FormControl><Input type="number" min={1} max={31} {...field} value={field.value ?? ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <FormField control={form.control} name="hireDate" render={({ field }) => (
                <FormItem><FormLabel>{t('employees.form.hire_date')}</FormLabel><FormControl><Input type="date" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('employees.form.status')}</FormLabel>
                  <Select onValueChange={v => field.onChange(v === 'active')} value={field.value === false ? 'suspended' : 'active'}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="active">{t('employees.form.active')}</SelectItem>
                      <SelectItem value="suspended">{t('employees.form.suspended')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="workStartTime" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.start_time')}</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="workEndTime" render={({ field }) => (
                  <FormItem><FormLabel>{t('employees.form.end_time')}</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditingId(null); }}>
                  {t('action.cancel')}
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {t('action.save')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

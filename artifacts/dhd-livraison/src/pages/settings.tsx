import React, { useEffect, useRef, useState } from 'react';
import { useGetSettings, useUpdateSettings, useChangePassword, useChangeEmail, getGetMeQueryKey, getGetSettingsQueryKey } from '@workspace/api-client-react';
import { useI18n } from '@/context/i18n';
import { useAuth } from '@/context/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Mail, Hash, ShieldCheck, UserCog, Plus, Edit, Trash2, QrCode, RefreshCw, Download, Printer, Phone, KeyRound } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

const settingsSchema = z.object({
  lateDeductionAmount: z.coerce.number().min(0),
  first15MinLateDeduction: z.coerce.number().min(0),
  hourlyLateDeduction: z.coerce.number().min(0),
  absenceDeductionAmount: z.coerce.number().min(0),
  overtimeHourlyRate: z.coerce.number().min(0),
  paymentDayOfMonth: z.coerce.number().min(1).max(31),
  lateThresholdMinutes: z.coerce.number().min(0),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
  newPassword: z.string().min(6, 'يجب أن تكون 6 أحرف على الأقل'),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
});

const emailSchema = z.object({
  newEmail: z.string().min(1, 'البريد الإلكتروني مطلوب').email('بريد إلكتروني غير صالح'),
  currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
});

const adminFormSchema = z.object({
  firstName: z.string().min(1, 'الاسم مطلوب'),
  lastName: z.string().min(1, 'اللقب مطلوب'),
  email: z.string().email('بريد إلكتروني غير صالح'),
  phone: z.string().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'يجب أن تكون 6 أحرف على الأقل'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
});

export default function Settings() {
  const { t, language, setLanguage } = useI18n();
  const { admin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem('dhd_admin_token') ?? '';

  const adminAny = admin as any;
  const isPrimary = adminAny?.isPrimary === true;

  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const changePassword = useChangePassword();
  const changeEmail = useChangeEmail();

  // ── Admin management state ────────────────────────────────────────────────
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [qrAdmin, setQrAdmin] = useState<any | null>(null);
  const [qrData, setQrData] = useState<{ serialNumber: string; qrCodeData: string; firstName: string; lastName: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  // Reset password (primary admin → other admin)
  const [resetPwTarget, setResetPwTarget] = useState<any | null>(null);

  // ── Fetch admins list ─────────────────────────────────────────────────────
  const { data: admins = [], refetch: refetchAdmins } = useQuery({
    queryKey: ['admins'],
    queryFn: () => adminFetch(token, '/admins'),
    enabled: isPrimary && !!token,
  });

  const createAdminMutation = useMutation({
    mutationFn: (data: any) => adminFetch(token, '/admins', { method: 'POST', body: data }),
  });
  const updateAdminMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminFetch(token, `/admins/${id}`, { method: 'PATCH', body: data }),
  });
  const deleteAdminMutation = useMutation({
    mutationFn: (id: number) => adminFetch(token, `/admins/${id}`, { method: 'DELETE' }),
  });
  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) =>
      adminFetch(token, `/admins/${id}/password`, { method: 'PATCH', body: { newPassword } }),
  });

  // ── Admin form ────────────────────────────────────────────────────────────
  const adminForm = useForm<z.infer<typeof adminFormSchema>>({
    resolver: zodResolver(adminFormSchema),
    defaultValues: { firstName: '', lastName: '', email: '', phone: '' },
  });

  const resetPwForm = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const openResetPw = (adm: any) => {
    setResetPwTarget(adm);
    resetPwForm.reset({ newPassword: '', confirmPassword: '' });
  };

  const onResetPwSubmit = (values: z.infer<typeof resetPasswordSchema>) => {
    if (!resetPwTarget) return;
    resetPasswordMutation.mutate(
      { id: resetPwTarget.id, newPassword: values.newPassword },
      {
        onSuccess: () => {
          setResetPwTarget(null);
          resetPwForm.reset();
          toast({ title: `✅ تم تغيير كلمة السر لـ ${resetPwTarget.firstName} ${resetPwTarget.lastName} بنجاح` });
        },
        onError: (err: any) => {
          toast({ variant: 'destructive', title: err?.message ?? 'فشل تغيير كلمة السر' });
        },
      }
    );
  };

  const openAddAdmin = () => {
    setEditingAdmin(null);
    adminForm.reset({ firstName: '', lastName: '', email: '', phone: '' });
    setAdminDialogOpen(true);
  };

  const openEditAdmin = (adm: any) => {
    setEditingAdmin(adm);
    adminForm.reset({
      firstName: adm.firstName,
      lastName: adm.lastName,
      email: adm.email,
      phone: adm.phone ?? '',
    });
    setAdminDialogOpen(true);
  };

  const onAdminSubmit = (values: z.infer<typeof adminFormSchema>) => {
    const payload = { ...values, phone: values.phone || null };
    if (editingAdmin) {
      updateAdminMutation.mutate(
        { id: editingAdmin.id, data: payload },
        {
          onSuccess: () => {
            refetchAdmins();
            setAdminDialogOpen(false);
            toast({ title: 'تم تحديث بيانات الأدمن' });
          },
          onError: (err: any) => {
            toast({ variant: 'destructive', title: err?.status === 409 ? 'البريد الإلكتروني مستخدم مسبقاً' : 'فشل التحديث' });
          },
        }
      );
    } else {
      createAdminMutation.mutate(payload, {
        onSuccess: () => {
          refetchAdmins();
          setAdminDialogOpen(false);
          toast({ title: 'تم إنشاء الأدمن بنجاح — كلمة المرور الافتراضية: DHD@Admin2024' });
        },
        onError: (err: any) => {
          toast({ variant: 'destructive', title: err?.status === 409 ? 'البريد الإلكتروني مستخدم مسبقاً' : 'فشل الإنشاء' });
        },
      });
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteAdminMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        refetchAdmins();
        setDeleteTarget(null);
        toast({ title: 'تم حذف الأدمن' });
      },
      onError: () => toast({ variant: 'destructive', title: 'فشل الحذف' }),
    });
  };

  const openQrDialog = async (adm: any) => {
    setQrAdmin(adm);
    setQrData(null);
    setQrLoading(true);
    try {
      const data = await adminFetch(token, `/admins/${adm.id}/qrcode`);
      setQrData(data);
    } catch {
      toast({ variant: 'destructive', title: 'فشل تحميل QR Code' });
    } finally {
      setQrLoading(false);
    }
  };

  const regenerateAdminQr = async () => {
    if (!qrAdmin) return;
    setQrLoading(true);
    try {
      const data = await adminFetch(token, `/admins/${qrAdmin.id}/qrcode/regenerate`, { method: 'POST' });
      setQrData(data);
      refetchAdmins();
      toast({ title: 'تم توليد QR Code جديد بنجاح' });
    } catch {
      toast({ variant: 'destructive', title: 'فشل توليد QR Code' });
    } finally {
      setQrLoading(false);
    }
  };

  // ── Settings forms ────────────────────────────────────────────────────────
  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
  });

  const pwForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
  });

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { newEmail: '', currentPassword: '' }
  });

  const initRef = useRef(false);
  useEffect(() => {
    if (settings && !initRef.current) {
      form.reset({
        lateDeductionAmount: settings.lateDeductionAmount,
        first15MinLateDeduction: (settings as any).first15MinLateDeduction ?? 200,
        hourlyLateDeduction: (settings as any).hourlyLateDeduction ?? 100,
        absenceDeductionAmount: (settings as any).absenceDeductionAmount ?? 1000,
        overtimeHourlyRate: settings.overtimeHourlyRate,
        paymentDayOfMonth: settings.paymentDayOfMonth,
        lateThresholdMinutes: settings.lateThresholdMinutes || 15,
      });
      initRef.current = true;
    }
  }, [settings, form]);

  const onSettingsSubmit = (values: z.infer<typeof settingsSchema>) => {
    updateSettings.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: t('settings.toast.saved') });
      }
    });
  };

  const onPasswordSubmit = (values: z.infer<typeof passwordSchema>) => {
    changePassword.mutate(
      { data: { currentPassword: values.currentPassword, newPassword: values.newPassword } },
      {
        onSuccess: () => {
          pwForm.reset();
          toast({ title: t('settings.toast.password_changed') });
        },
        onError: () => {
          toast({ variant: 'destructive', title: t('settings.toast.password_failed') });
        },
      }
    );
  };

  const onEmailSubmit = (values: z.infer<typeof emailSchema>) => {
    changeEmail.mutate(
      { data: { currentPassword: values.currentPassword, newEmail: values.newEmail } },
      {
        onSuccess: (data) => {
          emailForm.reset();
          toast({ title: t('settings.toast.email_changed') });
          if (admin && data?.email) {
            const updatedAdmin = { ...admin, email: data.email } as typeof admin;
            queryClient.setQueryData(getGetMeQueryKey(), updatedAdmin);
          }
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: () => {
          toast({ variant: 'destructive', title: t('settings.toast.email_failed') });
        },
      }
    );
  };

  if (isLoading) return <div>{t('action.loading')}</div>;

  const displayName = adminAny
    ? `${adminAny.firstName || ''} ${adminAny.lastName || ''}`.trim() || adminAny.username
    : '';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.settings')}</h1>
        <p className="text-muted-foreground mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* ── Account Information ─────────────────────────────────────────────── */}
      <Card className="shadow-sm border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>{t('settings.account.title')}</CardTitle>
          </div>
          <CardDescription>{t('settings.account.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/40 border border-border">
            {displayName && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                  المشرف
                </p>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{displayName}</p>
                  {isPrimary && (
                    <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                      أدمن أساسي
                    </span>
                  )}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {t('settings.account.current_email')}
              </p>
              <p className="font-mono text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground">
                {adminAny?.email || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" />
                {t('settings.account.serial')}
              </p>
              <p className="font-mono text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground tracking-widest">
                {adminAny?.serialNumber || '—'}
              </p>
            </div>
          </div>

          <Form {...emailForm}>
            <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4 max-w-md">
              <div className="text-sm font-semibold text-foreground border-b border-border pb-2 mb-3">
                تغيير البريد الإلكتروني
              </div>
              <FormField
                control={emailForm.control}
                name="newEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.account.new_email')}</FormLabel>
                    <FormControl>
                      <Input type="email" dir="ltr" placeholder={t('settings.account.email_placeholder')} {...field} className="h-10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={emailForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.account.current_password')}</FormLabel>
                    <FormControl>
                      <Input type="password" dir="ltr" placeholder="••••••••" {...field} className="h-10" autoComplete="current-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end pt-1">
                <Button type="submit" disabled={changeEmail.isPending} className="min-w-32">
                  {changeEmail.isPending ? t('action.loading') : t('settings.account.button')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* ── Admin Management (primary admin only) ───────────────────────────── */}
      {isPrimary && (
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>إدارة الأدمن</CardTitle>
                  <CardDescription className="mt-1">إضافة وتعديل وحذف حسابات الأدمن</CardDescription>
                </div>
              </div>
              <Button onClick={openAddAdmin} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                إضافة أدمن
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">الاسم</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">البريد الإلكتروني</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">الهاتف</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">الرقم التسلسلي</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(admins as any[]).map((adm: any) => (
                    <tr key={adm.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {adm.firstName} {adm.lastName}
                          {adm.isPrimary && (
                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-normal">
                              أساسي
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell font-mono text-xs">{adm.email}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{adm.phone || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded tracking-wider">
                          {adm.serialNumber ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="QR Code" onClick={() => openQrDialog(adm)}>
                            <QrCode className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" title="تغيير كلمة السر" onClick={() => openResetPw(adm)}>
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditAdmin(adm)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          {!adm.isPrimary && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(adm)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(admins as any[]).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">لا يوجد أدمن</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Language ────────────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t('settings.language.title')}</CardTitle>
          <CardDescription>{t('settings.language.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {(['ar', 'fr', 'en'] as const).map((lang) => (
              <Button
                key={lang}
                variant={language === lang ? 'default' : 'outline'}
                className={cn('w-24', language === lang && 'shadow-md')}
                onClick={() => setLanguage(lang)}
              >
                {lang === 'ar' ? 'العربية' : lang === 'fr' ? 'Français' : 'English'}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Payroll & Rules ──────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t('settings.payroll.title')}</CardTitle>
          <CardDescription>{t('settings.payroll.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSettingsSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="first15MinLateDeduction" render={({ field }) => (
                  <FormItem>
                    <FormLabel>خصم أول 15 دقيقة تأخير (د.ج)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>المبلغ المخصوم تلقائياً عند التأخير لأول 15 دقيقة (الافتراضي 200 د.ج)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="hourlyLateDeduction" render={({ field }) => (
                  <FormItem>
                    <FormLabel>خصم التأخير لكل ساعة إضافية (د.ج)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>المبلغ المخصوم لكل ساعة تأخير إضافية بعد الـ 15 دقيقة الأولى (الافتراضي 100 د.ج)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="absenceDeductionAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>خصم غياب يوم كامل (د.ج)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>المبلغ المخصوم تلقائياً عند غياب الموظف طوال اليوم (الافتراضي 1000 د.ج)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lateThresholdMinutes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.payroll.late_threshold')}</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>{t('settings.payroll.late_threshold_hint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="overtimeHourlyRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.payroll.overtime_rate')}</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>{t('settings.payroll.overtime_rate_hint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="paymentDayOfMonth" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.payroll.payment_day')}</FormLabel>
                    <FormControl><Input type="number" min={1} max={31} {...field} /></FormControl>
                    <FormDescription>{t('settings.payroll.payment_day_hint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={updateSettings.isPending}>{t('action.save')}</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* ── Change Password ──────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t('settings.password.title')}</CardTitle>
          <CardDescription>{t('settings.password.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...pwForm}>
            <form onSubmit={pwForm.handleSubmit(onPasswordSubmit)} className="space-y-4 max-w-md">
              <FormField control={pwForm.control} name="currentPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.password.current')}</FormLabel>
                  <FormControl>
                    <Input type="password" dir="ltr" placeholder="••••••••" {...field} autoComplete="current-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={pwForm.control} name="newPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.password.new')}</FormLabel>
                  <FormControl>
                    <Input type="password" dir="ltr" placeholder="••••••••" {...field} autoComplete="new-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={pwForm.control} name="confirmPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.password.confirm')}</FormLabel>
                  <FormControl>
                    <Input type="password" dir="ltr" placeholder="••••••••" {...field} autoComplete="new-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={changePassword.isPending} className="min-w-32">
                  {changePassword.isPending ? t('action.loading') : t('settings.password.button')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* ── Add/Edit Admin Dialog ────────────────────────────────────────────── */}
      <Dialog open={adminDialogOpen} onOpenChange={(open) => { if (!open) setAdminDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAdmin ? 'تعديل بيانات الأدمن' : 'إضافة أدمن جديد'}</DialogTitle>
          </DialogHeader>
          {!editingAdmin && (
            <p className="text-sm text-muted-foreground -mt-2">سيتم توليد رقم تسلسلي ورمز QR تلقائياً. كلمة المرور الافتراضية: <span className="font-mono font-bold">DHD@Admin2024</span></p>
          )}
          <Form {...adminForm}>
            <form onSubmit={adminForm.handleSubmit(onAdminSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={adminForm.control} name="firstName" render={({ field }) => (
                  <FormItem><FormLabel>الاسم</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={adminForm.control} name="lastName" render={({ field }) => (
                  <FormItem><FormLabel>اللقب</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={adminForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>البريد الإلكتروني</FormLabel>
                  <FormControl><Input type="email" dir="ltr" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={adminForm.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم الهاتف <span className="text-muted-foreground text-xs">(اختياري)</span></FormLabel>
                  <FormControl><Input type="tel" dir="ltr" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setAdminDialogOpen(false)}>{t('action.cancel')}</Button>
                <Button type="submit" disabled={createAdminMutation.isPending || updateAdminMutation.isPending}>
                  {t('action.save')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Admin Confirmation ─────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              حذف الأدمن
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل تريد حذف الأدمن <span className="font-semibold text-foreground">{deleteTarget?.firstName} {deleteTarget?.lastName}</span>؟ لا يمكن التراجع عن هذه العملية.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('action.cancel')}</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteAdminMutation.isPending}>
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset Admin Password Dialog (primary admin only) ─────────────────── */}
      <Dialog open={!!resetPwTarget} onOpenChange={(open) => { if (!open) { setResetPwTarget(null); resetPwForm.reset(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-600" />
              تغيير كلمة السر
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            تغيير كلمة السر لـ <span className="font-semibold text-foreground">{resetPwTarget?.firstName} {resetPwTarget?.lastName}</span>
          </p>
          <Form {...resetPwForm}>
            <form onSubmit={resetPwForm.handleSubmit(onResetPwSubmit)} className="space-y-4 pt-1">
              <FormField control={resetPwForm.control} name="newPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>كلمة السر الجديدة</FormLabel>
                  <FormControl>
                    <Input type="password" dir="ltr" placeholder="••••••••" autoComplete="new-password" {...field} className="h-10" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={resetPwForm.control} name="confirmPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>تأكيد كلمة السر</FormLabel>
                  <FormControl>
                    <Input type="password" dir="ltr" placeholder="••••••••" autoComplete="new-password" {...field} className="h-10" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="pt-2 gap-2">
                <Button type="button" variant="outline" onClick={() => { setResetPwTarget(null); resetPwForm.reset(); }}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={resetPasswordMutation.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {resetPasswordMutation.isPending ? 'جارٍ الحفظ…' : 'تغيير كلمة السر'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Admin QR Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={!!qrAdmin} onOpenChange={(open) => { if (!open) { setQrAdmin(null); setQrData(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>بيانات تسجيل الدخول — {qrAdmin?.firstName} {qrAdmin?.lastName}</DialogTitle>
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
                  <div id="admin-qr-container" className="bg-white p-4 rounded-xl shadow-sm">
                    <QRCode value={qrData.qrCodeData ?? ''} size={180} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const svg = document.querySelector('#admin-qr-container svg') as SVGSVGElement;
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
                        a.download = `qr-${qrAdmin?.firstName}-${qrAdmin?.lastName}-${qrData.serialNumber}.png`;
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
                      const svg = document.querySelector('#admin-qr-container svg') as SVGSVGElement;
                      if (!svg || !qrData || !qrAdmin) return;
                      const svgStr = new XMLSerializer().serializeToString(svg);
                      const pw = window.open('', '_blank');
                      if (!pw) return;
                      const name = `${qrAdmin.firstName} ${qrAdmin.lastName}`;
                      pw.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>QR - ${name}</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;padding:40px}h2{margin-bottom:8px}p{font-size:22px;font-weight:bold;letter-spacing:6px;margin-bottom:16px}svg{display:block}</style></head><body><h2>${name}</h2><p>${qrData.serialNumber}</p>${svgStr}<script>setTimeout(()=>{window.print();window.close();},300)<\/script></body></html>`);
                      pw.document.close();
                    }}
                  >
                    <Printer className="h-4 w-4 me-2" />
                    طباعة
                  </Button>
                </div>
                <Button variant="outline" className="w-full" onClick={regenerateAdminQr} disabled={qrLoading}>
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

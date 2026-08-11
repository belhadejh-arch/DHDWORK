import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { setEmployeeToken } from '@/employee/api';
import { useQrCamera, QrCameraStatus } from '@/employee/components/useQrCamera';
import logoPath from '@assets/1000034141-removebg-preview_1785699198526.png';
import { API_BASE } from '@/lib/api-base';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Smartphone, QrCode } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'البريد الإلكتروني مطلوب').email('بريد إلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

type LoginMode = 'email' | 'serial' | 'qr';

export default function Login() {
  const { t } = useI18n();
  const { login: authLogin, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [mode, setMode] = useState<LoginMode>('email');
  const [serialInput, setSerialInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // QR camera state
  const [qrActive, setQrActive] = useState(false);
  const [camStatus, setCamStatus] = useState<QrCameraStatus>('idle');
  const [camError, setCamError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  React.useEffect(() => {
    if (isAuthenticated) setLocation('/offices');
  }, [isAuthenticated, setLocation]);

  // Stop camera when leaving QR mode
  React.useEffect(() => {
    if (mode !== 'qr') setQrActive(false);
  }, [mode]);

  function handleAuthResponse(data: any) {
    if (data.userType === 'employee') {
      setEmployeeToken(data.token);
      setLocation('/portal');
    } else {
      authLogin(data.admin, data.token);
    }
  }

  const handleQrScan = async (qrCodeData: string) => {
    // Camera already stopped by useQrCamera before calling onScan
    setBusy(true);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${API_BASE}/auth/login/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCodeData }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: res.status === 403 ? 'الحساب موقوف أو غير نشط' : 'رمز QR غير صالح أو منتهي الصلاحية',
        });
        setQrActive(false);
        setTimeout(() => setQrActive(true), 400);
        return;
      }
      setQrActive(false);
      handleAuthResponse(data);
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === 'AbortError';
      toast({
        variant: 'destructive',
        title: isTimeout ? 'انتهت مهلة الاتصال، حاول مجدداً' : 'فشل الاتصال بالخادم، حاول مجدداً',
      });
      setQrActive(false);
      setTimeout(() => setQrActive(true), 400);
    } finally {
      clearTimeout(tid);
      setBusy(false);
    }
  };

  const { stopCamera } = useQrCamera({
    videoRef,
    canvasRef,
    active: qrActive,
    onScan: handleQrScan,
    onError: (msg) => { setCamError(msg); },
    onStatus: (s) => { setCamStatus(s); },
  });

  const openCamera = () => {
    setCamError('');
    setCamStatus('starting');
    setQrActive(true);
  };

  const closeCamera = () => {
    stopCamera();
    setQrActive(false);
    setCamStatus('idle');
    setCamError('');
  };

  const switchMode = (m: LoginMode) => {
    closeCamera();
    setMode(m);
  };

  const onEmailSubmit = async (values: z.infer<typeof loginSchema>) => {
    setBusy(true);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15_000);
    let res: Response | undefined;
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(tid);
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      toast({ variant: 'destructive', title: isTimeout ? 'انتهت مهلة الاتصال، حاول مجدداً' : 'فشل الاتصال بالخادم' });
      setBusy(false);
      return;
    }
    clearTimeout(tid);

    let data: any;
    try {
      data = await res.json();
    } catch {
      toast({ variant: 'destructive', title: `خطأ في الاستجابة (${res.status})` });
      setBusy(false);
      return;
    }

    if (!res.ok) {
      toast({ variant: 'destructive', title: data?.error || 'بيانات الدخول غير صحيحة' });
      setBusy(false);
      return;
    }

    try {
      handleAuthResponse(data);
    } catch (err) {
      toast({ variant: 'destructive', title: `خطأ داخلي: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  };

  const onSerialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialInput.trim()) return;
    setBusy(true);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${API_BASE}/auth/login/serial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber: serialInput.trim() }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'destructive', title: res.status === 403 ? 'الحساب موقوف' : 'الرقم التسلسلي غير صحيح' });
        return;
      }
      handleAuthResponse(data);
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === 'AbortError';
      toast({ variant: 'destructive', title: isTimeout ? 'انتهت مهلة الاتصال، حاول مجدداً' : 'حدث خطأ، حاول مجدداً' });
    } finally {
      clearTimeout(tid);
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="relative min-h-[100dvh] overflow-hidden bg-background px-4 py-6 sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute -left-28 -top-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="relative mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-6xl overflow-hidden rounded-[30px] border border-border/80 bg-card shadow-[0_26px_80px_rgba(28,48,82,.12)] lg:grid-cols-[.92fr_1.08fr]">
        <section className="relative hidden overflow-hidden bg-[hsl(220_43%_14%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -end-24 -top-24 h-72 w-72 rounded-full border-[36px] border-primary/15" />
          <div className="absolute -bottom-36 -start-28 h-96 w-96 rounded-full border-[44px] border-sky-400/10" />
          <div className="relative">
            <div className="mb-12 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
                <img src={logoPath} alt="DHD Livraison" className="h-9 w-9 object-contain brightness-0 invert" />
              </div>
              <div>
                <p className="text-base font-bold tracking-tight">DHD Livraison</p>
                <p className="text-[11px] text-white/55">إدارة الموارد البشرية</p>
              </div>
            </div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary/90">مساحة الإدارة</p>
            <h1 className="max-w-sm text-4xl font-bold leading-[1.18] tracking-tight">كل فريقك،<br /><span className="text-primary">في وضوح.</span></h1>
            <p className="mt-6 max-w-sm text-sm leading-7 text-white/65">تابع الحضور، الرواتب والطلبات من لوحة واحدة مصممة لسرعة القرار.</p>
          </div>
          <div className="relative grid grid-cols-3 gap-3">
            {[
              ['01', 'الحضور'],
              ['02', 'الرواتب'],
              ['03', 'الفريق'],
            ].map(([number, label]) => (
              <div key={number} className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                <p className="text-xs font-bold text-primary">{number}</p>
                <p className="mt-2 text-xs text-white/65">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-10 lg:p-14">
          <div className="w-full max-w-md space-y-7">
            <div className="flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/20">
                  <img src={logoPath} alt="DHD Livraison" className="h-7 w-7 object-contain brightness-0 invert" />
                </div>
                <div className="leading-tight"><p className="text-sm font-bold">DHD Livraison</p><p className="text-[10px] text-muted-foreground">إدارة الموارد البشرية</p></div>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary">ADMIN</span>
            </div>
            <div>
              <div className="mb-4 hidden h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary lg:flex"><ShieldCheck className="h-6 w-6" /></div>
              <p className="text-sm font-semibold text-primary">مرحباً بعودتك</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">تسجيل الدخول</h2>
              <p className="mt-2 text-sm text-muted-foreground">أدخل بياناتك للوصول إلى لوحة الإدارة.</p>
            </div>

            <div className="rounded-2xl bg-muted/65 p-1">
              <div className="grid grid-cols-3 gap-1">
                {/* Login modes remain unchanged; only their presentation is refreshed. */}
                {(['email', 'serial', 'qr'] as LoginMode[]).map((m) => {
                  const labels: Record<LoginMode, string> = { email: 'البريد', serial: 'التسلسلي', qr: 'رمز QR' };
                  const ModeIcon = m === 'email' ? Mail : m === 'serial' ? Smartphone : QrCode;
                  return (
                    <button key={m} type="button" onClick={() => switchMode(m)} className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition-all ${mode === m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      <ModeIcon className="h-3.5 w-3.5" />{labels[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-5">

            {mode === 'email' && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onEmailSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold text-foreground">البريد الإلكتروني</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            {...field}
                            className="h-12 rounded-xl border-border/80 bg-background/80 ps-4"
                            autoFocus
                            autoComplete="email"
                            dir="ltr"
                            placeholder="admin@dhd.dz"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold text-foreground">كلمة المرور</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input type={showPassword ? 'text' : 'password'} placeholder="••••••••" {...field} className="h-12 rounded-xl border-border/80 bg-background/80 pe-11 ps-11" autoComplete="current-password" dir="ltr" />
                            <LockKeyhole className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <button type="button" className="text-xs font-semibold text-primary transition-colors hover:text-primary/75">نسيت كلمة المرور؟</button>
                    <span className="text-[11px] text-muted-foreground">دخول آمن ومشفّر</span>
                  </div>
                  <Button type="submit" className="mt-2 h-12 w-full rounded-xl font-semibold shadow-lg shadow-primary/20" disabled={busy}>
                    {busy ? 'جارٍ التحقق...' : 'تسجيل الدخول'}
                    {!busy && <ArrowLeft className="ms-2 h-4 w-4" />}
                  </Button>
                  <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> مخصص للمدير فقط</p>
                </form>
              </Form>
            )}

            {/* ── Serial Number ── */}
            {mode === 'serial' && (
              <form onSubmit={onSerialSubmit} className="space-y-4">
                <div className="space-y-2">
                   <label className="text-xs font-semibold">الرقم التسلسلي</label>
                  <Input
                    type="text"
                    placeholder="EMP-XXXXXX"
                    value={serialInput}
                    onChange={e => setSerialInput(e.target.value.toUpperCase())}
                     className="h-12 rounded-xl text-center font-mono tracking-widest text-base"
                    autoFocus
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    أدخل الرقم التسلسلي الخاص بحسابك
                  </p>
                </div>
                <Button type="submit" className="h-12 w-full rounded-xl font-semibold" disabled={busy || !serialInput.trim()}>
                  {busy ? 'جارٍ التحقق...' : 'تسجيل الدخول'}
                </Button>
              </form>
            )}

            {/* ── QR Scanner ── */}
            {mode === 'qr' && (
              <div className="space-y-4">
                {/* Video + canvas always mounted in QR mode for stable refs */}
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className={`w-full rounded-xl object-cover ${qrActive && camStatus === 'scanning' ? 'block' : 'hidden'}`}
                  style={{ maxHeight: '300px' }}
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Idle */}
                {!qrActive && (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center">
                      <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M3 9V6a1 1 0 011-1h3M3 15v3a1 1 0 001 1h3m11-4v3a1 1 0 01-1 1h-3m4-11h-3a1 1 0 01-1-1V5M7 7h4v4H7V7zm6 6h4v4h-4v-4zm0-6h.01M13 17h.01" />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground text-center leading-relaxed">
                      امسح رمز QR الخاص بحسابك<br />لتسجيل الدخول تلقائياً
                    </p>
                    <Button onClick={openCamera} className="w-full h-11" disabled={busy}>
                      فتح الكاميرا
                    </Button>
                  </div>
                )}

                {/* Starting */}
                {qrActive && camStatus === 'starting' && (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                    <p className="text-sm text-muted-foreground">جارٍ تشغيل الكاميرا…</p>
                  </div>
                )}

                {/* Scanning */}
                {qrActive && camStatus === 'scanning' && (
                  <>
                    <p className="text-sm text-center text-muted-foreground">
                      {busy ? 'جارٍ التحقق من الرمز...' : 'وجّه الكاميرا نحو رمز QR'}
                    </p>
                    <Button variant="outline" className="w-full h-11" onClick={closeCamera} disabled={busy}>
                      إلغاء
                    </Button>
                  </>
                )}

                {/* Error */}
                {qrActive && camStatus === 'error' && (
                  <div className="space-y-3">
                    <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
                      <p className="text-destructive text-sm leading-relaxed text-center">{camError}</p>
                    </div>
                    <Button variant="outline" className="w-full" onClick={openCamera}>
                      إعادة المحاولة
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={closeCamera}>
                      إلغاء
                    </Button>
                  </div>
                )}
              </div>
            )}

            </div>
            <p className="border-t border-border/70 pt-5 text-center text-[11px] text-muted-foreground">DHD Livraison <span className="mx-1 text-border">•</span> {new Date().getFullYear()}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

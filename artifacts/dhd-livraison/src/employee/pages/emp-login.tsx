import React, { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useI18n } from '@/context/i18n';
import { useEmployeeAuth } from '../auth';
import { setEmployeeToken } from '../api';
import { useAuth } from '@/context/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQrCamera, QrCameraStatus } from '../components/useQrCamera';
import logoPath from '@assets/1000034141-removebg-preview_1785699198526.png';
import { API_BASE } from '@/lib/api-base';

type LoginMode = 'serial' | 'qr';

export default function EmpLogin() {
  const { t } = useI18n();
  const { login, isAuthenticated } = useEmployeeAuth();
  const { login: adminLogin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [mode, setMode] = useState<LoginMode>('serial');
  const [serialInput, setSerialInput] = useState('');
  const [busy, setBusy] = useState(false);

  // QR camera state
  const [qrActive, setQrActive] = useState(false);
  const [camStatus, setCamStatus] = useState<QrCameraStatus>('idle');
  const [camError, setCamError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) setLocation('/portal');
  }, [isAuthenticated, setLocation]);

  // Stop camera when leaving QR mode or unmounting
  React.useEffect(() => {
    if (mode !== 'qr') setQrActive(false);
  }, [mode]);

  const handleAuthResponse = (data: any) => {
    if (data.userType === 'admin') {
      adminLogin(data.admin, data.token);
    } else {
      // Only cache + enable; navigation fires via the isAuthenticated useEffect
      // to avoid a double-navigate race where setLocation runs before the auth
      // state has propagated to EmployeeProtected.
      login(data.employee, data.token);
    }
  };

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
        // Re-enable scanner on failure
        setQrActive(false);
        setTimeout(() => setQrActive(true), 400);
        return;
      }
      // Success: navigate away
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
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex justify-center">
          <img src={logoPath} alt="DHD Livraison" className="h-20 object-contain" />
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">

          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-border">
            {(['serial', 'qr'] as LoginMode[]).map((m) => {
              const labels: Record<LoginMode, string> = { serial: 'الرقم التسلسلي', qr: 'رمز QR' };
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`py-3 text-sm font-medium transition-colors border-b-2 ${
                    mode === m
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {/* ── Serial login ── */}
            {mode === 'serial' && (
              <form onSubmit={onSerialSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">الرقم التسلسلي</label>
                  <Input
                    type="text"
                    placeholder="EMP-XXXXXX"
                    value={serialInput}
                    onChange={e => setSerialInput(e.target.value.toUpperCase())}
                    className="h-11 text-center font-mono tracking-widest text-base"
                    autoFocus
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    أدخل الرقم التسلسلي الخاص بك
                  </p>
                </div>
                <Button type="submit" className="w-full h-11 font-medium" disabled={busy || !serialInput.trim()}>
                  {busy ? 'جارٍ التحقق...' : 'تسجيل الدخول'}
                </Button>
              </form>
            )}

            {/* ── QR login ── */}
            {mode === 'qr' && (
              <div className="space-y-4">
                {/* Hidden video + canvas — always mounted when in QR mode for stable refs */}
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className={`w-full rounded-xl object-cover ${qrActive && camStatus === 'scanning' ? 'block' : 'hidden'}`}
                  style={{ maxHeight: '300px' }}
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Idle / not started */}
                {!qrActive && (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center">
                      <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M3 9V6a1 1 0 011-1h3M3 15v3a1 1 0 001 1h3m11-4v3a1 1 0 01-1 1h-3m4-11h-3a1 1 0 01-1-1V5M7 7h4v4H7V7zm6 6h4v4h-4v-4zm0-6h.01M13 17h.01" />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground text-center leading-relaxed">
                      امسح رمز QR الخاص بك<br />لتسجيل الدخول تلقائياً
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

                {/* Scanning — video is visible above, show hint + cancel */}
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
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <a href="/" className="hover:text-primary transition-colors">
            {t('emp.login.admin_link')}
          </a>
        </p>
      </div>
    </div>
  );
}

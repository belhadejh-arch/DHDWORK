/**
 * QrScanner — WebView-compatible fullscreen QR scanner
 * Uses useQrCamera (jsQR + raw getUserMedia) — no html5-qrcode.
 */
import { useRef, useState } from 'react';
import { useI18n } from '@/context/i18n';
import { Button } from '@/components/ui/button';
import { useQrCamera, QrCameraStatus } from './useQrCamera';

export function QrScanner({ onScan, onCancel }: { onScan: (text: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus]     = useState<QrCameraStatus>('starting');
  const [errorMsg, setErrorMsg] = useState('');

  const { stopCamera, restartCamera } = useQrCamera({
    videoRef,
    canvasRef,
    active: true,
    onScan,
    onError:  (msg) => setErrorMsg(msg),
    onStatus: setStatus,
  });

  const handleCancel = () => {
    stopCamera();
    onCancel();
  };

  const handleRetry = () => {
    setStatus('starting');
    setErrorMsg('');
    restartCamera();          // actually restarts camera — not just a CSS change
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      {/* Video element — always in DOM so ref is stable */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`w-full max-w-sm rounded-xl object-cover ${status === 'scanning' ? 'block' : 'hidden'}`}
        style={{ maxHeight: '60vh' }}
      />
      {/* Hidden canvas for jsQR frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Scanning overlay */}
      {status === 'scanning' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="border-2 border-white/70 rounded-2xl w-56 h-56 relative">
            <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
            <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
            <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
            <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />
          </div>
          <p className="text-white/80 text-sm mt-4">وجّه الكاميرا نحو رمز QR</p>
        </div>
      )}

      {/* Starting spinner */}
      {status === 'starting' && (
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-10 w-10 border-2 border-white border-t-transparent rounded-full" />
          <p className="text-white/70 text-sm">جارٍ تشغيل الكاميرا…</p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="flex flex-col items-center gap-4 max-w-xs text-center px-4">
          <div className="bg-red-500/20 border border-red-500/40 rounded-xl p-4">
            <p className="text-red-300 text-sm leading-relaxed">{errorMsg}</p>
          </div>
          <Button
            variant="outline"
            className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            onClick={handleRetry}
          >
            إعادة المحاولة
          </Button>
        </div>
      )}

      <Button
        variant="secondary"
        className="mt-8 pointer-events-auto"
        onClick={handleCancel}
      >
        {t('action.cancel')}
      </Button>
    </div>
  );
}

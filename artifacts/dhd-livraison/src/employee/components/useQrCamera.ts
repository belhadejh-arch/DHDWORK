/**
 * useQrCamera — WebView-compatible QR scanner hook
 *
 * Uses raw getUserMedia + jsQR + requestAnimationFrame.
 * No html5-qrcode, no dynamic DOM injection — safe inside AppCreator WebView.
 *
 * WebView-specific hardening:
 * - Falls back to legacy navigator.getUserMedia / webkitGetUserMedia
 * - 12-second timeout on camera acquisition (WebView can hang indefinitely)
 * - exposes restartCamera() so QrScanner can retry without unmounting
 * - inversionAttempts: 'attemptBoth' catches light-on-dark QR codes
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import jsQR from 'jsqr';

export type QrCameraStatus = 'idle' | 'starting' | 'scanning' | 'error';

interface UseQrCameraOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onScan: (text: string) => void;
  onError: (msg: string) => void;
  onStatus: (s: QrCameraStatus) => void;
  active: boolean;
}

/** Legacy getUserMedia fallback for older Android WebViews */
async function getUserMediaCompat(constraints: MediaStreamConstraints): Promise<MediaStream> {
  // Modern API (Chrome 47+, iOS 11+, most WebViews)
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  // Legacy fallback: some Android WebViews only expose navigator.getUserMedia
  const legacy =
    (navigator as any).getUserMedia ||
    (navigator as any).webkitGetUserMedia ||
    (navigator as any).mozGetUserMedia;
  if (legacy) {
    return new Promise<MediaStream>((resolve, reject) => {
      legacy.call(navigator, constraints, resolve, reject);
    });
  }
  throw new DOMException('getUserMedia not supported', 'NotSupportedError');
}

const CAMERA_ACQUIRE_TIMEOUT_MS = 12_000; // some WebViews hang on getUserMedia
const SCAN_INTERVAL_MS = 100; // ~10 fps — fast enough for any QR reader

export function useQrCamera({
  videoRef,
  canvasRef,
  onScan,
  onError,
  onStatus,
  active,
}: UseQrCameraOptions) {
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const mountedRef = useRef(true);

  // Increment to re-trigger the start effect without changing `active`
  const [startKey, setStartKey] = useState(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, [videoRef]);

  /** Stop and restart the camera — used by QrScanner retry button */
  const restartCamera = useCallback(() => {
    stopCamera();
    doneRef.current = false;
    setStartKey(k => k + 1);
  }, [stopCamera]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (!active) {
      stopCamera();
      doneRef.current = false;
      return;
    }

    doneRef.current = false;
    onStatus('starting');

    let cancelled = false;
    let acquireTimer: ReturnType<typeof setTimeout> | null = null;

    async function start() {
      // Verify camera API availability
      const hasModern = !!navigator.mediaDevices?.getUserMedia;
      const hasLegacy = !!(
        (navigator as any).getUserMedia ||
        (navigator as any).webkitGetUserMedia ||
        (navigator as any).mozGetUserMedia
      );
      if (!hasModern && !hasLegacy) {
        if (!mountedRef.current || cancelled) return;
        onError('الكاميرا غير متاحة في هذا المتصفح أو التطبيق');
        onStatus('error');
        return;
      }

      let stream: MediaStream;
      try {
        // Race getUserMedia against a timeout — WebView can hang indefinitely
        stream = await Promise.race([
          // Prefer rear camera, fall back to any
          getUserMediaCompat({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          }).catch(() =>
            getUserMediaCompat({ video: true, audio: false })
          ),
          new Promise<never>((_, reject) => {
            acquireTimer = setTimeout(
              () => reject(new DOMException('Camera acquire timeout', 'TimeoutError')),
              CAMERA_ACQUIRE_TIMEOUT_MS
            );
          }),
        ]);
        if (acquireTimer) { clearTimeout(acquireTimer); acquireTimer = null; }
      } catch (err: unknown) {
        if (acquireTimer) { clearTimeout(acquireTimer); acquireTimer = null; }
        if (cancelled || !mountedRef.current) return;
        const name = err instanceof Error ? err.name : '';
        const msg  = err instanceof Error ? err.message.toLowerCase() : '';
        if (name === 'TimeoutError') {
          onError('تعذّر الوصول إلى الكاميرا. أغلق التطبيق وأعد فتحه، ثم امنح إذن الكاميرا.');
        } else if (
          name === 'NotAllowedError' ||
          msg.includes('permission') ||
          msg.includes('denied') ||
          msg.includes('notallowed')
        ) {
          onError('لم يتم السماح بالوصول إلى الكاميرا. افتح إعدادات التطبيق وامنح إذن الكاميرا.');
        } else {
          onError('تعذّر تشغيل الكاميرا. تأكد من أن الجهاز يدعم الكاميرا وأن التطبيق يملك الإذن.');
        }
        onStatus('error');
        return;
      }

      if (cancelled || !mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      // Critical WebView attributes — must be set before assigning srcObject
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('x-webkit-airplay', 'deny');
      video.muted = true;
      video.srcObject = stream;

      try {
        await video.play();
      } catch (playErr) {
        if (cancelled || !mountedRef.current) return;
        console.warn('[QR] video.play() failed:', playErr);
        onError('تعذّر تشغيل الكاميرا. أعد المحاولة.');
        onStatus('error');
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      if (cancelled || !mountedRef.current) return;
      onStatus('scanning');

      let lastScanAt = 0;

      function tick(now: number) {
        if (doneRef.current || cancelled || !mountedRef.current) return;

        if (now - lastScanAt < SCAN_INTERVAL_MS) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        lastScanAt = now;

        const canvas = canvasRef.current;
        const vid = videoRef.current;
        if (!canvas || !vid || vid.readyState < 2 || vid.videoWidth === 0) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // Decode at 75% resolution — fast enough, still accurate for QR
        const scale = 0.75;
        canvas.width  = Math.round(vid.videoWidth  * scale);
        canvas.height = Math.round(vid.videoHeight * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // 'attemptBoth' also decodes light-on-dark (inverted) QR codes — wider compat
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (code?.data && !doneRef.current) {
          doneRef.current = true;
          stopCamera();
          onScan(code.data);
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (acquireTimer) clearTimeout(acquireTimer);
      stopCamera();
    };
    // startKey is intentional — changing it re-runs the effect for retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, startKey]);

  return { stopCamera, restartCamera };
}

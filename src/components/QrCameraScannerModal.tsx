import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  RefreshCw,
  SwitchCamera,
  Upload,
  X,
} from 'lucide-react';

interface QrCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedValue: string) => void;
}

type ScannerState =
  | 'initializing'
  | 'scanning'
  | 'permission_denied'
  | 'camera_unavailable'
  | 'paused';

// Optional BarcodeDetector type declaration for browsers supporting the native Shape Detection API (e.g. Chrome on Android)
interface BarcodeDetectorInstance {
  detect: (
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap
  ) => Promise<Array<{ rawValue: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats: string[] }): BarcodeDetectorInstance;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

export const QrCameraScannerModal: React.FC<QrCameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const hasScannedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);

  const [scannerState, setScannerState] =
    useState<ScannerState>('initializing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment'
  );
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);

  // Stop all active media tracks and clear detection loop
  const stopCameraAndScanner = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Handle a single decoded QR value and prevent duplicate triggers
  const handleDetectedValue = useCallback(
    (rawValue: string) => {
      const cleaned = (rawValue || '').trim();
      if (!cleaned || hasScannedRef.current) {
        return;
      }
      // Lock immediately so the same QR code cannot trigger multiple times
      hasScannedRef.current = true;
      stopCameraAndScanner();
      onScanSuccess(cleaned);
    },
    [stopCameraAndScanner, onScanSuccess]
  );

  // Start camera stream and begin periodic QR frame detection
  const startCamera = useCallback(
    async (preferredFacing: 'environment' | 'user' = facingMode) => {
      stopCameraAndScanner();
      hasScannedRef.current = false;
      setScannerState('initializing');
      setErrorMessage(null);

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setScannerState('camera_unavailable');
        setErrorMessage(
          'Camera access is not supported in this browser environment. Ensure HTTPS is active or upload a QR image below.'
        );
        return;
      }

      try {
        // Request camera permission with Android-friendly rear camera preference, falling back to any available video device
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: preferredFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch (firstErr) {
          // If overconstrained on specific device, fallback to basic video: true unless permission was explicitly denied
          const errName =
            firstErr instanceof DOMException ? firstErr.name : '';
          if (
            errName === 'NotAllowedError' ||
            errName === 'PermissionDeniedError' ||
            errName === 'SecurityError'
          ) {
            throw firstErr;
          }
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }

        if (!isMountedRef.current || !isOpen) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Check if device has multiple cameras (e.g. front + rear on Android)
        if (navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => {
              const videoInputs = devices.filter(
                (d) => d.kind === 'videoinput'
              );
              if (isMountedRef.current) {
                setHasMultipleCameras(videoInputs.length > 1);
              }
            })
            .catch(() => {});
        }

        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.setAttribute('playsinline', 'true');
          await videoEl.play().catch(() => {});
        }

        setScannerState('scanning');

        // Prepare optional native BarcodeDetector (Android Chrome hardware acceleration)
        let nativeDetector: BarcodeDetectorInstance | null = null;
        if (typeof window !== 'undefined' && window.BarcodeDetector) {
          try {
            nativeDetector = new window.BarcodeDetector({
              formats: ['qr_code'],
            });
          } catch {
            nativeDetector = null;
          }
        }

        // Start frame scanning interval (~12 fps for responsive detection without overheating mobile CPU)
        scanTimerRef.current = window.setInterval(async () => {
          if (
            hasScannedRef.current ||
            !videoRef.current ||
            !canvasRef.current
          ) {
            return;
          }
          const video = videoRef.current;
          if (
            video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA ||
            video.videoWidth === 0 ||
            video.videoHeight === 0
          ) {
            return;
          }

          // 1. Try native BarcodeDetector first if available
          if (nativeDetector) {
            try {
              const barcodes = await nativeDetector.detect(video);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                handleDetectedValue(barcodes[0].rawValue);
                return;
              }
            } catch {
              // Fallback to jsQR canvas decoding below
            }
          }

          // 2. Universal jsQR frame decoding on the center/full video frame
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;

          const width = video.videoWidth;
          const height = video.videoHeight;
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(video, 0, 0, width, height);

          const imageData = ctx.getImageData(0, 0, width, height);
          const qrResult = jsQR(imageData.data, width, height, {
            inversionAttempts: 'dontInvert',
          });

          if (qrResult && qrResult.data) {
            handleDetectedValue(qrResult.data);
          }
        }, 100);
      } catch (err) {
        if (!isMountedRef.current) return;
        const errName = err instanceof DOMException ? err.name : '';
        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errName === 'SecurityError'
        ) {
          setScannerState('permission_denied');
          setErrorMessage(
            'Camera access is required to scan patient referral QR codes. Please allow camera permission in your browser settings and tap Retry.'
          );
        } else {
          setScannerState('camera_unavailable');
          setErrorMessage(
            'Unable to access the device camera. Check that no other app is using the camera or tap Retry.'
          );
        }
      }
    },
    [facingMode, isOpen, stopCameraAndScanner, handleDetectedValue]
  );

  // Handle lifecycle: start when modal opens, pause when page hidden, resume when visible, stop on close/unmount
  useEffect(() => {
    isMountedRef.current = true;

    if (!isOpen) {
      stopCameraAndScanner();
      return;
    }

    startCamera(facingMode);

    const handleVisibilityChange = () => {
      if (!isOpen) return;
      if (document.hidden) {
        stopCameraAndScanner();
        if (isMountedRef.current) {
          setScannerState('paused');
        }
      } else if (!hasScannedRef.current) {
        startCamera(facingMode);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopCameraAndScanner();
    };
  }, [isOpen, facingMode, startCamera, stopCameraAndScanner]);

  // Toggle between rear ('environment') and front ('user') camera on mobile devices
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  // Decode an uploaded or captured QR image file using jsQR
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, img.width, img.height);
        if (code && code.data) {
          handleDetectedValue(code.data);
        } else {
          setErrorMessage(
            'No valid QR code found in the selected image. Try holding the QR code steady inside the frame.'
          );
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClose = () => {
    stopCameraAndScanner();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      data-testid="qr-camera-scanner-modal"
    >
      {/* Top Scanner Bar with Back / Close buttons */}
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 bg-slate-900/90 border-b border-slate-800">
        <button
          type="button"
          onClick={handleClose}
          data-testid="qr-scanner-back-btn"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-bold text-white hover:bg-slate-700 transition-colors min-h-[42px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2
          id="qr-scanner-title"
          className="text-base font-bold tracking-tight text-white"
        >
          Scan Referral QR Code
        </h2>

        <div className="flex items-center gap-2">
          {hasMultipleCameras && scannerState === 'scanning' && (
            <button
              type="button"
              onClick={handleToggleFacingMode}
              aria-label="Switch camera"
              className="inline-flex items-center justify-center rounded-lg bg-slate-800 p-2.5 text-white hover:bg-slate-700 transition-colors min-h-[42px] min-w-[42px]"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close scanner"
            data-testid="qr-scanner-close-btn"
            className="inline-flex items-center justify-center rounded-lg bg-slate-800 p-2.5 text-white hover:bg-slate-700 transition-colors min-h-[42px] min-w-[42px]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Camera Viewport & Center Scanning Frame */}
      <div className="relative flex-1 flex flex-col items-center justify-center overflow-hidden bg-black p-4">
        {/* Live Camera Video Element */}
        <video
          ref={videoRef}
          data-testid="qr-scanner-video"
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover ${
            scannerState === 'scanning' ? 'opacity-100' : 'opacity-20'
          }`}
        />

        {/* Hidden Canvas for jsQR Frame Processing */}
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

        {/* Center Scanning Frame Overlay when Camera is Active */}
        {(scannerState === 'scanning' || scannerState === 'initializing') && (
          <div className="relative z-10 flex flex-col items-center">
            <div
              data-testid="qr-scanning-frame-overlay"
              className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-2xl border-2 border-white/40 shadow-[0_0_0_9999px_rgba(2,6,23,0.65)] flex items-center justify-center"
            >
              {/* High-visibility corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-teal-400 rounded-tl-xl -mt-0.5 -ml-0.5" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-teal-400 rounded-tr-xl -mt-0.5 -mr-0.5" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-teal-400 rounded-bl-xl -mb-0.5 -ml-0.5" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-teal-400 rounded-br-xl -mb-0.5 -mr-0.5" />

              {/* Center horizontal scan line indicator */}
              <div className="w-5/6 h-0.5 bg-teal-400/90 shadow-[0_0_8px_#2dd4bf] animate-pulse" />
            </div>

            <p className="mt-6 text-sm font-semibold text-white bg-slate-900/80 px-4 py-2 rounded-full border border-slate-700">
              {scannerState === 'initializing'
                ? 'Starting camera...'
                : 'Align the referral QR code inside the frame'}
            </p>
          </div>
        )}

        {/* Permission Denied or Camera Unavailable State */}
        {(scannerState === 'permission_denied' ||
          scannerState === 'camera_unavailable') && (
          <div
            role="alert"
            data-testid="qr-camera-error-state"
            className="relative z-10 max-w-md w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center space-y-4 shadow-xl"
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white">
                {scannerState === 'permission_denied'
                  ? 'Camera Permission Required'
                  : 'Camera Unavailable'}
              </h3>
              <p className="text-sm text-slate-300">{errorMessage}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                data-testid="qr-retry-permission-btn"
                onClick={() => startCamera(facingMode)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-500 transition-colors min-h-[48px]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Camera Permission</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors min-h-[48px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bar: Camera status & optional QR Image Capture / Upload */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Camera className="w-4 h-4 text-teal-400 shrink-0" />
          <span>
            {scannerState === 'scanning'
              ? 'Live camera active — auto-detecting QR codes'
              : 'Camera standby'}
          </span>
        </div>

        <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer transition-colors min-h-[38px]">
          <Upload className="w-3.5 h-3.5 text-teal-400" />
          <span>Scan from QR Photo</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileUpload}
            className="sr-only"
          />
        </label>
      </div>
    </div>
  );
};

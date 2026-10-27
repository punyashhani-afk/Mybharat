import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  X,
  RefreshCw,
  AlertCircle,
  SwitchCamera,
  QrCode,
  CheckCircle2,
  Upload,
  Keyboard,
  ShieldAlert,
} from 'lucide-react';
import {
  triggerHapticFeedback,
  validateXareloopQrPayload,
} from '../core/referralEngine';

interface QrCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedValue: string) => void;
  onSwitchToManualEntry?: () => void;
  demoPayloads?: { label: string; value: string }[];
}

type ScannerState =
  | 'initializing'
  | 'scanning'
  | 'permission_denied'
  | 'camera_error'
  | 'invalid_qr'
  | 'detected';

export const QrCameraScannerModal: React.FC<QrCameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  onSwitchToManualEntry,
  demoPayloads = [],
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const hasScannedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);

  const [scannerState, setScannerState] = useState<ScannerState>('initializing');
  const [errorTitle, setErrorTitle] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [detectedValue, setDetectedValue] = useState<string>('');

  const stopCamera = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
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

  const handleDecodedValue = useCallback(
    (rawValue: string) => {
      const trimmed = (rawValue || '').trim();
      if (!trimmed || hasScannedRef.current) return;

      // Validate that the QR code belongs to the Xareloop referral format
      const validation = validateXareloopQrPayload(trimmed);
      if (!validation.valid) {
        stopCamera();
        setScannerState('invalid_qr');
        setErrorTitle(validation.errorTitle || 'Invalid QR Code');
        setErrorMessage(
          validation.errorMessage ||
            'This QR code does not belong to the Xareloop referral system.'
        );
        return;
      }

      hasScannedRef.current = true;
      setDetectedValue(validation.referralId || validation.patientCode || trimmed);
      setScannerState('detected');
      triggerHapticFeedback('qr_scan');
      stopCamera();

      // Short visual confirmation before opening referral
      setTimeout(() => {
        if (isMountedRef.current) {
          onScanSuccess(trimmed);
        }
      }, 280);
    },
    [onScanSuccess, stopCamera]
  );

  const startCamera = useCallback(async () => {
    if (!isOpen) return;

    stopCamera();
    hasScannedRef.current = false;
    setDetectedValue('');
    setScannerState('initializing');
    setErrorTitle('');
    setErrorMessage('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScannerState('camera_error');
      setErrorTitle('Camera Hardware Unavailable');
      setErrorMessage(
        'Camera access is not available on this device or browser. You can upload a QR image or enter the Referral ID manually below.'
      );
      return;
    }

    try {
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (!isMountedRef.current || !isOpen) {
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = mediaStream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = mediaStream;
        video.setAttribute('playsinline', 'true');
        await video.play();
      }

      setScannerState('scanning');

      let nativeDetector: {
        detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]>;
      } | null = null;

      if ('BarcodeDetector' in window) {
        try {
          const BarcodeDetectorCtor = (
            window as unknown as {
              BarcodeDetector: new (opts: { formats: string[] }) => {
                detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]>;
              };
            }
          ).BarcodeDetector;
          nativeDetector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
        } catch {
          nativeDetector = null;
        }
      }

      let isProcessingFrame = false;

      const scanFrame = async () => {
        if (!isMountedRef.current || hasScannedRef.current || !videoRef.current) {
          return;
        }

        if (isProcessingFrame) {
          rafIdRef.current = requestAnimationFrame(scanFrame);
          return;
        }

        const vid = videoRef.current;
        if (
          vid.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
          vid.videoWidth > 0 &&
          vid.videoHeight > 0
        ) {
          isProcessingFrame = true;
          try {
            if (nativeDetector) {
              try {
                const barcodes = await nativeDetector.detect(vid);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  handleDecodedValue(barcodes[0].rawValue);
                  return;
                }
              } catch {
                // Fallback to jsQR canvas decoding below
              }
            }

            if (!isMountedRef.current || hasScannedRef.current || !videoRef.current) {
              return;
            }

            const canvas = canvasRef.current;
            const currentWidth = vid.videoWidth;
            const currentHeight = vid.videoHeight;
            if (canvas && currentWidth > 0 && currentHeight > 0) {
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                const scale = Math.min(1, 640 / Math.max(currentWidth, currentHeight));
                const width = Math.max(1, Math.floor(currentWidth * scale));
                const height = Math.max(1, Math.floor(currentHeight * scale));
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(vid, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, width, height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert',
                });
                if (code && code.data) {
                  handleDecodedValue(code.data);
                  return;
                }
              }
            }
          } catch {
            // Ignore transient frame read error
          } finally {
            isProcessingFrame = false;
          }
        }

        if (!hasScannedRef.current && isMountedRef.current) {
          rafIdRef.current = requestAnimationFrame(scanFrame);
        }
      };

      rafIdRef.current = requestAnimationFrame(scanFrame);
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      if (
        errorObj?.name === 'NotAllowedError' ||
        errorObj?.name === 'PermissionDeniedError' ||
        errorObj?.message?.toLowerCase().includes('permission')
      ) {
        setScannerState('permission_denied');
        setErrorTitle('Camera Permission Required');
        setErrorMessage(
          'Camera access is required to scan Xareloop QR referral slips. Please allow camera permission in your browser settings and tap Retry, or enter the Referral ID manually.'
        );
      } else {
        setScannerState('camera_error');
        setErrorTitle('Camera Unavailable');
        setErrorMessage(
          'Could not start the device camera. You can retry camera access, upload a QR image, or enter the Referral ID manually.'
        );
      }
    }
  }, [facingMode, handleDecodedValue, isOpen, stopCamera]);

  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopCamera();
      } else if (!hasScannedRef.current) {
        startCamera();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleUploadQrImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const width = Math.max(1, img.width);
        const height = Math.max(1, img.height);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          handleDecodedValue(code.data);
        } else {
          stopCamera();
          setScannerState('invalid_qr');
          setErrorTitle('No QR Code Found in Image');
          setErrorMessage(
            'Could not detect a clear QR code in the uploaded image. Try scanning with the camera or entering the Referral ID manually.'
          );
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!isOpen) return null;

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const handleManualEntryFallback = () => {
    stopCamera();
    onClose();
    onSwitchToManualEntry?.();
  };

  const handleFlipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div
      data-testid="qr-camera-scanner-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      className="fixed inset-0 z-50 bg-[#031B4E] flex flex-col justify-between text-[#FFFFFF]"
    >
      {/* Top Bar: Xareloop Deep Navy Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#031B4E] border-b border-[#062B78]">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#062B78] border border-[#10B9A8] flex items-center justify-center shrink-0">
            <Camera className="w-5 h-5 text-[#10B9A8]" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="qr-scanner-title"
              className="text-sm font-extrabold tracking-tight text-[#FFFFFF]"
            >
              Scan Xareloop Referral QR
            </h2>
            <p className="text-xs font-semibold text-[#DDF7F4]">
              Position the Xareloop QR code inside the frame.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFlipCamera}
            data-testid="flip-camera-button"
            className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-[#062B78] hover:bg-[#0878F9] text-[#FFFFFF] border border-[#0878F9] flex items-center justify-center transition-colors cursor-pointer"
            title="Switch Front / Rear Camera"
            aria-label="Switch front or rear camera"
          >
            <SwitchCamera className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleClose}
            data-testid="close-camera-scanner-button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-[#FFFFFF] hover:bg-[#F7F9FC] text-[#031B4E] text-xs font-extrabold transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-[#062B78]" aria-hidden="true" />
            <span>Close</span>
          </button>
        </div>
      </div>

      {/* Center Camera Viewport & High-Contrast Scanning Frame */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-[#031B4E]">
        <video
          ref={videoRef}
          data-testid="qr-scanner-video"
          className={`w-full h-full object-cover ${
            scannerState === 'scanning' || scannerState === 'initializing'
              ? 'block'
              : 'hidden'
          }`}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUploadQrImage}
          className="hidden"
          aria-label="Upload QR code image"
        />

        {/* High-Contrast Scanning Frame Overlay */}
        {(scannerState === 'scanning' || scannerState === 'initializing') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6">
            <div
              data-testid="qr-scanning-frame"
              className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl border-2 border-[#FFFFFF]/60 shadow-[0_0_0_9999px_rgba(3,27,78,0.75)]"
            >
              {/* High-contrast Teal (#10B9A8) & Electric Blue (#0878F9) Corner Brackets */}
              <div className="absolute -top-1 -left-1 w-11 h-11 border-t-4 border-l-4 border-[#10B9A8] rounded-tl-2xl" />
              <div className="absolute -top-1 -right-1 w-11 h-11 border-t-4 border-r-4 border-[#10B9A8] rounded-tr-2xl" />
              <div className="absolute -bottom-1 -left-1 w-11 h-11 border-b-4 border-l-4 border-[#0878F9] rounded-bl-2xl" />
              <div className="absolute -bottom-1 -right-1 w-11 h-11 border-b-4 border-r-4 border-[#0878F9] rounded-br-2xl" />

              {/* Scanning line */}
              <div className="absolute inset-x-4 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-[#10B9A8] to-transparent animate-pulse" />
            </div>

            <div className="mt-6 px-4 py-2.5 rounded-full bg-[#031B4E] border-2 border-[#10B9A8] text-xs font-extrabold text-[#FFFFFF] flex items-center gap-2 shadow-md">
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#10B9A8] animate-ping"
                aria-hidden="true"
              />
              <span>
                {scannerState === 'initializing'
                  ? 'Scanning… Requesting camera access'
                  : 'Position the Xareloop QR code inside the frame.'}
              </span>
            </div>
          </div>
        )}

        {/* Short Success Confirmation (Text + Icon + Color) */}
        {scannerState === 'detected' && (
          <div
            data-testid="qr-detected-confirmation"
            role="status"
            className="max-w-sm w-full mx-4 p-6 rounded-2xl bg-[#FFFFFF] border-2 border-[#10B9A8] text-center space-y-3 text-[#10213F] shadow-xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#DDF7F4] border border-[#085E56] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 text-[#085E56]" aria-hidden="true" />
            </div>
            <h3 className="text-base font-extrabold text-[#031B4E]">
              ✓ Xareloop QR Detected
            </h3>
            <p className="text-sm font-mono font-extrabold text-[#062B78]">
              {detectedValue}
            </p>
            <p className="text-xs font-semibold text-[#475569]">
              Loading referral…
            </p>
          </div>
        )}

        {/* Invalid / Non-Xareloop QR Code Error State */}
        {scannerState === 'invalid_qr' && (
          <div
            data-testid="invalid-qr-error"
            role="alert"
            className="max-w-sm w-full mx-4 p-6 rounded-2xl bg-[#FFFFFF] border-2 border-[#DC2626] text-center space-y-4 shadow-xl text-[#10213F]"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#FEF2F2] border border-[#DC2626] flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6 text-[#B91C1C]" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-extrabold text-[#991B1B]">
                ! {errorTitle || 'Invalid QR Code'}
              </h3>
              <p className="text-xs text-[#10213F] font-medium leading-relaxed">
                {errorMessage}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={startCamera}
                data-testid="scan-again-button"
                className="w-full py-3 px-4 min-h-[44px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] text-[#FFFFFF] text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-[#10B9A8]" aria-hidden="true" />
                <span>Retry / Scan Again</span>
              </button>

              <button
                type="button"
                onClick={handleManualEntryFallback}
                className="w-full py-3 px-4 min-h-[44px] rounded-xl bg-[#F7F9FC] hover:bg-[#E2E8F0] text-[#10213F] border border-[#94A3B8] text-xs font-extrabold transition-colors cursor-pointer"
              >
                Enter Referral ID Manually
              </button>
            </div>
          </div>
        )}

        {/* Camera Permission Denied or Hardware Unavailable Error State */}
        {(scannerState === 'permission_denied' || scannerState === 'camera_error') && (
          <div
            data-testid="camera-permission-error"
            role="alert"
            className="max-w-sm w-full mx-4 p-6 rounded-2xl bg-[#FFFFFF] border-2 border-[#E2E8F0] text-center space-y-4 shadow-xl text-[#10213F]"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#FEF2F2] border border-[#DC2626] flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-[#B91C1C]" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-extrabold text-[#031B4E]">
                ! {errorTitle}
              </h3>
              <p className="text-xs text-[#475569] font-medium leading-relaxed">
                {errorMessage}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={startCamera}
                data-testid="retry-camera-permission-button"
                className="w-full py-3 px-4 min-h-[44px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] text-[#FFFFFF] text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-[#10B9A8]" aria-hidden="true" />
                <span>Retry Camera</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 min-h-[44px] rounded-xl bg-[#DDF7F4] hover:bg-[#c5f0eb] text-[#031B4E] border border-[#085E56] text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 text-[#085E56]" aria-hidden="true" />
                <span>Upload QR Image</span>
              </button>

              <button
                type="button"
                onClick={handleManualEntryFallback}
                className="w-full py-3 px-4 min-h-[44px] rounded-xl bg-[#F7F9FC] hover:bg-[#E2E8F0] text-[#10213F] border border-[#94A3B8] text-xs font-extrabold transition-colors cursor-pointer"
              >
                Enter Referral ID Manually
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bar: Fallback Methods (Upload QR Image / Manual Entry) & Prototype Test Slips */}
      <div className="px-4 py-3.5 bg-[#031B4E] border-t border-[#062B78] space-y-3">
        <div className="max-w-xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              data-testid="upload-qr-image-button"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-[#062B78] hover:bg-[#0878F9] text-xs font-extrabold text-[#FFFFFF] border border-[#10B9A8]/60 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#10B9A8]" aria-hidden="true" />
              <span>Upload QR Image</span>
            </button>

            <button
              type="button"
              onClick={handleManualEntryFallback}
              data-testid="manual-id-fallback-button"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-[#062B78] hover:bg-[#0878F9] text-xs font-extrabold text-[#FFFFFF] border border-[#0878F9]/60 transition-colors cursor-pointer"
            >
              <Keyboard className="w-3.5 h-3.5 text-[#DDF7F4]" aria-hidden="true" />
              <span>Enter Referral ID Manually</span>
            </button>
          </div>

          {demoPayloads.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-[#DDF7F4] flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-[#10B9A8]" aria-hidden="true" />
                Demo QR:
              </span>
              {demoPayloads.slice(0, 3).map((item) => (
                <button
                  key={item.label}
                  type="button"
                  data-testid={`scan-sample-qr-${item.label}`}
                  onClick={() => handleDecodedValue(item.value)}
                  className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-[#DDF7F4] hover:bg-[#FFFFFF] text-[11px] font-mono font-extrabold text-[#031B4E] border border-[#10B9A8] transition-colors cursor-pointer"
                >
                  Scan {item.label}
                </button>
              ))}
              <button
                type="button"
                data-testid="scan-invalid-qr-test"
                onClick={() => handleDecodedValue('https://example.com/unrelated-qr')}
                className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[11px] font-extrabold text-[#991B1B] border border-[#DC2626] transition-colors cursor-pointer"
              >
                Test Non-Xareloop QR
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

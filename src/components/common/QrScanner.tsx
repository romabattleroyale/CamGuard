import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, RefreshCw, X, AlertCircle, Upload } from 'lucide-react';

interface QrScannerProps {
  onScan: (data: string) => void;
  onClose?: () => void;
}

export const QrScanner: React.FC<QrScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isScanning, setIsScanning] = useState(true);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;

    async function startCamera() {
      setError(null);
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          requestScanFrame();
        }
      } catch (err: any) {
        console.error('Camera access error', err);
        setError(
          'Impossibile accedere alla fotocamera. Assicurati di aver concesso i permessi.'
        );
      }
    }

    startCamera();

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode]);

  const requestScanFrame = () => {
    if (!isScanning) return;

    if (
      videoRef.current &&
      videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA &&
      canvasRef.current
    ) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          setIsScanning(false);
          // Play confirmation chime or vibrate
          if (navigator.vibrate) navigator.vibrate(100);
          onScan(code.data);
          return;
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(requestScanFrame);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            onScan(code.data);
          } else {
            setError('Nessun codice QR rilevato nell’immagine.');
          }
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative w-full aspect-[4/3] max-w-sm mx-auto bg-black rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl flex flex-col items-center justify-center">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Targeting Reticle Frame */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="relative w-48 h-48 border-2 border-emerald-500/80 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)]">
          {/* Animated scanning laser line */}
          <div className="absolute inset-x-0 h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse top-1/2 -translate-y-1/2" />
          <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
        </div>
      </div>

      {/* Floating Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <button
          type="button"
          onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
          className="p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 rounded-full backdrop-blur-md transition-colors"
          title="Inverti fotocamera"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 rounded-full backdrop-blur-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && (
        <div className="absolute inset-0 bg-zinc-950/90 p-4 flex flex-col items-center justify-center text-center z-20">
          <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
          <p className="text-sm text-zinc-200 mb-3">{error}</p>
          <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium">
            <Upload className="w-3.5 h-3.5" />
            Carica foto QR
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      )}

      {/* Overlay caption */}
      <div className="absolute bottom-2 inset-x-0 text-center pointer-events-none">
        <span className="text-xs text-zinc-300 font-mono bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-sm">
          Inquadra il codice QR del Viewer
        </span>
      </div>
    </div>
  );
};

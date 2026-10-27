import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Camera,
  RefreshCw,
  Power,
  Battery,
  BatteryCharging,
  Flashlight,
  FlashlightOff,
  Moon,
  Volume2,
  ShieldAlert,
  AlertTriangle,
  QrCode,
  Copy,
  Check,
  X,
  Share2
} from 'lucide-react';
import { SignalingClient, createPeerConnectionConfig } from '../../services/webrtc';
import { playSirenSound, stopSirenSound, playChimeSound } from '../../utils/audio';
import { MotionDetector } from '../../utils/motion';
import { WakeLockManager, getBatteryStatus } from '../../utils/device';
import { generateQrDataUrl } from '../../utils/qr';
import { apiFetch, getSignalingBaseUrl } from '../../services/api';

interface PhoneCameraScreenProps {
  initialSessionId?: string;
  initialPin?: string;
  onExit: () => void;
}

export const PhoneCameraScreen: React.FC<PhoneCameraScreenProps> = ({
  initialSessionId,
  initialPin,
  onExit,
}) => {
  // Device Identity
  const [deviceName, setDeviceName] = useState<string>('CamGest Telefono');
  const [sessionId, setSessionId] = useState<string>(initialSessionId || '');
  const [pin, setPin] = useState<string>(initialPin || '');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Time & Battery
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);

  // Hardware states
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [viewerCount, setViewerCount] = useState<number>(0);
  const [isBlackScreen, setIsBlackScreen] = useState<boolean>(false);
  const [isSirenActive, setIsSirenActive] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionRetryCount, setPermissionRetryCount] = useState(0);

  // Motion Detection
  const [motionActive, setMotionActive] = useState<boolean>(true);
  const [motionAlert, setMotionAlert] = useState<boolean>(false);
  const [incomingAudioActive, setIncomingAudioActive] = useState<boolean>(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const incomingAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const wakeLockRef = useRef<WakeLockManager>(new WakeLockManager());
  const motionDetectorRef = useRef<MotionDetector>(new MotionDetector(6));
  const motionIntervalRef = useRef<any>(null);
  const sirenStopFnRef = useRef<(() => void) | null>(null);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Initialize Camera and Microphone (Rear Camera by default)
  const initLocalStream = useCallback(async (facing: 'environment' | 'user') => {
    setPermissionError(null);
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('MEDIA_UNAVAILABLE');
      }

      // Request video first, so microphone denial does not prevent surveillance video.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        audioStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      } catch (audioError) {
        // Video remains usable if the user denies microphone permission.
        console.warn('Microphone unavailable; continuing with video only.', audioError);
      }

      localStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.warn);
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        setTorchSupported(Boolean(capabilities.torch));
      }

      if (peerConnectionRef.current) {
        const senders = peerConnectionRef.current.getSenders();
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        const videoSender = senders.find((sender) => sender.track?.kind === 'video');
        const audioSender = senders.find((sender) => sender.track?.kind === 'audio');

        // Replace existing tracks after a permission retry / camera flip.
        if (videoSender && videoTrack) {
          await videoSender.replaceTrack(videoTrack);
        } else if (!videoSender && videoTrack) {
          peerConnectionRef.current.addTrack(videoTrack, stream);
        }
        if (audioSender && audioTrack) {
          await audioSender.replaceTrack(audioTrack);
        } else if (!audioSender && audioTrack) {
          peerConnectionRef.current.addTrack(audioTrack, stream);
        }
      }

      return stream;
    } catch (err: any) {
      console.error('Camera initialization error', err);
      const errorName = err?.name || '';
      const message =
        errorName === 'NotAllowedError' || errorName === 'SecurityError'
          ? 'Accesso negato. Consenti Fotocamera e Microfono nelle autorizzazioni di Android, poi tocca Riprova.'
          : errorName === 'NotFoundError'
          ? 'Non è stata trovata una fotocamera o un microfono compatibile.'
          : errorName === 'NotReadableError' || errorName === 'TrackStartError'
          ? 'La fotocamera è occupata da un’altra app. Chiudi le altre app che la stanno usando e riprova.'
          : errorName === 'OverconstrainedError'
          ? 'La fotocamera non supporta le impostazioni richieste. Riprova con le impostazioni predefinite.'
          : errorName === 'MEDIA_UNAVAILABLE'
          ? 'Questo WebView non espone l’API fotocamera. Verifica che l’APK sia aggiornato e che i permessi Android siano configurati.'
          : 'Impossibile avviare fotocamera e microfono. Verifica i permessi Android e riprova.';
      setPermissionError(message);
      return null;
    }
  }, []);

  // 2. Initialize Session and Transmission on Mount
  useEffect(() => {
    wakeLockRef.current.acquire();

    // Check battery
    getBatteryStatus().then((status) => {
      if (status) {
        setBatteryLevel(status.level);
        setIsCharging(status.charging);
      }
    });

    const batteryInterval = setInterval(() => {
      getBatteryStatus().then((status) => {
        if (status) {
          setBatteryLevel(status.level);
          setIsCharging(status.charging);
        }
      });
    }, 12000);

    // Auto-create or join transmission session
    let isMounted = true;
    async function startTransmissionSession() {
      const initialStream = await initLocalStream('environment');
      if (!initialStream || !isMounted) return;

      try {
        let activeSessionId = initialSessionId;
        let activePin = initialPin;

        if (!activeSessionId) {
          // Create session as Camera node
          const res = await apiFetch('/api/signaling/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: deviceName }),
          });

          if (res.ok) {
            const data = await res.json();
            activeSessionId = data.sessionId;
            activePin = data.pin;
          }
        }

        if (!activeSessionId || !isMounted) return;

        setSessionId(activeSessionId);
        if (activePin) setPin(activePin);

        // Confirm a live stream is now attached before the UI claims transmission is active.
        if (localStreamRef.current?.getVideoTracks().some((track) => track.readyState === 'live')) {
          setPermissionError(null);
        } else {
          setPermissionError('Sessione creata ma fotocamera non attiva. Controlla i permessi e riprova.');
          return;
        }

        // Generate pairing QR data URL
        const pairUrl = `${getSignalingBaseUrl()}/#viewer&session=${encodeURIComponent(activeSessionId)}&pin=${encodeURIComponent(activePin || '')}`;
        generateQrDataUrl(pairUrl).then((url) => {
          if (isMounted) setQrDataUrl(url);
        });

        // Initialize WebRTC and Signaling
        const signaling = new SignalingClient(activeSessionId, 'camera', activePin || pin);
        signalingRef.current = signaling;

        const pc = new RTCPeerConnection(createPeerConnectionConfig());
        peerConnectionRef.current = pc;

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current!);
          });
        }

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0] && incomingAudioRef.current) {
            incomingAudioRef.current.srcObject = event.streams[0];
            incomingAudioRef.current.play().catch(console.warn);
            setIncomingAudioActive(true);
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            signaling.sendMessage('candidate', event.candidate);
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setViewerCount(1);
          } else if (
            pc.connectionState === 'disconnected' ||
            pc.connectionState === 'failed'
          ) {
            setViewerCount(0);
          }
        };

        signaling.onMessage(async (msg) => {
          if (msg.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await signaling.sendMessage('answer', answer);
            setViewerCount(1);
          } else if (msg.type === 'answer') {
            if (pc.signalingState !== 'stable') {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
            }
            setViewerCount(1);
          } else if (msg.type === 'candidate' && msg.payload) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
            } catch (err) {
              console.warn('ICE error', err);
            }
          } else if (msg.type === 'command') {
            const cmd = msg.payload?.command;
            if (cmd === 'torch') {
              toggleTorch(msg.payload.enabled);
            } else if (cmd === 'flip') {
              flipCamera();
            } else if (cmd === 'siren') {
              toggleSiren(msg.payload.enabled);
            } else if (cmd === 'intercom_start') {
              setIncomingAudioActive(true);
            } else if (cmd === 'intercom_stop') {
              setIncomingAudioActive(false);
            }
          } else if (msg.type === 'disconnect') {
            setViewerCount(0);
          }
        });

        // Announce readiness
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        await signaling.sendMessage('offer', offer);
      } catch (err) {
        console.error('Error starting transmission', err);
      }
    }

    startTransmissionSession();

    return () => {
      isMounted = false;
      clearInterval(batteryInterval);
      wakeLockRef.current.release();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (sirenStopFnRef.current) {
        sirenStopFnRef.current();
      }
      if (signalingRef.current) {
        signalingRef.current.destroy();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [permissionRetryCount]);

  // Torch control
  const toggleTorch = useCallback(async (state?: boolean) => {
    const nextState = state !== undefined ? state : !torchOn;
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Torch constraint error', e);
      }
    }
  }, [torchOn]);

  // Flip camera
  const flipCamera = useCallback(async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    await initLocalStream(nextFacing);
  }, [facingMode, initLocalStream]);

  // Siren alert
  const toggleSiren = useCallback((enabled?: boolean) => {
    const next = enabled !== undefined ? enabled : !isSirenActive;
    if (next) {
      if (sirenStopFnRef.current) sirenStopFnRef.current();
      sirenStopFnRef.current = playSirenSound();
      setIsSirenActive(true);
    } else {
      if (sirenStopFnRef.current) {
        sirenStopFnRef.current();
        sirenStopFnRef.current = null;
      }
      stopSirenSound();
      setIsSirenActive(false);
    }
  }, [isSirenActive]);

  // Motion Detection
  useEffect(() => {
    if (!motionActive) {
      if (motionIntervalRef.current) {
        clearInterval(motionIntervalRef.current);
        motionIntervalRef.current = null;
      }
      return;
    }

    motionIntervalRef.current = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const result = motionDetectorRef.current.processVideoFrame(videoRef.current);
        if (result.motionDetected) {
          setMotionAlert(true);
          playChimeSound();

          if (signalingRef.current) {
            signalingRef.current.sendMessage('status', {
              cameraInfo: {
                motionDetected: true,
                lastMotionAt: Date.now(),
                snapshotUrl: result.snapshotUrl,
              },
            });
          }

          setTimeout(() => setMotionAlert(false), 2200);
        }
      }
    }, 260);

    return () => {
      if (motionIntervalRef.current) {
        clearInterval(motionIntervalRef.current);
        motionIntervalRef.current = null;
      }
    };
  }, [motionActive]);

  // Stop transmission and exit
  const handleStopTransmission = () => {
    if (signalingRef.current && sessionId) {
      signalingRef.current.sendMessage('disconnect', {});
      signalingRef.current.destroy();
      signalingRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    stopSirenSound();
    onExit();
  };

  // Copy connection pairing link
  const copyLink = async () => {
    const pairUrl = `${getSignalingBaseUrl()}/#viewer&session=${encodeURIComponent(sessionId)}&pin=${encodeURIComponent(pin)}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pairUrl);
      } else {
        const input = document.createElement('textarea');
        input.value = pairUrl;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('Copia non supportata dal dispositivo');
      }
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error('Impossibile copiare il link di abbinamento', error);
      setCopiedLink(false);
    }
  };

  // -------------------------------------------------------------
  // BLACK SCREEN (Foreground Service Energy Saver)
  // -------------------------------------------------------------
  if (isBlackScreen) {
    return (
      <div
        onClick={() => setIsBlackScreen(false)}
        className="fixed inset-0 bg-[#0B0F14] z-50 flex flex-col items-center justify-between p-8 select-none cursor-pointer"
      >
        <div className="flex items-center gap-3 text-[#64748B] text-xs font-mono tracking-widest uppercase">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F87171] animate-ping" />
          <span>CAMGEST • TRASMISSIONE ATTIVA</span>
        </div>

        <div className="text-center space-y-3">
          <div className="text-7xl font-extralight text-[#94A3B8] font-mono tracking-widest">
            {currentTime}
          </div>
          <div className="text-xs text-[#64748B] tracking-wide">
            Schermo oscurato per risparmio energetico • Servizio in foreground attivo
          </div>
          <div className="text-xs text-[#4FC3F7] font-bold tracking-widest uppercase pt-3">
            Tocca ovunque per riattivare lo schermo
          </div>
        </div>

        <div className="flex items-center gap-6 text-[#64748B] text-xs font-mono">
          {batteryLevel !== null && (
            <div className="flex items-center gap-1.5">
              {isCharging ? (
                <BatteryCharging className="w-4 h-4 text-[#34D399]" />
              ) : (
                <Battery className="w-4 h-4" />
              )}
              <span>{batteryLevel}%</span>
            </div>
          )}
          <span>{viewerCount > 0 ? '1 Viewer connesso' : 'In attesa'}</span>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // FULLSCREEN CAMERA TRANSMITTER VIEW
  // -------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-40 bg-[#0B0F14] text-[#F1F5F9] flex flex-col select-none overflow-hidden">
      <audio ref={incomingAudioRef} autoPlay playsInline />

      {/* Camera Live Viewport (100% of viewport) */}
      <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted
        />

        {/* Ambient Dark Gradients for Overlay Contrast */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-10" />

        {/* TOP MINIMAL OVERLAY: Nome dispositivo, "In trasmissione" con pallino rosso pulsante, orario, batteria */}
        <header className="absolute top-0 inset-x-0 p-5 sm:p-6 z-20 flex items-center justify-between pointer-events-auto">
          {/* Left: Back button to Welcome Screen, Device Name & Red Pulsing Transmission Beacon */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleStopTransmission}
              className="p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition-all shadow-md active:scale-90"
              title="Torna alla schermata iniziale"
              aria-label="Torna alla schermata iniziale"
            >
              <ArrowLeft className="w-4 h-4 text-[#4FC3F7]" />
            </button>

            <div className="px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center gap-2.5 shadow-lg">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F87171] opacity-80" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#F87171]" />
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-white">
                IN TRASMISSIONE
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs font-medium text-white/90">
              <Camera className="w-3.5 h-3.5 text-[#4FC3F7]" />
              <span>{deviceName}</span>
            </div>
          </div>

          {/* Right: Live Time, Battery & Quick Actions */}
          <div className="flex items-center gap-2.5">
            {/* Clock */}
            <div className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs font-mono font-bold text-white shadow-md">
              {currentTime}
            </div>

            {/* Battery Level */}
            {batteryLevel !== null && (
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold backdrop-blur-md border shadow-md ${
                  batteryLevel < 20
                    ? 'bg-[#F87171]/30 border-[#F87171]/50 text-[#F87171]'
                    : 'bg-black/60 border-white/15 text-white'
                }`}
              >
                {isCharging ? (
                  <BatteryCharging className="w-3.5 h-3.5 text-[#34D399]" />
                ) : (
                  <Battery className="w-3.5 h-3.5" />
                )}
                <span>{batteryLevel}%</span>
              </div>
            )}

            {/* QR Pairing Modal Trigger */}
            <button
              onClick={() => setQrModalOpen(true)}
              className="p-2 rounded-full bg-black/60 hover:bg-black/80 text-[#4FC3F7] backdrop-blur-md border border-white/15 transition-all shadow-md active:scale-90"
              title="Mostra codice QR per Viewer"
            >
              <QrCode className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Floating Side Tools (Torch, Camera Flip, Black Screen, Siren) */}
        <div className="absolute right-5 top-28 z-20 flex flex-col gap-3 pointer-events-auto">
          {torchSupported && (
            <button
              onClick={() => toggleTorch()}
              className={`p-3.5 rounded-2xl backdrop-blur-md shadow-xl transition-all active:scale-90 border ${
                torchOn
                  ? 'bg-amber-400 text-black border-amber-300 font-bold'
                  : 'bg-black/60 text-white border-white/15 hover:bg-black/80'
              }`}
              title="Torcia Flash"
            >
              {torchOn ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
            </button>
          )}

          <button
            onClick={flipCamera}
            className="p-3.5 bg-black/60 hover:bg-black/80 text-white rounded-2xl backdrop-blur-md border border-white/15 shadow-xl transition-all active:scale-90"
            title="Inverti Fotocamera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsBlackScreen(true)}
            className="p-3.5 bg-black/60 hover:bg-black/80 text-[#4FC3F7] rounded-2xl backdrop-blur-md border border-white/15 shadow-xl transition-all active:scale-90"
            title="Spegni schermo (Risparmio energetico)"
          >
            <Moon className="w-5 h-5" />
          </button>
        </div>

        {/* Live Audio Intercom indicator (when viewer speaks) */}
        <AnimatePresence>
          {incomingAudioActive && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-24 inset-x-5 max-w-sm mx-auto bg-[#34D399] text-black px-4 py-2 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-2xl z-30 animate-pulse"
            >
              <Volume2 className="w-4 h-4" />
              <span>INTERCOM: IL VIEWER STA PARLANDO</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Motion detected banner */}
        <AnimatePresence>
          {motionAlert && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-24 inset-x-5 max-w-sm mx-auto bg-[#F87171] text-white px-4 py-2 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-2xl z-30"
            >
              <AlertTriangle className="w-4 h-4 animate-bounce" />
              <span>MOVIMENTO RILEVATO IN STANZA</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Permission Error Banner */}
        {permissionError && (
          <div className="absolute inset-0 bg-[#0B0F14]/95 p-6 flex flex-col items-center justify-center text-center z-40 space-y-4">
            <AlertTriangle className="w-12 h-12 text-[#F87171]" />
            <h2 className="text-xl font-bold text-white">Accesso Richiesto</h2>
            <p className="text-sm text-[#94A3B8] max-w-md">{permissionError}</p>
            <button
              onClick={() => {
                // Re-run the effect so it cleans up old media and requests permissions once.
                setPermissionRetryCount((count) => count + 1);
              }}
              className="px-6 py-3 bg-[#4FC3F7] text-black font-extrabold rounded-2xl text-xs uppercase tracking-wider shadow-lg"
            >
              Riprova Permessi
            </button>
          </div>
        )}

        {/* BOTTOM CONTROLS: PULSANTE GRANDE "INTERROMPI" IN BASSO */}
        <footer className="absolute bottom-6 inset-x-5 sm:inset-x-8 z-30 flex flex-col items-center gap-3 pointer-events-auto">
          {/* Subtle LAN status */}
          <div className="text-[11px] font-mono text-white/70 bg-black/60 px-3.5 py-1 rounded-full backdrop-blur-md border border-white/10 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
            <span>{viewerCount > 0 ? '1 Spettatore collegato' : 'In attesa del Viewer'} • PIN: {pin || 'LAN'}</span>
          </div>

          {/* Big Primary Stop Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleStopTransmission}
            className="w-full max-w-md py-4 px-6 rounded-[22px] bg-gradient-to-r from-[#F87171] to-[#EF4444] text-white font-black text-sm uppercase tracking-widest shadow-[0_10px_35px_rgba(239,68,68,0.45)] border border-white/20 flex items-center justify-center gap-2.5 transition-all"
          >
            <Power className="w-5 h-5 stroke-[2.5]" />
            <span>Interrompi trasmissione</span>
          </motion.button>
        </footer>
      </div>

      {/* QR Code / Share Pairing Modal */}
      <AnimatePresence>
        {qrModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0B0F14]/90 backdrop-blur-md flex items-center justify-center p-5"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#141A21] border border-[#1F2933] p-6 rounded-[26px] max-w-sm w-full text-center space-y-4 shadow-2xl relative"
            >
              <button
                onClick={() => setQrModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 text-[#94A3B8] hover:text-white rounded-xl hover:bg-[#1C242E]"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-10 h-10 rounded-2xl bg-[#4FC3F7]/12 text-[#4FC3F7] mx-auto flex items-center justify-center border border-[#4FC3F7]/25">
                <QrCode className="w-5 h-5" />
              </div>

              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Collega telefono Viewer
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Inquadra questo QR con l’altro dispositivo per visualizzare il feed.
                </p>
              </div>

              <div className="p-3 bg-[#0B0F14] rounded-2xl border border-[#1F2933] inline-block shadow-inner">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 rounded-xl object-contain mx-auto" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-[#64748B]">
                    Generazione QR...
                  </div>
                )}
              </div>

              <div className="pt-1 space-y-2">
                <div className="rounded-xl bg-[#0B0F14] border border-[#1F2933] p-3 space-y-1">
                  <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Codice sessione per inserimento manuale</div>
                  <div className="text-xs font-mono text-white break-all select-all">{sessionId || 'Creazione sessione...'}</div>
                  <div className="text-xs font-mono text-[#4FC3F7] font-bold">PIN di connessione: {pin || '------'}</div>
                </div>

                <button
                  onClick={copyLink}
                  className="w-full py-2.5 px-4 bg-[#1C242E] hover:bg-[#242F3B] text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border border-[#1F2933] transition-all"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-[#34D399]" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Link Copiato!' : 'Copia link di accoppiamento'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

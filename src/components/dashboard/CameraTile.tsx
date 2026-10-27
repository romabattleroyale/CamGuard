import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Smartphone,
  Battery,
  BatteryCharging,
  Flashlight,
  FlashlightOff,
  Mic,
  Maximize2,
  Trash2,
  ShieldAlert,
  AlertTriangle,
  Clock,
  EyeOff,
  Shield,
  Star,
  RefreshCw,
  WifiOff,
  Info,
  Radio,
  SlidersHorizontal,
  Wifi,
  Play,
  MoreVertical,
  Settings
} from 'lucide-react';
import { CameraDevice } from '../../types/camera';
import { SignalingClient, createPeerConnectionConfig } from '../../services/webrtc';
import { playChimeSound } from '../../utils/audio';
import { ASSETS } from '../../assets/images';
import { apiFetch } from '../../services/api';

interface CameraTileProps {
  camera: CameraDevice;
  index: number;
  privacyMode?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onSelect: (camera: CameraDevice) => void;
  onRemove: (id: string) => void;
  onUpdate: (camera: CameraDevice) => void;
  onReconnect?: (camera: CameraDevice) => void;
}

export const CameraTile: React.FC<CameraTileProps> = ({
  camera,
  index,
  privacyMode = false,
  isFavorite = false,
  onToggleFavorite,
  onSelect,
  onRemove,
  onUpdate,
  onReconnect,
}) => {
  const isOnline = camera.status === 'online';
  const [isLive, setIsLive] = useState(isOnline);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | undefined>(camera.batteryLevel);
  const [isCharging, setIsCharging] = useState<boolean | undefined>(camera.isCharging);
  const [torchOn, setTorchOn] = useState<boolean>(Boolean(camera.torchOn));
  const [motionAlert, setMotionAlert] = useState<boolean>(false);
  const [isIntercomActive, setIsIntercomActive] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lastActivity, setLastActivity] = useState<string>(isOnline ? 'In tempo reale' : '15 min fa');

  // Indoor vs outdoor designation (default true if indoor not explicitly false)
  const isIndoor = camera.isIndoor !== false;
  // Is this camera currently blurred by Privacy Mode?
  const isPrivacyBlurred = privacyMode && isIndoor;

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const localMicStreamRef = useRef<MediaStream | null>(null);

  // Sync state with camera.status prop
  useEffect(() => {
    setIsLive(camera.status === 'online');
    if (camera.status === 'online') {
      setLastActivity('In tempo reale');
    }
  }, [camera.status]);

  // WebRTC Setup for Phone Camera
  useEffect(() => {
    if (camera.type !== 'phone' || !camera.sessionId || !isOnline) return;

    let isSubscribed = true;
    const signaling = new SignalingClient(camera.sessionId, 'viewer', camera.pin || '');
    signalingRef.current = signaling;

    const pc = new RTCPeerConnection(createPeerConnectionConfig());
    peerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0] && videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
        videoRef.current.play().catch(console.warn);
        setIsLive(true);
        onUpdate({ ...camera, status: 'online' });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.sendMessage('candidate', event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsLive(true);
      } else if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed'
      ) {
        setIsLive(false);
      }
    };

    signaling.onMessage(async (msg) => {
      if (!isSubscribed) return;

      if (msg.type === 'offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await signaling.sendMessage('answer', answer);
          setIsLive(true);
        } catch (err) {
          console.error('Failed to handle offer', err);
        }
      } else if (msg.type === 'answer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          setIsLive(true);
        } catch (err) {
          console.error('Failed to handle answer', err);
        }
      } else if (msg.type === 'candidate' && msg.payload) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
        } catch (err) {
          console.warn('ICE candidate error', err);
        }
      } else if (msg.type === 'status') {
        const info = msg.payload?.cameraInfo;
        if (info) {
          if (info.batteryLevel !== undefined) setBatteryLevel(info.batteryLevel);
          if (info.isCharging !== undefined) setIsCharging(info.isCharging);
          if (info.motionDetected) {
            setMotionAlert(true);
            setLastActivity('Movimento rilevato');
            playChimeSound();
            setTimeout(() => setMotionAlert(false), 2500);
          }
        }
        setIsLive(true);
      } else if (msg.type === 'disconnect') {
        setIsLive(false);
      }
    });

    return () => {
      isSubscribed = false;
      signaling.destroy();
      pc.close();
      if (localMicStreamRef.current) {
        localMicStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [camera.sessionId, camera.type, isOnline]);

  const handleManualReconnect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReconnecting(true);

    try {
      if (camera.type === 'phone' && camera.sessionId) {
        const response = await apiFetch(
          `/api/signaling/${encodeURIComponent(camera.sessionId)}/messages?role=viewer&pin=${encodeURIComponent(camera.pin || '')}&since=${Date.now() - 15000}`
        );
        if (!response.ok) {
          throw new Error('La sessione della telecamera non è raggiungibile.');
        }
        const data = await response.json();
        if (!Array.isArray(data.messages)) {
          throw new Error('Risposta del server non valida.');
        }
        const isRecentlyActive = data.messages.length > 0 || data.cameraInfo != null;
        if (!isRecentlyActive) {
          throw new Error('Nessuna attività recente dalla telecamera. Verifica che il telefono trasmettitore sia aperto e collegato.');
        }
        onUpdate({ ...camera, status: 'online', lastSeen: Date.now() });
      } else {
        // IP camera reachability requires a real RTSP/ONVIF probe service.
        // Do not falsely mark an untested device as online.
        throw new Error('La verifica reale RTSP/ONVIF non è ancora configurata per questa telecamera IP.');
      }
    } catch (error) {
      console.warn('Camera reconnect check failed', error);
      onUpdate({ ...camera, status: 'offline', lastSeen: Date.now() });
    } finally {
      setIsReconnecting(false);
    }
  };

  const toggleRemoteTorch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (signalingRef.current) {
      const nextTorch = !torchOn;
      setTorchOn(nextTorch);
      signalingRef.current.sendMessage('command', {
        command: 'torch',
        enabled: nextTorch,
      });
    }
  };

  const triggerRemoteSiren = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (signalingRef.current) {
      signalingRef.current.sendMessage('command', {
        command: 'siren',
        enabled: true,
      });
      setTimeout(() => {
        signalingRef.current?.sendMessage('command', {
          command: 'siren',
          enabled: false,
        });
      }, 3000);
    }
  };

  const toggleIndoorOutdoor = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate({
      ...camera,
      isIndoor: !isIndoor,
    });
  };

  const toggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite(camera.id);
    }
  };

  // No synthetic room imagery is used as a camera feed.
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{
        duration: 0.3,
        delay: Math.min(index * 0.05, 0.3),
      }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelect(camera)}
      className={`group relative bg-[#101C2B] rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer flex flex-col border ${
        isPrivacyBlurred
          ? 'border-[#FFC56E]/40 shadow-sm'
          : isOnline && isLive
          ? 'border-[#24364D] hover:border-[#36C5FF]/50 shadow-md hover:shadow-[0_8px_24px_rgba(54,197,255,0.12)]'
          : 'border-[#24364D]/80 opacity-90 hover:opacity-100'
      }`}
    >
      {/* 1. ANTEPRIMA VIDEO CON RAPPORTO D'ASPETTO UNIFORME 16:9 E IMMAGINE AMBIENTALE */}
      <div className="relative aspect-video w-full bg-[#080E18] overflow-hidden flex items-center justify-center select-none">
        {/* Render real feed OR photorealistic room surveillance preview */}
        {isOnline ? (
          <div
            className={`w-full h-full relative transition-all duration-300 ${
              isPrivacyBlurred ? 'filter blur-2xl opacity-20 scale-105' : 'filter-none opacity-100'
            }`}
          >
            {camera.type === 'phone' ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                {!isLive && (
                  <div className="absolute inset-x-3 bottom-3 z-20 rounded-lg bg-black/80 px-3 py-2 text-[11px] font-semibold text-amber-200 backdrop-blur-sm">
                    Flusso video non collegato
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#080E18] p-4 text-center">
                <Camera className="w-8 h-8 text-[#64748B]" />
                <p className="text-xs font-bold text-white">Flusso video non disponibile</p>
                <p className="text-[10px] text-[#99B0CA]">RTSP/ONVIF non ancora collegato a un relay compatibile</p>
                {camera.ip && <span className="text-[10px] font-mono text-[#64748B]">{camera.ip}:{camera.port || 554}</span>}
              </div>
            )}
          </div>
        ) : (
          /* SCHERMATA DEDICATA PER TELECAMERE OFFLINE */
          <div className="absolute inset-0 bg-[#080E18] flex flex-col items-center justify-center p-5 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#17283B] border border-[#24364D] flex items-center justify-center text-[#FF6577]">
              <WifiOff className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#F4F8FF]">Dispositivo non raggiungibile</p>
              <p className="text-[11px] text-[#99B0CA] mt-0.5">
                Flusso disconnesso dalla rete locale
              </p>
            </div>
            <div className="pt-1 flex items-center gap-2">
              <motion.button
                type="button"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.94 }}
                transition={{ duration: 0.16 }}
                onClick={handleManualReconnect}
                disabled={isReconnecting}
                className="px-3.5 py-1.5 rounded-xl bg-[#17283B] hover:bg-[#24364D] text-[#36C5FF] border border-[#24364D] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
                <span>{isReconnecting ? 'Tentativo in corso...' : 'Riprova'}</span>
              </motion.button>
            </div>
          </div>
        )}

        {/* PRIVACY BLUR OVERLAY (Attivo quando Privacy Mode è ON e telecamera interna) */}
        <AnimatePresence>
          {isPrivacyBlurred && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-30 bg-[#080E18]/85 backdrop-blur-xl flex flex-col items-center justify-center p-4 text-center space-y-2"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#FFC56E]/15 border border-[#FFC56E]/30 flex items-center justify-center text-[#FFC56E]">
                <EyeOff className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-[#FFC56E] flex items-center justify-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Privacy Mode attiva</span>
                </span>
                <p className="text-[11px] text-[#99B0CA] max-w-[200px]">
                  Telecamera interna in pausa. Nessun video trasmesso.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TOP STATUS BAR: Indicatore LIVE / Online + Stella Preferiti */}
        <div className="absolute top-2.5 inset-x-2.5 z-20 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Indicatore di stato */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide backdrop-blur-md border ${
                !isOnline
                  ? 'bg-[#FF6577]/20 text-[#FF6577] border-[#FF6577]/35'
                  : isPrivacyBlurred
                  ? 'bg-[#FFC56E]/20 text-[#FFC56E] border-[#FFC56E]/40'
                  : 'bg-[#101C2B]/85 text-[#45D7B0] border-[#45D7B0]/40'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  !isOnline
                    ? 'bg-[#FF6577]'
                    : isPrivacyBlurred
                    ? 'bg-[#FFC56E]'
                    : 'bg-[#45D7B0] animate-online-pulse'
                }`}
              />
              <span>
                {!isOnline ? 'Offline' : isPrivacyBlurred ? 'Privacy' : 'Online'}
              </span>
            </div>

            {/* LIVE Badge: Mostrato SOLO se il flusso è realmente attivo e non oscurato */}
            {isOnline && isLive && !isPrivacyBlurred && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#101C2B]/85 text-[#FF6577] border border-[#FF6577]/35 text-[9px] font-extrabold tracking-wider backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6577] animate-ping" />
                LIVE
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Phone Battery Level */}
            {camera.type === 'phone' && batteryLevel !== undefined && (
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono backdrop-blur-md border ${
                  batteryLevel < 20
                    ? 'bg-[#FF6577]/25 text-[#FF6577] border-[#FF6577]/40'
                    : 'bg-black/60 text-[#F4F8FF] border-white/10'
                }`}
              >
                {isCharging ? (
                  <BatteryCharging className="w-3 h-3 text-[#45D7B0]" />
                ) : (
                  <Battery className="w-3 h-3" />
                )}
                <span>{batteryLevel}%</span>
              </div>
            )}

            {/* Pulsante Preferiti con feedback elastico a molla */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.78 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              onClick={toggleFavorite}
              className={`p-1.5 rounded-full backdrop-blur-md border transition-colors cursor-pointer ${
                isFavorite
                  ? 'bg-[#FFC56E]/25 text-[#FFC56E] border-[#FFC56E]/45'
                  : 'bg-black/50 hover:bg-black/80 text-[#99B0CA] hover:text-[#F4F8FF] border-white/10'
              }`}
              title={isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            >
              <Star className={`w-3.5 h-3.5 transition-transform duration-200 ${isFavorite ? 'fill-[#FFC56E] scale-110' : ''}`} />
            </motion.button>
          </div>
        </div>

        {/* BOTTOM-RIGHT TRANSLUCENT PLAY BUTTON (Matching User Mockup) */}
        {!isPrivacyBlurred && isOnline && (
          <div className="absolute bottom-2.5 right-2.5 z-20 pointer-events-none">
            <div className="w-9 h-9 rounded-full bg-[#101C2B]/80 hover:bg-[#36C5FF] text-[#F4F8FF] hover:text-[#080E18] border border-white/15 backdrop-blur-md flex items-center justify-center transition-all shadow-lg group-hover:scale-110">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </div>
          </div>
        )}

        {/* Motion Alert Notification Pill */}
        <AnimatePresence>
          {motionAlert && !isPrivacyBlurred && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-10 left-2.5 bg-[#FF6577] text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md z-20"
            >
              <AlertTriangle className="w-3 h-3 animate-bounce" />
              <span>Movimento rilevato</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 2. INFORMAZIONI SCHEDA E METADATA COMPLETI */}
      <div className="p-3.5 bg-[#101C2B] border-t border-[#24364D] space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-[#F4F8FF] tracking-tight truncate group-hover:text-[#36C5FF] transition-colors">
              {camera.name}
            </h3>
            <p className="text-[11px] text-[#99B0CA] truncate">
              {brandDisplay()}
            </p>
          </div>

          {/* Three-dots menu button */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="p-1 rounded-lg text-[#99B0CA] hover:text-[#F4F8FF] hover:bg-[#17283B] transition-colors"
              title="Opzioni telecamera"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Popover Menu */}
            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute right-0 bottom-full mb-1 z-40 bg-[#17283B] border border-[#24364D] rounded-xl shadow-xl p-1.5 min-w-[150px] text-xs text-[#F4F8FF]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onSelect(camera);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#24364D] flex items-center gap-2"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-[#36C5FF]" />
                    <span>Dettagli &amp; Live</span>
                  </button>
                  <button
                    onClick={(e) => {
                      setIsMenuOpen(false);
                      toggleIndoorOutdoor(e);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#24364D] flex items-center gap-2 text-[#99B0CA]"
                  >
                    <Shield className="w-3.5 h-3.5 text-[#FFC56E]" />
                    <span>Imposta come {isIndoor ? 'Esterna' : 'Interna'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (confirm(`Eliminare "${camera.name}"?`)) {
                        onRemove(camera.id);
                      }
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#FF6577]/15 text-[#FF6577] flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Elimina</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Chips di Protocollo e Tipologia (Interna • RTSP • LAN) */}
        <div className="pt-2 border-t border-[#24364D]/60 flex items-center justify-between text-[11px] text-[#99B0CA]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
              isIndoor ? 'bg-[#17283B] text-[#99B0CA] border-[#24364D]' : 'bg-[#45D7B0]/15 text-[#45D7B0] border-[#45D7B0]/30'
            }`}>
              {isIndoor ? 'Interna' : 'Esterna'}
            </span>
            <span>•</span>
            <span className="font-mono text-[10px] text-[#36C5FF]">
              {camera.type === 'phone' ? 'P2P' : 'RTSP'}
            </span>
            <span>•</span>
            <span className="font-mono text-[10px] text-[#99B0CA]">
              LAN
            </span>
          </div>

          <span className="flex items-center gap-1 text-[10px] text-[#99B0CA]">
            <Clock className="w-3 h-3 text-[#36C5FF]" />
            <span>{lastActivity}</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Camera,
  Smartphone,
  QrCode,
  Copy,
  ExternalLink,
  Check,
  CheckCircle2,
  Sparkles,
  Wifi,
  ArrowRight,
  ShieldCheck,
  Lock,
  Server,
  Layers,
  AlertTriangle
} from 'lucide-react';
import { CameraDevice } from '../../types/camera';
import { generateQrDataUrl } from '../../utils/qr';
import { SignalingClient } from '../../services/webrtc';
import { apiFetch, getSignalingBaseUrl } from '../../services/api';

interface AddCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCamera: (camera: CameraDevice) => void;
}

export const AddCameraModal: React.FC<AddCameraModalProps> = ({
  isOpen,
  onClose,
  onAddCamera,
}) => {
  const [selectedType, setSelectedType] = useState<'none' | 'ip' | 'phone'>('none');

  // IP Camera Form State
  const [ipBrand, setIpBrand] = useState<'tapo' | 'ezviz' | 'reolink' | 'generic'>('tapo');
  const [ipName, setIpName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [ipPort, setIpPort] = useState('554');
  const [ipUsername, setIpUsername] = useState('');
  const [ipPassword, setIpPassword] = useState('');
  const [ipStreamPath, setIpStreamPath] = useState('');
  const [ipSimulateTest] = useState(false);
  const [ipTestStatus, setIpTestStatus] = useState<'idle' | 'checking' | 'error'>('idle');
  const [ipTestMessage, setIpTestMessage] = useState('Inserisci i dati reali della telecamera. Il relay RTSP/ONVIF non è ancora configurato, quindi la registrazione della telecamera IP resta disabilitata.');

  // Phone Camera Pairing State
  const [sessionId, setSessionId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [pairingError, setPairingError] = useState<string>('');
  const [pairingAttempt, setPairingAttempt] = useState(0);
  const [pairingUrl, setPairingUrl] = useState<string>('');
  const [phoneCamName, setPhoneCamName] = useState('Vecchio Telefono (Camera)');
  const [isPhoneConnected, setIsPhoneConnected] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [lanIp, setLanIp] = useState('localhost');

  const signalingRef = useRef<SignalingClient | null>(null);

  // Sync stream path when brand changes
  const handleBrandChange = (brand: 'tapo' | 'ezviz' | 'reolink' | 'generic') => {
    setIpBrand(brand);
    // Brand selection is only a label; do not silently invent a camera path or model.
    setIpName('');
    setIpStreamPath('');
    setIpTestStatus('idle');
    setIpTestMessage('Inserisci il nome e il percorso RTSP esatti del tuo dispositivo. La compatibilità va verificata dal relay.');
  };

  // Setup session when "phone" is selected
  useEffect(() => {
    if (selectedType !== 'phone' || !isOpen) {
      if (signalingRef.current) {
        signalingRef.current.destroy();
        signalingRef.current = null;
      }
      return;
    }

    let isMounted = true;

    async function initPhoneSession() {
      try {
        setPairingError('');
        setQrDataUrl('');
        setSessionId('');
        setPin('');
        setPairingUrl('');
        const serverBaseUrl = getSignalingBaseUrl();
        const lanRes = await apiFetch('/api/lan-info');
        const lanContentType = lanRes.headers.get('content-type') || '';
        if (!lanRes.ok || !lanContentType.includes('application/json')) {
          throw new Error(`L'indirizzo del server configurato (${serverBaseUrl}) non sta restituendo le API CamGuard. Apri Impostazioni → Server di segnalazione e inserisci l'URL del backend, non quello di una pagina web generica.`);
        }
        let hostUrl = serverBaseUrl;
        if (lanRes.ok) {
          const lanData = await lanRes.json();
          if (lanData.localIp && lanData.localIp !== 'localhost') {
            setLanIp(lanData.localIp);
            hostUrl = lanData.lanUrl || window.location.origin;
          }
        }

        const createRes = await apiFetch('/api/signaling/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: phoneCamName }),
        });

        const createContentType = createRes.headers.get('content-type') || '';
        if (!createRes.ok || !createContentType.includes('application/json')) {
          throw new Error(`Il server (${serverBaseUrl}) non ha restituito una risposta API valida (HTTP ${createRes.status}). Probabilmente l'URL configurato punta alla pagina web e non al backend CamGuard.`);
        }
        if (!isMounted) return;
        const data = await createRes.json();
        if (!data.sessionId || !data.pin) {
          throw new Error('Il server non ha restituito il codice PIN e la sessione. Controlla la configurazione del backend.');
        }
        const sId = data.sessionId;
        const sPin = data.pin;

        setSessionId(sId);
        setPin(sPin);

        const pairTarget = `${serverBaseUrl}/#camera&session=${sId}&pin=${sPin}`;
        setPairingUrl(pairTarget);

        const qrUrl = await generateQrDataUrl(pairTarget);
        if (isMounted) {
          setQrDataUrl(qrUrl);
        }

        const signaling = new SignalingClient(sId, 'viewer', sPin);
        signalingRef.current = signaling;

        signaling.onMessage((msg) => {
          if (msg.type === 'status' || msg.type === 'offer') {
            setIsPhoneConnected(true);
          }
        });
      } catch (err) {
        console.error('Failed to init phone pairing session', err);
        if (isMounted) {
          setPairingError(err instanceof Error ? err.message : 'Impossibile contattare il server di collegamento. Controlla la connessione e l’URL del server CamGuard.');
        }
      }
    }

    initPhoneSession();

    return () => {
      isMounted = false;
      if (signalingRef.current) {
        signalingRef.current.destroy();
        signalingRef.current = null;
      }
    };
  }, [selectedType, isOpen, pairingAttempt]);

  if (!isOpen) return null;

  const handleAddIpCamera = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAddress = ipAddress.trim();
    const cleanName = ipName.trim();
    const cleanPath = ipStreamPath.trim();
    const port = Number(ipPort);

    if (!cleanName || !cleanAddress || !cleanPath || !Number.isInteger(port) || port < 1 || port > 65535) {
      setIpTestStatus('error');
      setIpTestMessage('Compila nome, indirizzo IP, porta valida e percorso RTSP reale.');
      return;
    }

    // The browser cannot validate RTSP directly and this app has no RTSP relay yet.
    // Do not save the camera as online or claim a successful connection.
    setIpTestStatus('error');
    setIpTestMessage('Telecamera non aggiunta: il relay RTSP/ONVIF reale non è ancora configurato. Non verrà mostrata come collegata finché il flusso non sarà verificato.');
  };

  const handleAddPhoneCamera = () => {
    if (!sessionId || !pin || !isPhoneConnected) {
      setIpTestStatus('error');
      setIpTestMessage('Il telefono non risulta collegato al server di segnalazione. Non è stato aggiunto.');
      return;
    }
    const newPhoneCam: CameraDevice = {
      id: sessionId || 'phone_' + Math.random().toString(36).substring(2, 9),
      name: phoneCamName.trim() || 'Telefono Camera',
      type: 'phone',
      status: isPhoneConnected ? 'online' : 'connecting',
      sessionId,
      pin,
      signalingBaseUrl: window.localStorage.getItem('camguard_signaling_server_url') || window.location.origin,
      batteryLevel: 85,
      isCharging: true,
      facingMode: 'environment',
      torchOn: false,
      resolution: '1280x720',
      fps: 30,
      motionDetected: false,
      createdAt: Date.now(),
      lastSeen: Date.now(),
    };

    onAddCamera(newPhoneCam);
    onClose();
  };

  const copyPairingLink = () => {
    if (navigator.clipboard && pairingUrl) {
      navigator.clipboard.writeText(pairingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
        delayChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring' as const, damping: 20, stiffness: 260 },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0F14]/85 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="relative w-full max-w-xl bg-[#141A21] border border-[#1F2933] rounded-[26px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-[#1F2933] flex items-center justify-between bg-[#141A21]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#4FC3F7]/12 text-[#4FC3F7] flex items-center justify-center border border-[#4FC3F7]/25 shadow-sm">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Aggiungi telecamera
              </h2>
              <p className="text-xs text-[#94A3B8]">Configurazione nodo di sicurezza locale</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[#94A3B8] hover:text-white hover:bg-[#1C242E] rounded-xl transition-all active:scale-90"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* STEP 0: Selection */}
          {selectedType === 'none' && (
            <div className="space-y-4">
              <p className="text-xs uppercase font-bold tracking-wider text-[#94A3B8]">
                Seleziona sorgente video
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option 1: IP Camera RTSP */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setSelectedType('ip')}
                  className="group p-5 bg-[#1C242E]/70 hover:bg-[#1C242E] border border-[#1F2933] hover:border-[#4FC3F7]/50 rounded-[22px] text-left transition-all flex flex-col justify-between space-y-4 shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-[#141A21] group-hover:bg-[#4FC3F7]/12 text-[#94A3B8] group-hover:text-[#4FC3F7] flex items-center justify-center border border-[#1F2933] transition-colors">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#141A21] text-[#94A3B8] border border-[#1F2933]">
                      RTSP • ONVIF
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-[#4FC3F7] transition-colors">
                      Telecamera IP
                    </h3>
                    <p className="text-xs text-[#94A3B8] mt-1.5 leading-relaxed">
                      Telecamere di rete TP-Link Tapo, EZVIZ, Reolink o flussi RTSP locali.
                    </p>
                  </div>

                  <div className="flex items-center text-xs font-bold text-[#4FC3F7] gap-1 pt-1">
                    <span>Configura parametri</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.button>

                {/* Option 2: Old Phone as Camera */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setSelectedType('phone')}
                  className="group relative p-5 bg-[#1C242E]/70 hover:bg-[#1C242E] border border-[#1F2933] hover:border-[#4FC3F7]/50 rounded-[22px] text-left transition-all flex flex-col justify-between space-y-4 shadow-md"
                >
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#34D399]/15 text-[#34D399] border border-[#34D399]/30">
                      <Sparkles className="w-3 h-3" /> Alfred Style
                    </span>
                  </div>

                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-[#141A21] group-hover:bg-[#4FC3F7]/12 text-[#94A3B8] group-hover:text-[#4FC3F7] flex items-center justify-center border border-[#1F2933] transition-colors">
                      <Smartphone className="w-6 h-6" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-[#4FC3F7] transition-colors">
                      Telefono come telecamera
                    </h3>
                    <p className="text-xs text-[#94A3B8] mt-1.5 leading-relaxed">
                      Riutilizza un vecchio smartphone come telecamera di sicurezza P2P con QR code.
                    </p>
                  </div>

                  <div className="flex items-center text-xs font-bold text-[#4FC3F7] gap-1 pt-1">
                    <span>Genera QR code</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.button>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#1C242E]/50 border border-[#1F2933] text-xs text-[#94A3B8] flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-[#34D399] shrink-0" />
                <span>Nessun account esterno richiesto. Connessione confinata alla rete Wi-Fi locale.</span>
              </div>
            </div>
          )}

          {/* STEP 1: IP Camera Form (Sequential slide-up of fields) */}
          {selectedType === 'ip' && (
            <form onSubmit={handleAddIpCamera}>
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-4"
              >
                <div className="flex items-center justify-between pb-2 border-b border-[#1F2933]">
                  <span className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                    Parametri Connessione RTSP
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedType('none')}
                    className="text-xs text-[#4FC3F7] hover:underline"
                  >
                    ← Cambia modalità
                  </button>
                </div>

                {/* Brand Presets */}
                <motion.div variants={itemVariants}>
                  <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">
                    Marca / Preset Rapido
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['tapo', 'ezviz', 'reolink', 'generic'] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => handleBrandChange(b)}
                        className={`py-2 px-2 rounded-xl text-xs font-semibold border text-center transition-all ${
                          ipBrand === b
                            ? 'bg-[#4FC3F7]/15 border-[#4FC3F7] text-[#4FC3F7] shadow-sm'
                            : 'bg-[#1C242E] border-[#1F2933] text-[#94A3B8] hover:border-[#2D3A47]'
                        }`}
                      >
                        {b === 'generic' ? 'Generico' : b.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </motion.div>

                {/* Camera Name */}
                <motion.div variants={itemVariants}>
                  <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                    Nome Dispositivo
                  </label>
                  <input
                    type="text"
                    required
                    value={ipName}
                    onChange={(e) => setIpName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0B0F14] border border-[#1F2933] rounded-xl text-sm text-white focus:outline-none focus:border-[#4FC3F7] transition-colors"
                    placeholder="Nome reale della telecamera"
                  />
                </motion.div>

                {/* IP Address and Port */}
                <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                      Indirizzo IP Locale
                    </label>
                    <input
                      type="text"
                      required
                      value={ipAddress}
                      onChange={(e) => setIpAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#0B0F14] border border-[#1F2933] rounded-xl text-sm text-white font-mono focus:outline-none focus:border-[#4FC3F7]"
                      placeholder="Indirizzo IP della telecamera"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                      Porta RTSP
                    </label>
                    <input
                      type="text"
                      value={ipPort}
                      onChange={(e) => setIpPort(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#0B0F14] border border-[#1F2933] rounded-xl text-sm text-white font-mono focus:outline-none focus:border-[#4FC3F7]"
                      placeholder="554"
                    />
                  </div>
                </motion.div>

                {/* Auth */}
                <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                      Nome Utente
                    </label>
                    <input
                      type="text"
                      value={ipUsername}
                      onChange={(e) => setIpUsername(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#0B0F14] border border-[#1F2933] rounded-xl text-sm text-white focus:outline-none focus:border-[#4FC3F7]"
                      placeholder="admin"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      value={ipPassword}
                      onChange={(e) => setIpPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#0B0F14] border border-[#1F2933] rounded-xl text-sm text-white focus:outline-none focus:border-[#4FC3F7]"
                      placeholder="••••••••"
                    />
                  </div>
                </motion.div>

                {/* Stream Path */}
                <motion.div variants={itemVariants}>
                  <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                    Percorso Flusso RTSP
                  </label>
                  <input
                    type="text"
                    value={ipStreamPath}
                    onChange={(e) => setIpStreamPath(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0B0F14] border border-[#1F2933] rounded-xl text-sm text-white font-mono focus:outline-none focus:border-[#4FC3F7]"
                    placeholder="Percorso RTSP dichiarato dal produttore"
                  />
                  <p className="text-[11px] text-[#64748B] mt-1 font-mono">
                    Tapo: /stream1 • EZVIZ: /h264Preview_01_main
                  </p>
                </motion.div>

                <motion.div variants={itemVariants} className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                  <p className="font-bold">Connessione RTSP non ancora disponibile</p>
                  <p className="mt-1">Questa versione non dispone ancora del relay video necessario a visualizzare flussi RTSP. Non verrà creata una telecamera demo o dichiarata online senza verifica reale.</p>
                  <p className="mt-2">{ipTestMessage}</p>
                </motion.div>

                {/* Shimmer Submit Button */}
                <motion.div variants={itemVariants} className="pt-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedType('none')}
                    className="px-4 py-2.5 bg-[#1C242E] hover:bg-[#242F3B] text-[#CBD5E1] rounded-xl text-xs font-semibold transition-colors"
                  >
                    Indietro
                  </button>
                  <button
                    type="submit"
                    disabled
                    className="px-6 py-2.5 bg-[#475569] text-slate-200 font-extrabold rounded-xl text-xs tracking-wider uppercase cursor-not-allowed opacity-70"
                    title="Disponibile quando sarà configurato il relay RTSP/ONVIF"
                  >
                    RTSP non ancora disponibile
                  </button>
                </motion.div>
              </motion.div>
            </form>
          )}

          {/* STEP 2: Phone Camera Pairing (AlfredCamera Flow) */}
          {selectedType === 'phone' && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-5"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#1F2933]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                    Abbinamento Telefono → Viewer
                  </span>
                  {isPhoneConnected ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#34D399]/20 text-[#34D399] border border-[#34D399]/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-online-pulse" />
                      COLLEGATO!
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#4FC3F7]/15 text-[#4FC3F7] border border-[#4FC3F7]/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                      In attesa del vecchio telefono...
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedType('none')}
                  className="text-xs text-[#4FC3F7] hover:underline"
                >
                  ← Cambia modalità
                </button>
              </div>

              {/* Instructions Banner */}
              <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 bg-[#1C242E] rounded-2xl border border-[#1F2933]">
                  <span className="font-bold text-[#4FC3F7] block mb-1">1. Vecchio telefono</span>
                  <span className="text-[#94A3B8]">Connettilo alla stessa rete Wi-Fi locale.</span>
                </div>
                <div className="p-3 bg-[#1C242E] rounded-2xl border border-[#1F2933]">
                  <span className="font-bold text-[#4FC3F7] block mb-1">2. Inquadra il QR</span>
                  <span className="text-[#94A3B8]">Premi &quot;Diventa telecamera&quot; e scansiona il codice.</span>
                </div>
                <div className="p-3 bg-[#1C242E] rounded-2xl border border-[#1F2933]">
                  <span className="font-bold text-[#4FC3F7] block mb-1">3. Streaming P2P</span>
                  <span className="text-[#94A3B8]">Il video appare live a latenza ultra-bassa.</span>
                </div>
              </motion.div>

              {/* QR and PIN Box */}
              <motion.div
                variants={itemVariants}
                className="p-5 bg-[#0B0F14] rounded-[24px] border border-[#1F2933] flex flex-col sm:flex-row items-center gap-6 justify-center"
              >
                {pairingError && (
                  <div role="alert" className="w-full rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                    <strong className="block mb-1">Collegamento non disponibile</strong>
                    {pairingError}
                    <button
                      type="button"
                      onClick={() => setPairingAttempt((attempt) => attempt + 1)}
                      className="mt-3 rounded-lg border border-rose-300/30 px-3 py-2 text-xs font-bold text-rose-100 hover:bg-rose-400/10"
                    >
                      Riprova collegamento
                    </button>
                  </div>
                )}

                {/* QR Code */}
                <div className="shrink-0 flex flex-col items-center">
                  <div className="relative p-2.5 bg-[#141A21] border-2 border-[#4FC3F7]/40 rounded-2xl shadow-xl">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="QR Code accoppiamento telefono"
                        className="w-44 h-44 rounded-xl object-contain"
                      />
                    ) : pairingError ? (
                      <div className="w-44 h-44 flex flex-col items-center justify-center gap-2 text-[#FCA5A5] text-center px-4">
                        <AlertTriangle className="w-8 h-8" />
                        <span className="text-xs font-semibold">QR non disponibile</span>
                      </div>
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center text-[#64748B]">
                        <span className="w-6 h-6 border-2 border-[#4FC3F7] border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {isPhoneConnected && (
                      <div className="absolute inset-0 bg-[#0B0F14]/90 rounded-2xl flex flex-col items-center justify-center text-[#34D399] font-bold p-3 text-center">
                        <CheckCircle2 className="w-10 h-10 mb-1 text-[#34D399]" />
                        <span>Telefono Agganciato!</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[#64748B] mt-2">
                    Inquadra con fotocamera
                  </span>
                </div>

                {/* PIN and Actions */}
                <div className="flex-1 space-y-3.5 text-center sm:text-left">
                  <div>
                    <span className="text-xs text-[#94A3B8] font-medium">Oppure inserisci il codice PIN:</span>
                    <div className="mt-1.5 inline-block px-4 py-2 bg-[#141A21] border border-[#1F2933] rounded-2xl">
                      <span className="font-mono text-2xl font-black tracking-widest text-[#4FC3F7]">
                        {pin || '------'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">
                      Nome Telecamera
                    </label>
                    <input
                      type="text"
                      value={phoneCamName}
                      onChange={(e) => setPhoneCamName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#141A21] border border-[#1F2933] rounded-xl text-sm text-white focus:outline-none focus:border-[#4FC3F7]"
                      placeholder="Es. Salotto (Vecchio Xiaomi)"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={copyPairingLink}
                      className="px-3 py-1.5 bg-[#141A21] hover:bg-[#1C242E] border border-[#1F2933] text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-[#34D399]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Copiato!' : 'Copia link'}</span>
                    </button>

                    <a
                      href={pairingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-[#141A21] hover:bg-[#1C242E] border border-[#1F2933] text-[#4FC3F7] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Test in nuova scheda</span>
                    </a>
                  </div>
                </div>
              </motion.div>

              {/* Final Confirm Button with Shimmer */}
              <motion.div variants={itemVariants} className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedType('none')}
                  className="px-4 py-2.5 bg-[#1C242E] hover:bg-[#242F3B] text-[#CBD5E1] rounded-xl text-xs font-semibold transition-colors"
                >
                  Indietro
                </button>
                <button
                  type="button"
                  onClick={handleAddPhoneCamera}
                  className="animate-shimmer px-6 py-2.5 bg-gradient-to-r from-[#4FC3F7] to-[#34D399] text-black font-extrabold rounded-xl text-xs tracking-wider uppercase transition-all shadow-lg shadow-[#4FC3F7]/25 active:scale-95 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{isPhoneConnected ? 'Aggiungi Telefono Connesso' : 'Salva Dispositivo'}</span>
                </button>
              </motion.div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

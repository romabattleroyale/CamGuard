import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Smartphone,
  Plus,
  ShieldCheck,
  Wifi,
  Search,
  X,
  Radio,
  ArrowLeft,
  Bell,
  Activity,
  Settings,
  LayoutGrid,
  RefreshCw,
  Clock,
  ShieldAlert,
  ChevronRight,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Shield,
  Download,
  Video,
  Plane,
  Star,
  WifiOff,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Info,
  Layers,
  MapPin,
  User,
  Calendar,
  Grid,
  List
} from 'lucide-react';
import { CameraDevice } from './types/camera';
import { CameraTile } from './components/dashboard/CameraTile';
import { CameraDetailModal } from './components/dashboard/CameraDetailModal';
import { HouseMapTab } from './components/dashboard/HouseMapTab';
import { AddCameraModal } from './components/modals/AddCameraModal';
import { PhoneCameraScreen } from './components/phoneCamera/PhoneCameraScreen';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { DailyRecapModal } from './components/dashboard/DailyRecapModal';
import { playChimeSound, playSirenSound, stopSirenSound } from './utils/audio';
import { ASSETS } from './assets/images';
import { apiFetch } from './services/api';

const STORAGE_KEY = 'camguard_saved_cameras_v2';
const FAVORITES_KEY = 'camguard_favorite_cameras_v1';
const RECORDINGS_KEY = 'camguard_recordings_count_v1';

export type SecurityEventType = 'motion' | 'person' | 'disconnection' | 'reconnection' | 'recording' | 'alarm';
export type SecurityEventSeverity = 'info' | 'warning' | 'alert';

export interface SecurityEvent {
  id: string;
  cameraId?: string;
  cameraName: string;
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  description: string;
  timeAgo: string;
  timestamp: number;
  roomImage: string;
}

export type NavDestination = 'welcome' | 'camera_mode' | 'control_center';

export default function App() {
  const [currentDestination, setCurrentDestination] = useState<NavDestination>('welcome');
  const [pairedSessionId, setPairedSessionId] = useState<string | undefined>(undefined);
  const [pairedPin, setPairedPin] = useState<string | undefined>(undefined);
  const [bottomTab, setBottomTab] = useState<'centro' | 'eventi' | 'mappa' | 'impostazioni'>('centro');

  // Cameras State
  const [cameras, setCameras] = useState<CameraDevice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Remove old seeded sample devices and any camera explicitly marked simulated.
          const demoIds = new Set(['ip_tapo_c200', 'ip_giardino_c310', 'ip_retro_garage', 'ip_ezviz_c6n']);
          const realCameras = parsed.filter((camera: CameraDevice) =>
            camera &&
            typeof camera.id === 'string' &&
            !demoIds.has(camera.id) &&
            camera.isSimulated !== true
          );
          if (realCameras.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(realCameras));
          }
          return realCameras;
        }
      }
    } catch {
      // Ignore corrupted saved data and start with an empty camera list.
    }
    return [];
  });

  // Favorite Camera IDs
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Features State
  const [privacyMode, setPrivacyMode] = useState<boolean>(false);
  const [showPrivacyBanner, setShowPrivacyBanner] = useState<boolean>(false);
  const [isRecapModalOpen, setIsRecapModalOpen] = useState<boolean>(false);
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid');

  // Quick action shortcut states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingsCount, setRecordingsCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(RECORDINGS_KEY);
      return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
    } catch {
      return 0;
    }
  });
  const [isAlarmArmed, setIsAlarmArmed] = useState<boolean>(false);
  const [isVacationMode, setIsVacationMode] = useState<boolean>(false);
  const [actionFeedbackToast, setActionFeedbackToast] = useState<string | null>(null);

  // Search & Filtering
  const [eventsList, setEventsList] = useState<SecurityEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [eventsFilter, setEventsFilter] = useState<'all' | 'motion' | 'person'>('all');

  // Modals & LAN
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<CameraDevice | null>(null);
  const [lanInfo, setLanInfo] = useState<{ localIp: string; lanUrl: string } | null>(null);
  const [signalingServerUrl, setSignalingServerUrl] = useState<string>(() => {
    try { return localStorage.getItem('camguard_signaling_server_url') || ''; } catch { return ''; }
  });
  const [serverCheckStatus, setServerCheckStatus] = useState<'idle' | 'checking' | 'online' | 'error'>('idle');
  const [serverCheckMessage, setServerCheckMessage] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const currentHour = new Date().getHours();

  const normalizeSignalingServerUrl = (value: string) => value.trim().replace(/\/+$/, '');

  const saveSignalingServerUrl = () => {
    const normalized = normalizeSignalingServerUrl(signalingServerUrl);
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      setServerCheckStatus('error');
      setServerCheckMessage('Inserisci un indirizzo completo che inizi con https:// o http://.');
      return;
    }
    try {
      if (normalized) localStorage.setItem('camguard_signaling_server_url', normalized);
      else localStorage.removeItem('camguard_signaling_server_url');
      setSignalingServerUrl(normalized);
      setServerCheckStatus('idle');
      setServerCheckMessage('Indirizzo salvato. Le nuove connessioni useranno questo server.');
      window.location.reload();
    } catch {
      setServerCheckStatus('error');
      setServerCheckMessage('Impossibile salvare l’indirizzo sul dispositivo.');
    }
  };

  const testSignalingServer = async () => {
    const baseUrl = normalizeSignalingServerUrl(signalingServerUrl) || window.location.origin;
    setServerCheckStatus('checking');
    setServerCheckMessage('Verifica della connessione...');
    try {
      const response = await fetch(`${baseUrl.replace(/\\/+$/, '')}/api/lan-info`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw new Error('Il server risponde con una pagina web invece che con le API CamGuard.');
      const info = await response.json();
      setServerCheckStatus('online');
      setServerCheckMessage(`Server raggiungibile · ${info.localIp || new URL(baseUrl).host}`);
    } catch (error) {
      setServerCheckStatus('error');
      setServerCheckMessage('Server non raggiungibile da questo dispositivo. Controlla URL, rete e certificato HTTPS.');
    }
  };

  // Persist cameras
  const saveCameras = (newCameras: CameraDevice[]) => {
    setCameras(newCameras);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newCameras));
    } catch (e) {
      console.warn('Failed to save cameras', e);
    }
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const onlineCount = useMemo(() => cameras.filter((c) => c.status === 'online').length, [cameras]);
  const offlineCount = useMemo(() => cameras.filter((c) => c.status === 'offline').length, [cameras]);
  const isFullyProtected = useMemo(() => cameras.length > 0 && offlineCount === 0, [cameras, offlineCount]);

  const greeting = useMemo(() => {
    if (currentHour < 12) return 'Buongiorno';
    if (currentHour < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  }, [currentHour]);

  // Preserve pairing parameters from a QR link before clearing the URL hash.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#camera')) {
      const query = hash.slice('#camera'.length).replace(/^&/, '');
      const params = new URLSearchParams(query);
      const sessionId = params.get('session');
      const pin = params.get('pin');
      if (sessionId) {
        setPairedSessionId(sessionId);
        setPairedPin(pin || undefined);
        setCurrentDestination('camera_mode');
      }
    }

    if (hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // Back button handler
  useEffect(() => {
    const handlePopState = () => {
      setCurrentDestination('welcome');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (destination: NavDestination) => {
    if (destination === 'welcome') {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      setCurrentDestination('welcome');
    } else {
      window.history.pushState({ destination }, '', window.location.pathname);
      setCurrentDestination(destination);
    }
  };

  useEffect(() => {
    apiFetch('/api/lan-info')
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setLanInfo({
            localIp: data.localIp,
            lanUrl: data.lanUrl,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await apiFetch('/api/lan-info');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.json();
      setLanInfo((prev) => prev);
      showToast('Server raggiungibile. Lo stato delle telecamere non è stato alterato.');
    } catch {
      showToast('Server non raggiungibile: controlla la connessione.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddCamera = (newCam: CameraDevice) => {
    const updated = [newCam, ...cameras];
    saveCameras(updated);
    setIsAddModalOpen(false);
    setIsAddMenuOpen(false);

    showToast(`Telecamera "${newCam.name}" aggiunta`);
  };

  const handleRemoveCamera = (id: string) => {
    const target = cameras.find((c) => c.id === id);
    const updated = cameras.filter((c) => c.id !== id);
    saveCameras(updated);
    if (selectedCamera?.id === id) {
      setSelectedCamera(null);
    }
    showToast(`"${target?.name || 'Telecamera'}" rimossa`);
  };

  const handleUpdateCamera = (updatedCam: CameraDevice) => {
    const updated = cameras.map((c) => (c.id === updatedCam.id ? updatedCam : c));
    saveCameras(updated);
  };

  const handleReconnectCamera = (targetCam: CameraDevice) => {
    // The card performs a real signaling reachability check for phone nodes.
    // IP camera RTSP reachability is not implemented yet; never mark it online optimistically.
    if (targetCam.type === 'ip') {
      saveCameras(cameras.map((camera) =>
        camera.id === targetCam.id ? { ...camera, status: 'offline' as const } : camera
      ));
      showToast('Verifica RTSP/ONVIF non disponibile: telecamera non dichiarata online.');
      return;
    }
    showToast('La riconnessione viene verificata tramite la sessione del telefono.');
  };

  const togglePrivacyMode = () => {
    const next = !privacyMode;
    setPrivacyMode(next);
    if (next) {
      setShowPrivacyBanner(true);
      showToast('Privacy Mode attiva: telecamere interne offuscate');
    } else {
      setShowPrivacyBanner(false);
      showToast('Privacy Mode disattivata: streaming attivo');
    }
  };

  const showToast = (msg: string) => {
    setActionFeedbackToast(msg);
    setTimeout(() => {
      setActionFeedbackToast(null);
    }, 2800);
  };

  // Filtered Cameras
  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = cam.name.toLowerCase().includes(q);
        const matchesBrand = (cam.brand || '').toLowerCase().includes(q);
        const matchesIp = (cam.ip || '').toLowerCase().includes(q);
        if (!matchesName && !matchesBrand && !matchesIp) return false;
      }
      if (statusFilter === 'online' && cam.status !== 'online') return false;
      if (statusFilter === 'offline' && cam.status !== 'offline') return false;
      return true;
    });
  }, [cameras, searchQuery, statusFilter]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    if (eventsFilter === 'all') return eventsList;
    return eventsList.filter((e) => e.type === eventsFilter);
  }, [eventsList, eventsFilter]);

  // NAVIGATION RENDERING
  if (currentDestination === 'welcome') {
    return (
      <WelcomeScreen
        onSelectCameraMode={() => navigateTo('camera_mode')}
        onSelectControlCenter={() => navigateTo('control_center')}
      />
    );
  }

  if (currentDestination === 'camera_mode') {
    return (
      <PhoneCameraScreen
        initialSessionId={pairedSessionId}
        initialPin={pairedPin}
        onExit={() => {
          setPairedSessionId(undefined);
          setPairedPin(undefined);
          navigateTo('welcome');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#080E18] text-[#F4F8FF] flex flex-col font-sans selection:bg-[#36C5FF]/30">
      {/* Action Feedback Toast */}
      <AnimatePresence>
        {actionFeedbackToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#101C2B] border border-[#24364D] text-[#F4F8FF] px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold"
          >
            <CheckCircle2 className="w-4 h-4 text-[#45D7B0] shrink-0" />
            <span>{actionFeedbackToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOP APP BAR (Screen 1 in mockup) */}
      <header className="sticky top-0 z-30 bg-[#080E18]/92 backdrop-blur-md border-b border-[#24364D] transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          {/* Left: Back / Logo */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigateTo('welcome')}
              className="p-1.5 rounded-xl bg-[#101C2B] hover:bg-[#17283B] text-[#36C5FF] border border-[#24364D] transition-colors active:scale-95"
              title="Schermata iniziale"
            >
              <div className="w-7 h-7 rounded-lg bg-[#36C5FF]/15 border border-[#36C5FF]/30 flex items-center justify-center text-[#36C5FF]">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </button>

            <span className="text-base font-black tracking-tight text-[#F4F8FF]">
              Cam<span className="text-[#36C5FF]">Gest</span>
            </span>
          </div>

          {/* Right: Refresh Status, Notifications, Settings, Add Button */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={handlePullRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-[#101C2B] hover:bg-[#17283B] text-[#99B0CA] hover:text-[#36C5FF] border border-[#24364D] transition-colors cursor-pointer disabled:opacity-50"
              title="Sincronizza stato LAN"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#36C5FF]' : ''}`} />
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setBottomTab('eventi')}
              className="p-2 rounded-xl bg-[#101C2B] hover:bg-[#17283B] text-[#99B0CA] hover:text-[#F4F8FF] border border-[#24364D] transition-colors relative cursor-pointer"
              title="Notifiche eventi"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#36C5FF]" />
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setBottomTab('impostazioni')}
              className="p-2 rounded-xl bg-[#101C2B] hover:bg-[#17283B] text-[#99B0CA] hover:text-[#F4F8FF] border border-[#24364D] transition-colors cursor-pointer"
              title="Impostazioni"
            >
              <Settings className="w-4 h-4" />
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => setIsAddModalOpen(true)}
              className="w-8 h-8 rounded-xl bg-[#36C5FF] hover:bg-[#20b8f5] text-[#080E18] flex items-center justify-center font-bold shadow-md shadow-[#36C5FF]/20 transition-colors cursor-pointer"
              title="Aggiungi telecamera"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
            </motion.button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 pb-28 sm:pb-24">
        {/* Privacy Banner if active */}
        <AnimatePresence>
          {showPrivacyBanner && privacyMode && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3.5 rounded-2xl bg-[#FFC56E]/15 border border-[#FFC56E]/30 flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <EyeOff className="w-4 h-4 text-[#FFC56E] shrink-0" />
                <span className="text-xs text-[#F4F8FF]">
                  <strong>Le telecamere interne sono in pausa.</strong> Nessuno può visualizzarle.
                </span>
              </div>
              <button
                onClick={() => setShowPrivacyBanner(false)}
                className="text-[#99B0CA] hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* 1. TAB CENTRO (Dashboard principale) */}
          {bottomTab === 'centro' && (
            <motion.div
              key="tab-centro"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              {/* HERO CARD FOTOGRAFICA (Stagger 1) */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-3xl overflow-hidden border border-[#24364D] shadow-2xl p-5 sm:p-7 select-none"
              >
                {/* Modern Villa Night Background */}
                <img
                  src={ASSETS.dashboardHeaderHouse}
                  alt="Smart home architecture at night"
                  className="absolute inset-0 w-full h-full object-cover object-center brightness-75 scale-105"
                />

                {/* Layered Deep Night Blue Gradients */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#080E18]/95 via-[#080E18]/75 to-[#080E18]/30" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080E18] via-transparent to-[#080E18]/40" />

                {/* Hero Content */}
                <div className="relative z-10 space-y-3 max-w-lg">
                  <span className="text-xs sm:text-sm font-medium text-[#99B0CA]">
                    {greeting},
                  </span>
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                    La tua casa, <span className="text-[#36C5FF] drop-shadow-[0_0_20px_rgba(54,197,255,0.4)]">sotto controllo</span>
                  </h1>

                  {/* Status Badges */}
                  <div className="pt-1 flex items-center gap-2 flex-wrap text-xs">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#080E18]/85 backdrop-blur-md border border-[#45D7B0]/40 text-[#45D7B0] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#45D7B0] animate-online-pulse" />
                      <span>{isFullyProtected ? 'Sistema protetto' : 'Attenzione perimetrale'}</span>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#080E18]/85 backdrop-blur-md border border-[#24364D] text-[#99B0CA] font-mono">
                      <Radio className="w-3.5 h-3.5 text-[#36C5FF]" />
                      <span>LAN 100% Locale</span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* PRIVACY MODE TOGGLE CARD (Stagger 2) */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] shadow-md flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200 ${
                    privacyMode
                      ? 'bg-[#FFC56E]/20 text-[#FFC56E] border border-[#FFC56E]/40'
                      : 'bg-[#36C5FF]/15 text-[#36C5FF] border border-[#36C5FF]/30'
                  }`}>
                    {privacyMode ? <EyeOff className="w-5 h-5 text-[#FFC56E]" /> : <Eye className="w-5 h-5" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#99B0CA] block">
                      Privacy Mode
                    </span>
                    <span className={`text-xs font-bold transition-colors ${privacyMode ? 'text-[#FFC56E]' : 'text-[#45D7B0]'}`}>
                      {privacyMode ? 'Attiva (Telecamere interne offuscate)' : 'Disattivata (Streaming attivo)'}
                    </span>
                  </div>
                </div>

                {/* Animated Spring Toggle Switch */}
                <button
                  type="button"
                  onClick={togglePrivacyMode}
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                    privacyMode ? 'bg-[#FFC56E]' : 'bg-[#17283B] border border-[#24364D]'
                  }`}
                >
                  <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={`w-5 h-5 rounded-full bg-white shadow-md ${privacyMode ? 'ml-auto' : ''}`}
                  />
                </button>
              </motion.div>

              {/* 6 COMPACT STATISTICS CARDS (With Skeleton Loading during isRefreshing) */}
              {isRefreshing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={`skel-${i}`}
                      className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] animate-shimmer space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <div className="w-16 h-3 bg-[#17283B] rounded" />
                        <div className="w-7 h-7 bg-[#17283B] rounded-lg" />
                      </div>
                      <div className="w-10 h-7 bg-[#17283B] rounded mt-2" />
                      <div className="w-14 h-2.5 bg-[#17283B] rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {[
                    {
                      title: 'Telecamere',
                      value: cameras.length,
                      subtitle: 'Configurate',
                      icon: Camera,
                      color: 'text-[#36C5FF]',
                      bgColor: 'bg-[#36C5FF]/15',
                      fontMono: true,
                    },
                    {
                      title: 'Online',
                      value: onlineCount,
                      subtitle: 'In funzione',
                      icon: Wifi,
                      color: 'text-[#45D7B0]',
                      bgColor: 'bg-[#45D7B0]/15',
                      pulse: true,
                      fontMono: true,
                    },
                    {
                      title: 'Eventi oggi',
                      value: eventsList.length,
                      subtitle: 'Ultime 24 ore',
                      icon: Activity,
                      color: 'text-[#F4F8FF]',
                      bgColor: 'bg-[#FF6577]/15',
                      fontMono: true,
                    },
                    {
                      title: 'Registrazioni',
                      value: recordingsCount,
                      subtitle: 'Clip salvate',
                      icon: Video,
                      color: 'text-[#F4F8FF]',
                      bgColor: 'bg-[#FFC56E]/15',
                      fontMono: true,
                    },
                    {
                      title: 'Allarmi',
                      value: isAlarmArmed ? '1' : '0',
                      subtitle: 'Nessun allarme',
                      icon: ShieldAlert,
                      color: 'text-[#F4F8FF]',
                      bgColor: 'bg-[#FF6577]/15',
                      fontMono: true,
                    },
                    {
                      title: 'Rete Locale',
                      value: 'LAN',
                      subtitle: 'Connessa',
                      icon: Radio,
                      color: 'text-[#36C5FF]',
                      bgColor: 'bg-[#36C5FF]/15',
                      fontMono: true,
                    },
                  ].map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                      <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.26,
                          delay: 0.06 + idx * 0.03,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] hover:border-[#36C5FF]/30 shadow-sm flex flex-col justify-between transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[11px] font-semibold flex items-center gap-1 ${stat.pulse ? 'text-[#45D7B0]' : 'text-[#99B0CA]'}`}>
                            {stat.pulse && <span className="w-1.5 h-1.5 rounded-full bg-[#45D7B0] animate-online-pulse" />}
                            {stat.title}
                          </span>
                          <div className={`w-7 h-7 rounded-lg ${stat.bgColor} flex items-center justify-center shrink-0`}>
                            <Icon className="w-4 h-4 text-current" />
                          </div>
                        </div>
                        <div className="mt-2">
                          <span className={`text-2xl font-black ${stat.color} ${stat.fontMono ? 'font-mono' : ''}`}>
                            {stat.value}
                          </span>
                          <span className="text-[10px] text-[#99B0CA] block mt-0.5">{stat.subtitle}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </section>
              )}

              {/* ATTIVITÀ RECENTI (Con entrata a cascata) */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#F4F8FF] tracking-tight">Attività recenti</h2>
                  <button
                    onClick={() => setBottomTab('eventi')}
                    className="text-xs font-semibold text-[#36C5FF] hover:underline cursor-pointer"
                  >
                    Vedi tutti →
                  </button>
                </div>

                <div className="space-y-2.5">
                  {eventsList.slice(0, 3).map((evt, idx) => (
                    <motion.div
                      key={evt.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.24, delay: 0.14 + idx * 0.035 }}
                      whileHover={{ x: 3 }}
                      onClick={() => setBottomTab('eventi')}
                      className="p-3 rounded-2xl bg-[#101C2B] border border-[#24364D] hover:border-[#36C5FF]/40 shadow-sm flex items-center justify-between gap-3 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Event Type Icon in colored square */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          evt.type === 'person'
                            ? 'bg-[#45D7B0]/15 text-[#45D7B0]'
                            : evt.type === 'disconnection'
                            ? 'bg-[#FF6577]/15 text-[#FF6577]'
                            : 'bg-[#36C5FF]/15 text-[#36C5FF]'
                        }`}>
                          {evt.type === 'person' && <User className="w-4 h-4" />}
                          {evt.type === 'disconnection' && <WifiOff className="w-4 h-4" />}
                          {evt.type === 'motion' && <Activity className="w-4 h-4" />}
                        </div>

                        {/* Event Text */}
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[#F4F8FF] truncate">{evt.description}</h4>
                          <p className="text-[11px] text-[#99B0CA] truncate">{evt.cameraName}</p>
                        </div>
                      </div>

                      {/* Right: Time & Room Thumbnail */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-mono text-[#99B0CA]">{evt.timeAgo}</span>
                        <div className="w-12 h-9 rounded-lg overflow-hidden border border-[#24364D] shrink-0">
                          <img src={evt.roomImage} alt={evt.cameraName} className="w-full h-full object-cover" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* SEZIONE: LE TUE TELECAMERE */}
              <section className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#F4F8FF] tracking-tight">Le tue telecamere</h2>
                    <p className="text-xs text-[#45D7B0] flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#45D7B0] animate-online-pulse" />
                      <span>{onlineCount} di {cameras.length} online</span>
                    </p>
                  </div>

                  {/* Grid / List View Toggle */}
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <button
                      onClick={() => setViewLayout('grid')}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        viewLayout === 'grid'
                          ? 'bg-[#36C5FF]/15 text-[#36C5FF] border-[#36C5FF]/40'
                          : 'bg-[#101C2B] text-[#99B0CA] border-[#24364D]'
                      }`}
                      title="Vista griglia"
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewLayout('list')}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        viewLayout === 'list'
                          ? 'bg-[#36C5FF]/15 text-[#36C5FF] border-[#36C5FF]/40'
                          : 'bg-[#101C2B] text-[#99B0CA] border-[#24364D]'
                      }`}
                      title="Vista elenco"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-[#99B0CA] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cerca per nome, marca o IP..."
                    className="w-full pl-10 pr-8 py-2.5 rounded-2xl bg-[#101C2B] border border-[#24364D] text-xs text-[#F4F8FF] placeholder-[#99B0CA] focus:outline-none focus:border-[#36C5FF] transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#99B0CA] hover:text-[#F4F8FF] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto text-xs pb-1">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3.5 py-1.5 rounded-xl font-semibold transition-colors shrink-0 cursor-pointer ${
                      statusFilter === 'all'
                        ? 'bg-[#36C5FF] text-[#080E18] font-bold shadow-sm'
                        : 'bg-[#101C2B] text-[#99B0CA] border border-[#24364D]'
                    }`}
                  >
                    Tutte ({cameras.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('online')}
                    className={`px-3.5 py-1.5 rounded-xl font-semibold transition-colors shrink-0 cursor-pointer ${
                      statusFilter === 'online'
                        ? 'bg-[#36C5FF] text-[#080E18] font-bold shadow-sm'
                        : 'bg-[#101C2B] text-[#99B0CA] border border-[#24364D]'
                    }`}
                  >
                    Online ({onlineCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter('offline')}
                    className={`px-3.5 py-1.5 rounded-xl font-semibold transition-colors shrink-0 cursor-pointer ${
                      statusFilter === 'offline'
                        ? 'bg-[#36C5FF] text-[#080E18] font-bold shadow-sm'
                        : 'bg-[#101C2B] text-[#99B0CA] border border-[#24364D]'
                    }`}
                  >
                    Offline ({offlineCount})
                  </button>
                </div>

                {/* Camera Cards Grid or Skeleton when refreshing */}
                {isRefreshing ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={`cam-skel-${i}`}
                        className="rounded-2xl bg-[#101C2B] border border-[#24364D] overflow-hidden animate-shimmer"
                      >
                        <div className="aspect-video bg-[#17283B]" />
                        <div className="p-4 space-y-2">
                          <div className="w-2/3 h-4 bg-[#17283B] rounded" />
                          <div className="w-1/3 h-3 bg-[#17283B] rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`grid gap-4 sm:gap-5 ${
                    viewLayout === 'grid'
                      ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                      : 'grid-cols-1'
                  }`}>
                    {filteredCameras.map((camera, idx) => (
                      <CameraTile
                        key={camera.id}
                        camera={camera}
                        index={idx}
                        privacyMode={privacyMode}
                        isFavorite={favoriteIds.includes(camera.id)}
                        onToggleFavorite={toggleFavorite}
                        onSelect={(cam) => setSelectedCamera(cam)}
                        onRemove={handleRemoveCamera}
                        onUpdate={handleUpdateCamera}
                        onReconnect={handleReconnectCamera}
                      />
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {/* 2. TAB EVENTI (Screen 5 in mockup) */}
          {bottomTab === 'eventi' && (
            <motion.div
              key="tab-eventi"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-5 max-w-4xl mx-auto"
            >
              {/* Real security event timeline */}
              <div className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#F4F8FF] tracking-tight">Eventi &amp; Allarmi</h2>
                  <p className="text-xs text-[#99B0CA]">Qui compaiono soltanto eventi rilevati da una sorgente reale.</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      onClick={() => setEventsFilter('all')}
                      className={`px-3 py-1.5 rounded-xl font-semibold transition-colors shrink-0 cursor-pointer ${
                        eventsFilter === 'all'
                          ? 'bg-[#36C5FF] text-[#080E18] font-bold'
                          : 'bg-[#080E18] text-[#99B0CA] border border-[#24364D]'
                      }`}
                    >
                      Tutti
                    </button>
                    <button
                      onClick={() => setEventsFilter('motion')}
                      className={`px-3 py-1.5 rounded-xl font-semibold transition-colors shrink-0 cursor-pointer ${
                        eventsFilter === 'motion'
                          ? 'bg-[#36C5FF] text-[#080E18] font-bold'
                          : 'bg-[#080E18] text-[#99B0CA] border border-[#24364D]'
                      }`}
                    >
                      Movimento
                    </button>
                    <button
                      onClick={() => setEventsFilter('person')}
                      className={`px-3 py-1.5 rounded-xl font-semibold transition-colors shrink-0 cursor-pointer ${
                        eventsFilter === 'person'
                          ? 'bg-[#36C5FF] text-[#080E18] font-bold'
                          : 'bg-[#080E18] text-[#99B0CA] border border-[#24364D]'
                      }`}
                    >
                      Persona
                    </button>
                  </div>
                </div>
              </div>

              {/* Vertical Timeline animata */}
              <div className="space-y-4">
                <span className="text-xs font-bold text-[#99B0CA] block">
                  Oggi, {new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>

                {filteredEvents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#24364D] bg-[#101C2B] p-8 text-center">
                    <Activity className="mx-auto mb-3 h-8 w-8 text-[#64748B]" />
                    <h3 className="text-sm font-bold text-white">Nessun evento reale registrato</h3>
                    <p className="mt-2 text-xs text-[#99B0CA]">Gli eventi appariranno qui quando una telecamera collegata rileverà movimento, una disconnessione o un allarme.</p>
                  </div>
                ) : (
                /* Timeline Container with Connected Vertical Line */
                <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#24364D]">
                  <AnimatePresence initial={false}>
                    {filteredEvents.map((evt, index) => (
                      <motion.div
                        key={evt.id}
                        layout
                        initial={{ opacity: 0, x: -16, scale: 0.98 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 16 }}
                        transition={{
                          duration: 0.26,
                          delay: Math.min(index * 0.035, 0.25),
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="relative group"
                      >
                        {/* Glowing Timeline Marker Dot */}
                        <div className="absolute -left-6 top-5 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#36C5FF] border-2 border-[#080E18] shadow-[0_0_8px_rgba(54,197,255,0.6)] group-hover:scale-125 transition-transform" />

                        {/* Timeline Event Card */}
                        <motion.div
                          whileHover={{ x: 3 }}
                          onClick={() => {
                            const targetCam = cameras.find((c) => c.id === evt.cameraId) || cameras[0];
                            setSelectedCamera(targetCam);
                          }}
                          className="p-3.5 rounded-2xl bg-[#101C2B] border border-[#24364D] hover:border-[#36C5FF]/50 shadow-md flex items-center justify-between gap-3 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* Timestamp */}
                            <span className="text-xs font-mono font-bold text-[#99B0CA] shrink-0 w-12">
                              {evt.timeAgo}
                            </span>

                            {/* Room Thumbnail Photo */}
                            <div className="w-16 h-11 sm:w-20 sm:h-12 rounded-xl overflow-hidden border border-[#24364D] shrink-0">
                              <img src={evt.roomImage} alt={evt.cameraName} className="w-full h-full object-cover" />
                            </div>

                            {/* Event Details */}
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-[#F4F8FF] truncate">{evt.description}</h4>
                              <p className="text-[11px] text-[#99B0CA] truncate">{evt.cameraName}</p>
                            </div>
                          </div>

                          {/* Right Icon */}
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            evt.type === 'person'
                              ? 'bg-[#45D7B0]/15 text-[#45D7B0]'
                              : evt.type === 'alarm'
                              ? 'bg-[#FF6577]/15 text-[#FF6577]'
                              : evt.type === 'disconnection'
                              ? 'bg-[#FFC56E]/15 text-[#FFC56E]'
                              : 'bg-[#36C5FF]/15 text-[#36C5FF]'
                          }`}>
                            {evt.type === 'person' && <User className="w-4 h-4" />}
                            {evt.type === 'alarm' && <ShieldAlert className="w-4 h-4" />}
                            {evt.type === 'disconnection' && <WifiOff className="w-4 h-4" />}
                            {evt.type === 'motion' && <Activity className="w-4 h-4" />}
                            {evt.type === 'reconnection' && <Wifi className="w-4 h-4" />}
                          </div>
                        </motion.div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                )}
              </div>
            </motion.div>
          )}

          {/* 3. TAB MAPPA DELLA CASA */}
          {bottomTab === 'mappa' && (
            <motion.div
              key="tab-mappa"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <HouseMapTab
                cameras={cameras}
                onSelectCamera={(cam) => setSelectedCamera(cam)}
              />
            </motion.div>
          )}

          {/* 4. TAB IMPOSTAZIONI */}
          {bottomTab === 'impostazioni' && (
            <motion.div
              key="tab-impostazioni"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4 max-w-2xl mx-auto"
            >
              <div className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D]">
                <h2 className="text-base font-bold text-[#F4F8FF] tracking-tight">Impostazioni CamGest</h2>
                <p className="text-xs text-[#99B0CA]">Configurazione nodo locale e informazioni di sistema</p>
              </div>

              <div className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#F4F8FF]">
                  <Wifi className="w-4 h-4 text-[#36C5FF]" />
                  <span>Server di segnalazione</span>
                </div>
                <p className="text-xs text-[#99B0CA] leading-relaxed">
                  Per collegare due telefoni, inserisci l'indirizzo HTTPS del server CamGuard che ospita le API di segnalazione. Lascia vuoto solo se il server è servito dalla stessa origine dell'app.
                </p>
                <input
                  type="url"
                  inputMode="url"
                  value={signalingServerUrl}
                  onChange={(event) => setSignalingServerUrl(event.target.value)}
                  placeholder="https://tuo-server-camguard.example"
                  className="w-full rounded-xl bg-[#080E18] border border-[#24364D] px-3 py-3 text-sm text-[#F4F8FF] placeholder:text-[#64748B] focus:outline-none focus:border-[#36C5FF]"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <div className="flex gap-2">
                  <button onClick={saveSignalingServerUrl} className="flex-1 rounded-xl bg-[#36C5FF] px-3 py-2.5 text-xs font-bold text-[#080E18]">Salva server</button>
                  <button onClick={testSignalingServer} disabled={serverCheckStatus === 'checking'} className="rounded-xl border border-[#24364D] px-3 py-2.5 text-xs font-bold text-[#F4F8FF] disabled:opacity-50">{serverCheckStatus === 'checking' ? 'Verifico…' : 'Test connessione'}</button>
                </div>
                {serverCheckMessage && (
                  <p className={`text-xs ${serverCheckStatus === 'online' ? 'text-[#45D7B0]' : serverCheckStatus === 'error' ? 'text-[#FF6577]' : 'text-[#99B0CA]'}`}>{serverCheckMessage}</p>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#F4F8FF]">
                  <Wifi className="w-4 h-4 text-[#45D7B0]" />
                  <span>Stato Rete Locale (LAN)</span>
                </div>
                <p className="text-xs text-[#99B0CA] leading-relaxed">
                  Tutti i flussi video WebRTC P2P e RTSP rimangono confinati alla rete locale, garantendo la massima riservatezza senza intermediari cloud.
                </p>
                <div className="p-2.5 bg-[#080E18] rounded-xl font-mono text-xs text-[#36C5FF] border border-[#24364D]">
                  IP Rilevato: {lanInfo?.localIp || '127.0.0.1'} • Porta: 3000
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#F4F8FF]">
                  <EyeOff className="w-4 h-4 text-[#FFC56E]" />
                  <span>Privacy Mode &amp; Aree Protette</span>
                </div>
                <p className="text-xs text-[#99B0CA] leading-relaxed">
                  Quando Privacy Mode è attiva, tutte le telecamere contrassegnate come &quot;Interna&quot; vengono offuscate e lo streaming video viene sospeso. Le telecamere &quot;Esterna&quot; mantengono la sorveglianza perimetrale.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[#F4F8FF] block">Versione Applicazione</span>
                  <span className="text-[11px] text-[#99B0CA]">CamGest Professional Security v2.6 • Motion Design 2.0</span>
                </div>
                <span className="px-2.5 py-1 rounded-md font-mono text-[11px] font-bold bg-[#45D7B0]/15 text-[#45D7B0] border border-[#45D7B0]/30">
                  LAN NATIVE
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 4-TAB BOTTOM NAVIGATION BAR (Con Indicatore Pillola Animata e Microinterazioni Tattili) */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#080E18]/95 border-t border-[#24364D] backdrop-blur-md px-4 py-2 flex items-center justify-around max-w-lg mx-auto sm:rounded-t-2xl shadow-2xl">
        {[
          { id: 'centro', label: 'Centro', icon: LayoutGrid },
          { id: 'eventi', label: 'Eventi', icon: Bell, badge: eventsList.length },
          { id: 'mappa', label: 'Mappa', icon: MapPin },
          { id: 'impostazioni', label: 'Impostazioni', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = bottomTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.93 }}
              transition={{ duration: 0.16 }}
              onClick={() => {
                setBottomTab(tab.id as any);
                setIsAddMenuOpen(false);
              }}
              className={`relative min-h-[44px] min-w-[44px] px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer select-none ${
                isActive ? 'text-[#36C5FF] font-bold' : 'text-[#99B0CA] hover:text-[#F4F8FF]'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-active-pill"
                  className="absolute inset-0 bg-[#36C5FF]/15 border border-[#36C5FF]/30 rounded-xl -z-10"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <div className="relative">
                <Icon className="w-5 h-5" />
                {tab.badge && tab.badge > 0 && !isActive && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#36C5FF]" />
                )}
              </div>
              <span className="text-xs font-semibold">
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </nav>

      {/* Modal Racconto */}
      <AnimatePresence>
        {isRecapModalOpen && (
          <DailyRecapModal
            isOpen={isRecapModalOpen}
            onClose={() => setIsRecapModalOpen(false)}
            events={eventsList as any}
            cameras={cameras}
          />
        )}
      </AnimatePresence>

      {/* Add Camera Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <AddCameraModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onAddCamera={handleAddCamera}
          />
        )}
      </AnimatePresence>

      {/* Fullscreen Camera Detail Modal (Screen 3 in mockup) */}
      <AnimatePresence>
        {selectedCamera && (
          <CameraDetailModal
            camera={selectedCamera}
            onClose={() => setSelectedCamera(null)}
            onRemove={handleRemoveCamera}
            onUpdate={handleUpdateCamera}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

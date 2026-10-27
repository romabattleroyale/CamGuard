import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sun,
  Moon,
  Camera,
  Smartphone,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  Activity,
  Layers,
  Sparkles
} from 'lucide-react';
import { CameraDevice } from '../../types/camera';

interface SecurityEvent {
  id: string;
  cameraName: string;
  type: 'motion' | 'connection' | 'alert';
  description: string;
  timeAgo: string;
}

interface DailyRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: SecurityEvent[];
  cameras: CameraDevice[];
}

export const DailyRecapModal: React.FC<DailyRecapModalProps> = ({
  isOpen,
  onClose,
  events,
  cameras,
}) => {
  if (!isOpen) return null;

  const currentHour = new Date().getHours();
  const isDaytime = currentHour >= 6 && currentHour < 19;
  const motionEvents = events.filter((e) => e.type === 'motion');

  // Group events by camera
  const eventsByCamera = cameras.map((cam) => {
    const camEvents = events.filter(
      (e) => e.cameraName.toLowerCase() === cam.name.toLowerCase()
    );
    return {
      camera: cam,
      events: camEvents,
    };
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0F14]/85 backdrop-blur-md select-none"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-2xl bg-[#141A21] border border-[#1F2933] rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#1F2933] flex items-center justify-between bg-gradient-to-r from-[#141A21] via-[#1C242E] to-[#141A21]">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-md ${
                isDaytime
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-[#4FC3F7]/15 text-[#4FC3F7] border-[#4FC3F7]/30'
              }`}
            >
              {isDaytime ? <Sun className="w-6 h-6 animate-spin-slow" /> : <Moon className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">
                  Racconto della giornata
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#34D399]/15 text-[#34D399] border border-[#34D399]/30">
                  OGGI
                </span>
              </div>
              <p className="text-xs text-[#94A3B8]">
                Riepilogo intelligente delle attività e timeline per telecamera
              </p>
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
          {/* Narrative Summary Card */}
          <div className="p-5 rounded-[22px] bg-gradient-to-br from-[#1C242E] to-[#141A21] border border-[#1F2933] shadow-md space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#4FC3F7]">
              <Sparkles className="w-4 h-4" />
              <span>Sintesi di Sicurezza</span>
            </div>

            <p className="text-sm sm:text-base font-semibold text-white leading-relaxed">
              {events.length > 0
                ? `Oggi: ${motionEvents.length} movimenti rilevati, ultimo in ${
                    motionEvents[0]?.cameraName || 'Salotto'
                  }. Nessuna attività insolita rilevata sul perimetro.`
                : 'Giornata tranquilla. Nessun movimento rilevato nelle zone monitorate.'}
            </p>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-[#1F2933]">
              <div className="p-3 bg-[#0B0F14]/70 rounded-xl border border-[#1F2933]">
                <span className="text-[10px] font-bold uppercase text-[#94A3B8] block">Movimenti</span>
                <span className="text-lg font-black text-[#F87171] font-mono">{motionEvents.length}</span>
              </div>
              <div className="p-3 bg-[#0B0F14]/70 rounded-xl border border-[#1F2933]">
                <span className="text-[10px] font-bold uppercase text-[#94A3B8] block">Eventi Totali</span>
                <span className="text-lg font-black text-[#4FC3F7] font-mono">{events.length}</span>
              </div>
              <div className="p-3 bg-[#0B0F14]/70 rounded-xl border border-[#1F2933]">
                <span className="text-[10px] font-bold uppercase text-[#94A3B8] block">Stato Rete</span>
                <span className="text-xs font-bold text-[#34D399] block mt-1">Conforme LAN</span>
              </div>
            </div>
          </div>

          {/* Timeline Grouped by Camera */}
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#4FC3F7]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                Timeline per Telecamera
              </h3>
            </div>

            {eventsByCamera.map(({ camera, events: camEvents }) => (
              <div
                key={camera.id}
                className="p-5 rounded-[22px] bg-[#141A21] border border-[#1F2933] space-y-4 shadow-sm"
              >
                {/* Camera Subheader */}
                <div className="flex items-center justify-between pb-3 border-b border-[#1F2933]">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        camera.type === 'phone'
                          ? 'bg-[#4FC3F7]/12 text-[#4FC3F7] border border-[#4FC3F7]/25'
                          : 'bg-[#34D399]/12 text-[#34D399] border border-[#34D399]/25'
                      }`}
                    >
                      {camera.type === 'phone' ? (
                        <Smartphone className="w-4 h-4" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{camera.name}</h4>
                      <span className="text-[10px] font-mono uppercase text-[#94A3B8]">
                        {camera.isIndoor !== false ? 'Zona Interna' : 'Zona Esterna'} • {camera.brand?.toUpperCase() || 'P2P'}
                      </span>
                    </div>
                  </div>

                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#1C242E] text-[#4FC3F7] border border-[#1F2933]">
                    {camEvents.length} {camEvents.length === 1 ? 'evento' : 'eventi'}
                  </span>
                </div>

                {/* Events list for this camera */}
                {camEvents.length > 0 ? (
                  <div className="space-y-2.5">
                    {camEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className="p-3.5 rounded-xl bg-[#0B0F14]/60 border border-[#1F2933] flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              evt.type === 'motion'
                                ? 'bg-[#F87171]/20 text-[#F87171]'
                                : 'bg-[#34D399]/20 text-[#34D399]'
                            }`}
                          >
                            {evt.type === 'motion' ? (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white block">
                              {evt.description}
                            </span>
                            <span className="text-[10px] text-[#64748B]">Verifica automatica LAN</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono text-[#94A3B8]">{evt.timeAgo}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#64748B] italic">
                    Nessuna attività registrata per questa telecamera oggi.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1F2933] bg-[#141A21] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#1C242E] hover:bg-[#242F3B] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-95 border border-[#1F2933]"
          >
            Chiudi
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

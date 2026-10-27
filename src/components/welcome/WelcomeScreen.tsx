import React from 'react';
import { motion } from 'motion/react';
import { Video, LayoutGrid, ShieldCheck, ArrowRight, Smartphone, Sparkles, Radio } from 'lucide-react';
import { ASSETS } from '../../assets/images';

interface WelcomeScreenProps {
  onSelectCameraMode: () => void;
  onSelectControlCenter: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectCameraMode,
  onSelectControlCenter,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="relative min-h-screen w-full bg-[#0B0F14] text-[#F1F5F9] flex flex-col justify-between overflow-x-hidden select-none"
    >
      {/* Background Hero with Ken Burns continuous slow zoom */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.img
          src={ASSETS.welcomeHero}
          alt="Modern smart home night security"
          className="w-full h-full object-cover object-center brightness-60"
          animate={{ scale: [1, 1.07, 1] }}
          transition={{ repeat: Infinity, duration: 30, ease: 'easeInOut' }}
        />
        {/* Layered dark gradients for contrast & atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F14]/70 via-[#0B0F14]/80 to-[#0B0F14]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#0B0F14_90%)]" />
      </div>

      {/* Top Bar with Brand and Security Assurance */}
      <header className="relative z-10 px-6 py-5 max-w-5xl mx-auto w-full flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="flex items-center gap-2.5"
        >
          <div className="w-8 h-8 rounded-xl bg-[#4FC3F7]/15 border border-[#4FC3F7]/30 flex items-center justify-center text-[#4FC3F7] shadow-sm">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="font-mono text-xs uppercase tracking-widest text-[#94A3B8]">
            CamGest Node
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#141A21]/80 backdrop-blur-md border border-[#1F2933] text-[11px] font-mono text-[#34D399]"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-online-pulse" />
          <span>100% LOCALE LAN</span>
        </motion.div>
      </header>

      {/* Center Hero Header */}
      <div className="relative z-10 max-w-xl mx-auto w-full px-5 py-4 text-center space-y-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.2, type: 'spring', damping: 20, stiffness: 240 }}
          className="inline-flex items-center justify-center"
        >
          <div className="w-16 h-16 rounded-[22px] bg-gradient-to-tr from-[#141A21] via-[#1C242E] to-[#242F3B] border border-[#4FC3F7]/30 flex items-center justify-center shadow-2xl shadow-black/60 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/12 to-transparent pointer-events-none" />
            <ShieldCheck className="w-9 h-9 text-[#4FC3F7]" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.45 }}
          className="space-y-1"
        >
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>Cam</span>
            <span className="text-[#4FC3F7]">Gest</span>
          </h1>
          <p className="text-xs uppercase tracking-[0.25em] text-[#94A3B8] font-bold">
            Sicurezza connessa ad alta definizione
          </p>
        </motion.div>
      </div>

      {/* The Two Grand Selectable Cards */}
      <div className="relative z-10 max-w-xl mx-auto w-full px-5 pb-8 space-y-4">
        {/* CARD 1: USA COME FOTOCAMERA */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.38, type: 'spring', damping: 22, stiffness: 260 }}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelectCameraMode}
          className="group relative h-44 sm:h-48 rounded-[24px] overflow-hidden cursor-pointer border border-[#1F2933] hover:border-[#4FC3F7]/60 shadow-[0_12px_35px_rgba(0,0,0,0.5)] transition-all duration-300 flex flex-col justify-between p-6 select-none"
        >
          {/* Card Background Image with Subtle Hover Zoom */}
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={ASSETS.phoneCameraCard}
              alt="Usa come fotocamera"
              className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-108 brightness-75"
            />
            {/* Dark protective gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F14]/95 via-[#0B0F14]/85 to-[#0B0F14]/40" />
            <div className="absolute inset-0 bg-[#4FC3F7]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>

          {/* Card Top Tag */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-[#4FC3F7]/20 text-[#4FC3F7] border border-[#4FC3F7]/40 backdrop-blur-md">
              <Radio className="w-3 h-3 animate-pulse" />
              Modalità Trasmettitore
            </span>
            <div className="w-8 h-8 rounded-full bg-[#141A21]/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white group-hover:bg-[#4FC3F7] group-hover:text-black transition-all group-hover:translate-x-1">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Card Content Bottom */}
          <div className="relative z-10 space-y-1">
            <div className="flex items-center gap-2 text-[#4FC3F7]">
              <Video className="w-5 h-5" />
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight group-hover:text-[#4FC3F7] transition-colors">
                Usa come fotocamera
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#CBD5E1] font-medium leading-relaxed max-w-sm">
              Trasforma questo telefono in una telecamera di sicurezza in tempo reale.
            </p>
          </div>
        </motion.div>

        {/* CARD 2: USA COME CENTRO DI CONTROLLO */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.5, type: 'spring', damping: 22, stiffness: 260 }}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelectControlCenter}
          className="group relative h-44 sm:h-48 rounded-[24px] overflow-hidden cursor-pointer border border-[#1F2933] hover:border-[#34D399]/60 shadow-[0_12px_35px_rgba(0,0,0,0.5)] transition-all duration-300 flex flex-col justify-between p-6 select-none"
        >
          {/* Card Background Image with Subtle Hover Zoom */}
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={ASSETS.controlCenterCard}
              alt="Usa come centro di controllo"
              className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-108 brightness-75"
            />
            {/* Dark protective gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F14]/95 via-[#0B0F14]/85 to-[#0B0F14]/40" />
            <div className="absolute inset-0 bg-[#34D399]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>

          {/* Card Top Tag */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-[#34D399]/20 text-[#34D399] border border-[#34D399]/40 backdrop-blur-md">
              <Sparkles className="w-3 h-3" />
              Centro di Controllo
            </span>
            <div className="w-8 h-8 rounded-full bg-[#141A21]/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white group-hover:bg-[#34D399] group-hover:text-black transition-all group-hover:translate-x-1">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Card Content Bottom */}
          <div className="relative z-10 space-y-1">
            <div className="flex items-center gap-2 text-[#34D399]">
              <LayoutGrid className="w-5 h-5" />
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight group-hover:text-[#34D399] transition-colors">
                Usa come centro di controllo
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#CBD5E1] font-medium leading-relaxed max-w-sm">
              Visualizza e gestisci tutte le tue telecamere e registrazioni live.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Subtle Footer Note */}
      <footer className="relative z-10 py-4 text-center text-[11px] font-mono text-[#64748B]">
        CamGest • P2P WebRTC &amp; RTSP • Nessun account cloud
      </footer>
    </motion.div>
  );
};

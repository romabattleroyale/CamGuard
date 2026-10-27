import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Video, Lock } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 300);
          return 100;
        }
        return prev + 12;
      });
    }, 90);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
      className="fixed inset-0 z-50 bg-[#0B0F14] flex flex-col items-center justify-center p-6 select-none"
    >
      {/* Background ambient glow circles */}
      <div className="absolute w-96 h-96 rounded-full bg-[#4FC3F7]/10 blur-3xl pointer-events-none -top-20 -left-20 animate-pulse" />
      <div className="absolute w-96 h-96 rounded-full bg-[#34D399]/8 blur-3xl pointer-events-none -bottom-20 -right-20" />

      <motion.div
        initial={{ opacity: 0, scale: 0.78, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 220, duration: 0.6 }}
        className="flex flex-col items-center text-center space-y-6 relative z-10"
      >
        {/* Animated Brand Emblem */}
        <div className="relative">
          <motion.div
            animate={{
              boxShadow: [
                '0 0 25px rgba(79, 195, 247, 0.25)',
                '0 0 45px rgba(79, 195, 247, 0.45)',
                '0 0 25px rgba(79, 195, 247, 0.25)',
              ],
            }}
            transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
            className="w-24 h-24 rounded-[28px] bg-gradient-to-tr from-[#141A21] via-[#1C242E] to-[#242F3B] border border-[#4FC3F7]/30 flex items-center justify-center relative overflow-hidden"
          >
            {/* Gloss shine reflection */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

            {/* Inner icon */}
            <div className="relative flex items-center justify-center">
              <ShieldCheck className="w-12 h-12 text-[#4FC3F7]" />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 300 }}
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#34D399] border-2 border-[#0B0F14] flex items-center justify-center shadow-md"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#0B0F14]" />
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Title and Subtitle with Material 3 Expressive Typography */}
        <div className="space-y-1.5">
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2"
          >
            <span>Cam</span>
            <span className="text-[#4FC3F7]">Gest</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="text-xs uppercase tracking-[0.25em] text-[#94A3B8] font-semibold"
          >
            Sicurezza connessa
          </motion.p>
        </div>

        {/* High-tech Loading Progress */}
        <div className="w-48 space-y-2 pt-2">
          <div className="h-1.5 w-full bg-[#1C242E] rounded-full overflow-hidden p-0.5 border border-[#1F2933]">
            <motion.div
              className="h-full bg-gradient-to-r from-[#4FC3F7] to-[#34D399] rounded-full"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut', duration: 0.1 }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-[#64748B]">
            <span>LOCAL NODE</span>
            <span className="text-[#4FC3F7]">{progress}%</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

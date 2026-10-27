import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Layers,
  Play,
  Info,
  Maximize2,
  Shield,
  Eye,
  Clock,
  ChevronRight,
  Sparkles,
  Wifi
} from 'lucide-react';
import { CameraDevice } from '../../types/camera';
import { ASSETS } from '../../assets/images';

interface HouseMapTabProps {
  cameras: CameraDevice[];
  onSelectCamera: (camera: CameraDevice) => void;
}

interface MapCameraPin {
  id: string;
  name: string;
  roomName: string;
  floor: 'terra' | 'primo' | 'esterno';
  xPercent: number; // Position X in % on the floorplan image
  yPercent: number; // Position Y in %
  rotationAngle: number; // Angle of view cone in degrees
  coneColor: string;
}

const DEFAULT_PINS: MapCameraPin[] = [
  {
    id: 'ip_tapo_c200',
    name: 'Salotto - Tapo C200',
    roomName: 'Salotto',
    floor: 'terra',
    xPercent: 78,
    yPercent: 34,
    rotationAngle: 215,
    coneColor: '#36C5FF',
  },
  {
    id: 'ip_ezviz_c6n',
    name: 'Ingresso - EZVIZ C6N',
    roomName: 'Ingresso',
    floor: 'terra',
    xPercent: 49,
    yPercent: 20,
    rotationAngle: 180,
    coneColor: '#45D7B0',
  },
  {
    id: 'ip_retro_garage',
    name: 'Garage - Reolink E1',
    roomName: 'Garage',
    floor: 'terra',
    xPercent: 24,
    yPercent: 38,
    rotationAngle: 90,
    coneColor: '#FFC56E',
  },
  {
    id: 'ip_giardino_c310',
    name: 'Giardino - Tapo C310',
    roomName: 'Giardino',
    floor: 'esterno',
    xPercent: 70,
    yPercent: 78,
    rotationAngle: 330,
    coneColor: '#36C5FF',
  },
];

export const HouseMapTab: React.FC<HouseMapTabProps> = ({
  cameras,
  onSelectCamera,
}) => {
  const [selectedFloor, setSelectedFloor] = useState<'terra' | 'primo' | 'esterno'>('terra');
  const [activeCameraId, setActiveCameraId] = useState<string>('ip_giardino_c310');

  // Match active pin with real camera device
  const activePin = DEFAULT_PINS.find((p) => p.id === activeCameraId) || DEFAULT_PINS[0];
  const activeCamera = cameras.find((c) => c.id === activePin.id) || cameras[0];

  // Resolve room image for the selected camera
  const getRoomThumbnail = (cam: CameraDevice | undefined) => {
    if (!cam) return ASSETS.roomGardenPatio;
    const nameLower = cam.name.toLowerCase();
    if (nameLower.includes('salotto') || nameLower.includes('living')) return ASSETS.roomLivingRoom;
    if (nameLower.includes('giardino') || nameLower.includes('patio')) return ASSETS.roomGardenPatio;
    if (nameLower.includes('garage')) return ASSETS.roomModernGarage;
    if (nameLower.includes('ingresso') || nameLower.includes('hallway')) return ASSETS.roomHallwayEntrance;
    return ASSETS.dashboardInteriorNight;
  };

  const currentThumbnail = getRoomThumbnail(activeCamera);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* 1. Header con Selettore Piani */}
      <div className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#F4F8FF] tracking-tight">Mappa della casa</h2>
          <p className="text-xs text-[#99B0CA]">Visualizza la copertura e gestisci le telecamere nello spazio reale</p>
        </div>

        {/* Floor selector pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#080E18] border border-[#24364D] self-start sm:self-auto">
          {[
            { id: 'terra', label: 'Piano Terra' },
            { id: 'primo', label: 'Piano 1' },
            { id: 'esterno', label: 'Esterno' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedFloor(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedFloor === tab.id
                  ? 'bg-[#36C5FF] text-[#080E18] font-bold shadow-sm'
                  : 'text-[#99B0CA] hover:text-[#F4F8FF]'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="p-1.5 text-[#99B0CA] border-l border-[#24364D]/60 pl-2 ml-1">
            <Layers className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 2. Interactive Floorplan Viewport */}
      <div className="relative rounded-3xl overflow-hidden bg-[#080E18] border border-[#24364D] shadow-2xl aspect-[4/3] sm:aspect-[16/10] select-none group">
        {/* Architectural 3D Cutaway Render */}
        <img
          src={ASSETS.houseFloorplan3D}
          alt="3D Floorplan Casa CamGest"
          className="w-full h-full object-cover object-center brightness-95"
          loading="eager"
        />

        {/* Atmospheric Ambient Lighting Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080E18]/80 via-transparent to-[#080E18]/40 pointer-events-none" />

        {/* Camera Pins & View Cones */}
        {DEFAULT_PINS.map((pin) => {
          const isSelected = pin.id === activeCameraId;
          const targetCam = cameras.find((c) => c.id === pin.id);
          const isOnline = targetCam?.status === 'online';

          return (
            <div
              key={pin.id}
              style={{
                left: `${pin.xPercent}%`,
                top: `${pin.yPercent}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer"
              onClick={() => setActiveCameraId(pin.id)}
            >
              {/* Field of View (FOV) Projected Light Cone with Surveillance Sweep Animation */}
              <div
                style={{
                  '--base-angle': `${pin.rotationAngle}deg`,
                  transform: `rotate(${pin.rotationAngle}deg)`,
                  transformOrigin: 'top center',
                } as React.CSSProperties}
                className={`absolute top-full left-1/2 -translate-x-1/2 pointer-events-none transition-all duration-300 ${
                  isSelected
                    ? 'opacity-90 scale-105 animate-fov-sweep'
                    : 'opacity-35 group-hover:opacity-55 scale-95'
                }`}
              >
                <div
                  className="w-24 sm:w-36 h-28 sm:h-44"
                  style={{
                    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
                    background: `linear-gradient(to bottom, ${pin.coneColor}77 0%, ${pin.coneColor}18 70%, transparent 100%)`,
                  }}
                />
              </div>

              {/* Pin Icon Bubble with Discrete Halo Ring when selected */}
              <motion.div
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`relative px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-2xl backdrop-blur-md transition-all duration-200 ${
                  isSelected
                    ? 'bg-[#36C5FF] text-[#080E18] font-bold ring-2 ring-white scale-110 animate-halo-pulse'
                    : 'bg-[#101C2B]/90 text-[#F4F8FF] border border-[#24364D] hover:border-[#36C5FF]'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold hidden sm:inline">
                  {pin.roomName}
                </span>

                {/* Status Dot with gentle pulse */}
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isOnline ? 'bg-[#45D7B0] animate-online-pulse' : 'bg-[#FF6577]'
                  }`}
                />
              </motion.div>
            </div>
          );
        })}

        {/* Floorplan Room Labels */}
        <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-full bg-[#101C2B]/80 backdrop-blur-md border border-[#24364D] text-[11px] font-mono text-[#36C5FF] flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          <span>Vista 3D Planimetria Attiva</span>
        </div>
      </div>

      {/* 3. Bottom Selected Camera Drawer with smooth AnimatePresence transition */}
      <AnimatePresence mode="wait">
        {activeCamera && (
          <motion.div
            key={activeCamera.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              {/* Room Thumbnail with subtle zoom on hover */}
              <div className="relative w-20 h-16 sm:w-24 sm:h-16 rounded-xl overflow-hidden shrink-0 border border-[#24364D] group-hover:border-[#36C5FF]/40 transition-colors">
                <img
                  src={currentThumbnail}
                  alt={activeCamera.name}
                  className="w-full h-full object-cover object-center transition-transform duration-500 hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/20" />
              </div>

              {/* Camera Details */}
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#F4F8FF] truncate">
                    {activeCamera.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-[#45D7B0] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#45D7B0] animate-online-pulse" />
                    {activeCamera.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-[#99B0CA]">•</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#17283B] text-[#99B0CA] border border-[#24364D]">
                    {activeCamera.isIndoor ? 'Interna' : 'Esterna'}
                  </span>
                </div>
                <p className="text-[11px] text-[#99B0CA]">
                  Ultimo evento: Movimento rilevato (pochi minuti fa)
                </p>
              </div>
            </div>

            {/* Action Buttons with Spring Micro-Feedback */}
            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.16 }}
                onClick={() => onSelectCamera(activeCamera)}
                className="px-4 py-2 rounded-xl bg-[#36C5FF] hover:bg-[#20b8f5] text-[#080E18] text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-[#36C5FF]/20 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Apri live</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.16 }}
                onClick={() => onSelectCamera(activeCamera)}
                className="px-3.5 py-2 rounded-xl bg-[#17283B] hover:bg-[#24364D] text-[#F4F8FF] text-xs font-semibold border border-[#24364D] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Info className="w-3.5 h-3.5 text-[#99B0CA]" />
                <span>Dettagli</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React from 'react';
import { Camera, MapPin } from 'lucide-react';
import { CameraDevice } from '../../types/camera';

interface HouseMapTabProps {
  cameras: CameraDevice[];
  onSelectCamera: (camera: CameraDevice) => void;
}

/**
 * This view deliberately does not invent a floorplan or camera coordinates.
 * Only user-configured real cameras are shown until a real floorplan editor exists.
 */
export const HouseMapTab: React.FC<HouseMapTabProps> = ({ cameras, onSelectCamera }) => {
  const positionedCameras = cameras.filter((camera) =>
    Boolean(camera.location?.trim() || camera.room?.trim())
  );

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <header className="rounded-2xl border border-[#24364D] bg-[#101C2B] p-4">
        <h2 className="text-base font-bold text-[#F4F8FF]">Mappa delle telecamere</h2>
        <p className="mt-1 text-xs text-[#99B0CA]">
          Sono mostrate soltanto telecamere reali con una posizione configurata.
        </p>
      </header>

      {positionedCameras.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#24364D] bg-[#101C2B] p-8 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-[#64748B]" />
          <h3 className="text-sm font-bold text-white">Nessuna posizione configurata</h3>
          <p className="mx-auto mt-2 max-w-md text-xs text-[#99B0CA]">
            Aggiungi una telecamera reale e assegna una stanza o una posizione. Non mostriamo planimetrie o punti fittizi.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {positionedCameras.map((camera) => (
            <button
              key={camera.id}
              type="button"
              onClick={() => onSelectCamera(camera)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#24364D] bg-[#101C2B] p-4 text-left hover:border-[#36C5FF]/60"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Camera className="h-5 w-5 shrink-0 text-[#36C5FF]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-white">{camera.name}</span>
                  <span className="mt-1 block text-xs text-[#99B0CA]">
                    {camera.location || camera.room}
                  </span>
                </span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${camera.status === 'online' ? 'text-[#45D7B0]' : 'text-[#FF6577]'}`}>
                {camera.status === 'online' ? 'Online dichiarato' : 'Offline'}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

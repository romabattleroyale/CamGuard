import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Link2, Loader2, Wifi, WifiOff } from 'lucide-react';
import { SignalingClient, createPeerConnectionConfig } from '../../services/webrtc';
import { apiFetch } from '../../services/api';

interface PhoneCameraViewerProps {
  initialSessionId?: string;
  initialPin?: string;
  onExit: () => void;
}

export const PhoneCameraViewer: React.FC<PhoneCameraViewerProps> = ({ initialSessionId, initialPin, onExit }) => {
  const [sessionId, setSessionId] = useState(initialSessionId || '');
  const [pin, setPin] = useState(initialPin || '');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (initialSessionId && initialPin && !startedRef.current) {
      startedRef.current = true;
      void connect(initialSessionId, initialPin);
    }
    return () => {
      signalingRef.current?.destroy();
      signalingRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
    };
    // Connect only for a QR pairing supplied on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(id = sessionId.trim(), code = pin.trim()) {
    if (!id || !code) {
      setError('Inserisci sia il codice sessione sia il PIN mostrati sul telefono trasmettitore.');
      return;
    }
    signalingRef.current?.destroy();
    pcRef.current?.close();
    setConnecting(true);
    setConnected(false);
    setError('');
    try {
      const check = await apiFetch('/api/signaling/' + encodeURIComponent(id) + '/messages?role=viewer&pin=' + encodeURIComponent(code) + '&since=0');
      if (!check.ok) {
        throw new Error(check.status === 404 ? 'Sessione non trovata o scaduta. Crea una nuova sessione sul telefono trasmettitore.' : check.status === 401 || check.status === 403 ? 'PIN non valido. Ricontrolla il codice sul telefono trasmettitore.' : 'Il server non ha accettato la connessione. Riprova tra poco.');
      }

      const pc = new RTCPeerConnection(createPeerConnectionConfig());
      pcRef.current = pc;
      pc.ontrack = (event) => {
        const stream = event.streams?.[0];
        if (stream && videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
          setConnected(true);
          setConnecting(false);
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setConnected(true);
          setConnecting(false);
          setError('');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setConnected(false);
          setConnecting(false);
          if (pc.connectionState === 'failed') setError('Connessione video fallita. Tieni entrambi i telefoni online e riprova.');
        }
      };

      const signaling = new SignalingClient(id, 'viewer', code);
      signalingRef.current = signaling;
      const pendingCandidates: RTCIceCandidateInit[] = [];
      pc.onicecandidate = (event) => {
        if (event.candidate) void signaling.sendMessage('candidate', event.candidate);
      };

      signaling.onMessage(async (msg) => {
        try {
          if (msg.type === 'offer' && msg.payload && pc.signalingState !== 'closed') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
            for (const candidate of pendingCandidates.splice(0)) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await signaling.sendMessage('answer', answer);
          } else if (msg.type === 'candidate' && msg.payload) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
            } else {
              pendingCandidates.push(msg.payload as RTCIceCandidateInit);
            }
          } else if (msg.type === 'disconnect') {
            setConnected(false);
            setError('Il telefono trasmettitore si è disconnesso.');
          }
        } catch (err) {
          console.error('Errore negoziazione viewer', err);
          setError('Negoziazione video non riuscita. Genera un nuovo codice e riprova.');
        }
      });
      setSessionId(id);
      setPin(code);
      setConnecting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile collegarsi al telefono trasmettitore.');
      setConnecting(false);
      setConnected(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080E18] text-white flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b border-white/10">
        <button onClick={onExit} className="p-2 rounded-xl bg-white/5" aria-label="Torna indietro"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="font-bold text-lg">Collega una telecamera</h1>
          <p className="text-xs text-slate-400">Viewer CamGuard · connessione reale</p>
        </div>
        {connected ? <Wifi className="text-emerald-400" /> : <WifiOff className="text-slate-500" />}
      </header>

      <section className="p-4 flex-1 flex flex-col gap-4 max-w-xl w-full mx-auto">
        <div className="aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 flex items-center justify-center relative">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
          {!connected && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0D1420] text-center p-5">
            {connecting ? <Loader2 className="animate-spin text-sky-400" size={34} /> : <Camera className="text-slate-500" size={36} />}
            <p className="font-semibold">{connecting ? 'In attesa del trasmettitore…' : 'Nessuna telecamera collegata'}</p>
            <p className="text-xs text-slate-400">Inserisci i dati mostrati sul telefono che trasmette.</p>
          </div>}
          {connected && <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-emerald-500/90 text-xs font-bold">LIVE</span>}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
          <div className="flex items-center gap-2"><Link2 size={18} className="text-sky-400" /><h2 className="font-bold">Accoppiamento manuale</h2></div>
          <label className="block text-sm text-slate-300">Codice sessione
            <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} autoCapitalize="none" autoCorrect="off" placeholder="Incolla il codice sessione" className="mt-2 w-full rounded-xl bg-[#050A12] border border-white/15 px-3 py-3 text-white outline-none focus:border-sky-400" />
          </label>
          <label className="block text-sm text-slate-300">PIN a 6 cifre
            <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className="mt-2 w-full rounded-xl bg-[#050A12] border border-white/15 px-3 py-3 text-white tracking-[0.25em] outline-none focus:border-sky-400" />
          </label>
          {error && <p role="alert" className="rounded-xl bg-rose-500/10 border border-rose-400/20 p-3 text-sm text-rose-200">{error}</p>}
          <button onClick={() => void connect()} disabled={connecting} className="w-full rounded-xl bg-sky-400 text-[#06111D] font-extrabold py-3 disabled:opacity-50">
            {connecting ? 'Connessione in corso…' : connected ? 'Ricollega' : 'Collega telecamera'}
          </button>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">Entrambi i telefoni devono avere accesso a Internet. La qualità della connessione dipende dalla rete e dalla disponibilità WebRTC.</p>
      </section>
    </main>
  );
};

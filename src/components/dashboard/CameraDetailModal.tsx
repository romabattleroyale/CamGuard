import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Camera,
  Smartphone,
  Battery,
  BatteryCharging,
  Flashlight,
  FlashlightOff,
  Volume2,
  VolumeX,
  Mic,
  ShieldAlert,
  Download,
  RefreshCw,
  Trash2,
  Edit2,
  Check,
  ChevronRight,
  Maximize2,
  Eye,
  Radio,
  Sparkles,
  Bell,
  Settings,
  SlidersHorizontal,
  ChevronDown,
  Layers,
  MapPin,
  Clock
} from 'lucide-react';
import { CameraDevice } from '../../types/camera';
import { SignalingClient, createPeerConnectionConfig } from '../../services/webrtc';
import { playChimeSound } from '../../utils/audio';
import { ASSETS } from '../../assets/images';

interface CameraDetailModalProps {
  camera: CameraDevice | null;
  onClose: () => void;
  onRemove: (id: string) => void;
  onUpdate: (camera: CameraDevice) => void;
}

export const CameraDetailModal: React.FC<CameraDetailModalProps> = ({
  camera,
  onClose,
  onRemove,
  onUpdate,
}) => {
  if (!camera) return null;

  const [name, setName] = useState(camera.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [torchOn, setTorchOn] = useState(Boolean(camera.torchOn));
  const [isIntercomActive, setIsIntercomActive] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(camera.batteryLevel);
  const [isCharging, setIsCharging] = useState(camera.isCharging);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [snapshotFeedback, setSnapshotFeedback] = useState(false);
  const [isBuffering, setIsBuffering] = useState(camera.type === 'phone');
  const [selectedQuality, setSelectedQuality] = useState<'HD' | '4K' | 'SD'>('HD');
  const [timelinePosition, setTimelinePosition] = useState(65); // percent
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticEntries, setDiagnosticEntries] = useState<string[]>([]);
  const [diagnosticSdp, setDiagnosticSdp] = useState({ local: '', remote: '' });
  const [videoStats, setVideoStats] = useState<{
    packetsReceived: number | null;
    packetsLost: number | null;
    bytesReceived: number | null;
    bitrateBps: number | null;
    framesReceived: number | null;
    framesDecoded: number | null;
    frameWidth: number | null;
    frameHeight: number | null;
    codec: string | null;
    sampledAt: string | null;
    error: string | null;
  }>({
    packetsReceived: null,
    packetsLost: null,
    bytesReceived: null,
    bitrateBps: null,
    framesReceived: null,
    framesDecoded: null,
    frameWidth: null,
    frameHeight: null,
    codec: null,
    sampledAt: null,
    error: null,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingMimeRef = useRef<string>('video/webm');
  const diagnosticEntriesRef = useRef<string[]>([]);
  const lastVideoStatsRef = useRef<{ at: number; bytes: number } | null>(null);
  const lastVideoTapAtRef = useRef(0);

  const writeDiagnostic = (event: string, details?: Record<string, unknown>) => {
    const suffix = details ? ` | ${JSON.stringify(details)}` : '';
    const line = `${new Date().toISOString()} | ${event}${suffix}`;
    diagnosticEntriesRef.current = [...diagnosticEntriesRef.current, line].slice(-300);
    setDiagnosticEntries(diagnosticEntriesRef.current);
    console.info('[CamGuard][WebRTC]', line);
  };

  const collectWebRtcStats = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) {
      setVideoStats((previous) => ({ ...previous, error: 'PeerConnection non disponibile' }));
      writeDiagnostic('getStats non disponibile: PeerConnection assente');
      return;
    }
    try {
      const reports = await pc.getStats();
      let inboundVideo: any = null;
      let codecReport: any = null;
      reports.forEach((report: any) => {
        if (
          report.type === 'inbound-rtp' &&
          (report.kind === 'video' || report.mediaType === 'video') &&
          report.isRemote !== true
        ) {
          inboundVideo = report;
        }
      });
      if (!inboundVideo) {
        throw new Error('getStats non contiene un record inbound-rtp video');
      }
      if (inboundVideo.codecId) codecReport = reports.get(inboundVideo.codecId) as any;
      const now = Date.now();
      const bytes = Number(inboundVideo.bytesReceived ?? 0);
      const previous = lastVideoStatsRef.current;
      const bitrateBps =
        previous && now > previous.at && bytes >= previous.bytes
          ? Math.round(((bytes - previous.bytes) * 8 * 1000) / (now - previous.at))
          : null;
      lastVideoStatsRef.current = { at: now, bytes };
      const nextStats = {
        packetsReceived: Number(inboundVideo.packetsReceived ?? 0),
        packetsLost: Number(inboundVideo.packetsLost ?? 0),
        bytesReceived: bytes,
        bitrateBps,
        framesReceived: Number(inboundVideo.framesReceived ?? 0),
        framesDecoded: Number(inboundVideo.framesDecoded ?? 0),
        frameWidth: Number(inboundVideo.frameWidth ?? 0),
        frameHeight: Number(inboundVideo.frameHeight ?? 0),
        codec: codecReport?.mimeType || codecReport?.codec || null,
        sampledAt: new Date().toISOString(),
        error: null as string | null,
      };
      setVideoStats(nextStats);
      writeDiagnostic('getStats video inbound-rtp', {
        packetsReceived: nextStats.packetsReceived,
        packetsLost: nextStats.packetsLost,
        bytesReceived: nextStats.bytesReceived,
        bitrateBps: nextStats.bitrateBps,
        framesReceived: nextStats.framesReceived,
        framesDecoded: nextStats.framesDecoded,
        frame: `${nextStats.frameWidth}x${nextStats.frameHeight}`,
        codec: nextStats.codec,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVideoStats((previous) => ({ ...previous, error: message, sampledAt: new Date().toISOString() }));
      writeDiagnostic('ERRORE getStats', { message });
    }
  };

  const exportWebRtcDiagnostics = () => {
    writeDiagnostic('Esportazione diagnostica richiesta', {
      connectionState: peerConnectionRef.current?.connectionState ?? 'no-pc',
      signalingState: peerConnectionRef.current?.signalingState ?? 'no-pc',
    });
    const pc = peerConnectionRef.current;
    const payload = {
      exportedAt: new Date().toISOString(),
      camera: { id: camera.id, name: camera.name, sessionId: camera.sessionId },
      peerConnection: pc
        ? {
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            signalingState: pc.signalingState,
            transceivers: pc.getTransceivers().map((transceiver) => ({
              kind: transceiver.receiver.track.kind,
              direction: transceiver.direction,
              currentDirection: transceiver.currentDirection,
              mid: transceiver.mid,
              senderTrack: transceiver.sender.track?.kind ?? null,
              receiverTrackState: transceiver.receiver.track.readyState,
              receiverTrackMuted: transceiver.receiver.track.muted,
            })),
          }
        : null,
      sdp: {
        local: pc?.localDescription?.sdp || diagnosticSdp.local,
        remote: pc?.remoteDescription?.sdp || diagnosticSdp.remote,
      },
      stats: videoStats,
      logs: diagnosticEntriesRef.current,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `camguard-webrtc-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const toggleDiagnosticsWithDoubleTap = () => {
    const now = Date.now();
    if (now - lastVideoTapAtRef.current < 450) {
      setDiagnosticsOpen((open) => !open);
      writeDiagnostic('Overlay diagnostica attivato tramite doppio tap');
      lastVideoTapAtRef.current = 0;
    } else {
      lastVideoTapAtRef.current = now;
    }
  };

  useEffect(() => {
    if (!diagnosticsOpen) return;
    void collectWebRtcStats();
    const timer = window.setInterval(() => void collectWebRtcStats(), 2000);
    return () => window.clearInterval(timer);
  }, [diagnosticsOpen]);

  // Setup WebRTC connection for Phone Camera
  useEffect(() => {
    if (camera.type !== 'phone' || !camera.sessionId) return;

    setIsBuffering(true);
    const signaling = new SignalingClient(camera.sessionId, 'viewer', camera.pin || '');
    signalingRef.current = signaling;

    const pc = new RTCPeerConnection(createPeerConnectionConfig());
    writeDiagnostic('PeerConnection creata', {
      sessionId: camera.sessionId,
      iceConnectionState: pc.iceConnectionState,
      connectionState: pc.connectionState,
      signalingState: pc.signalingState,
    });
    // The phone's offer already declares video. Only pre-create the bidirectional
    // audio section needed for intercom; do not duplicate the incoming video m-line.
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    peerConnectionRef.current = pc;

    // Polling can deliver ICE candidates before the SDP offer/answer. Keep them
    // queued until the remote description is installed, otherwise WebRTC may
    // silently lose the candidates and never deliver video to this detail view.
    const pendingIceCandidates: RTCIceCandidateInit[] = [];
    const flushPendingIceCandidates = async () => {
      while (pendingIceCandidates.length > 0 && pc.remoteDescription) {
        const candidate = pendingIceCandidates.shift();
        if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const remoteMediaStream = new MediaStream();
    pc.ontrack = async (event) => {
      const incomingStream = event.streams?.[0];
      const track = event.track;
      if (incomingStream) {
        incomingStream.getTracks().forEach((incomingTrack) => {
          if (!remoteMediaStream.getTracks().some((t) => t.id === incomingTrack.id)) {
            remoteMediaStream.addTrack(incomingTrack);
          }
        });
      } else if (!remoteMediaStream.getTracks().some((t) => t.id === track.id)) {
        remoteMediaStream.addTrack(track);
      }

      writeDiagnostic('Evento ontrack', {
        kind: track.kind,
        trackId: track.id,
        trackReadyState: track.readyState,
        trackMuted: track.muted,
        streamCount: event.streams?.length ?? 0,
        streams: (event.streams ?? []).map((stream) => ({
          id: stream.id,
          tracks: stream.getTracks().map((item) => ({ kind: item.kind, id: item.id, state: item.readyState })),
        })),
      });
      const video = videoRef.current;
      if (!video || track.kind !== 'video') return;
      // Mobile Chrome/WebView may block autoplay of an unmuted remote stream.
      // Start surveillance video muted; the user can enable audio separately.
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      const attachedStream = incomingStream || remoteMediaStream;
      video.srcObject = attachedStream;
      writeDiagnostic('video.srcObject assegnato', {
        streamId: attachedStream.id,
        tracks: attachedStream.getTracks().map((item) => ({
          kind: item.kind,
          id: item.id,
          readyState: item.readyState,
          muted: item.muted,
        })),
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        autoplay: video.autoplay,
        muted: video.muted,
        playsInline: video.playsInline,
      });
      const markVideoReady = (eventName: string) => {
        writeDiagnostic(eventName, {
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          currentTime: video.currentTime,
          paused: video.paused,
          networkState: video.networkState,
          trackMuted: track.muted,
        });
        if (video.videoWidth > 0 && video.videoHeight > 0) setIsBuffering(false);
      };
      video.onloadedmetadata = () => markVideoReady('video onLoadedMetadata');
      video.onloadeddata = () => markVideoReady('video onLoadedData');
      video.onplay = () => markVideoReady('video onPlay');
      video.onplaying = () => markVideoReady('video onPlaying');
      video.onerror = () => writeDiagnostic('video onError', {
        code: video.error?.code ?? null,
        message: video.error?.message ?? null,
        readyState: video.readyState,
        networkState: video.networkState,
      });
      if (track.muted) {
        track.onunmute = () => {
          writeDiagnostic('video track onunmute', { trackId: track.id, readyState: track.readyState });
          markVideoReady('video track onunmute');
        };
      }
      try {
        writeDiagnostic('video.play() richiesto', { readyState: video.readyState, paused: video.paused });
        await video.play();
        writeDiagnostic('video.play() risolto', {
          readyState: video.readyState,
          paused: video.paused,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        });
        markVideoReady('video.play() completato');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeDiagnostic('ERRORE video.play()', { message, readyState: video.readyState, paused: video.paused });
        console.error('Impossibile riprodurre il flusso video ricevuto', error);
      }
    };

    pc.oniceconnectionstatechange = () => {
      writeDiagnostic('iceconnectionstatechange', {
        state: pc.iceConnectionState,
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
      });
    };
    pc.onconnectionstatechange = () => {
      writeDiagnostic('connectionstatechange', {
        state: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
      });
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        console.error('Connessione video WebRTC non riuscita:', pc.connectionState);
        setIsBuffering(true);
      }
    };
    pc.onsignalingstatechange = () => {
      writeDiagnostic('signalingstatechange', {
        state: pc.signalingState,
        localDescriptionType: pc.localDescription?.type ?? null,
        remoteDescriptionType: pc.remoteDescription?.type ?? null,
        localHasVideoMLine: /(^|\\r?\\n)m=video /m.test(pc.localDescription?.sdp ?? ''),
        remoteHasVideoMLine: /(^|\\r?\\n)m=video /m.test(pc.remoteDescription?.sdp ?? ''),
      });
      setDiagnosticSdp({
        local: pc.localDescription?.sdp ?? diagnosticSdp.local,
        remote: pc.remoteDescription?.sdp ?? diagnosticSdp.remote,
      });
    };
    pc.onicegatheringstatechange = () => {
      writeDiagnostic('icegatheringstatechange', { state: pc.iceGatheringState });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void signaling.sendMessage('candidate', event.candidate);
      }
    };

    signaling.onMessage(async (msg) => {
      try {
        if (msg.type === 'offer') {
          const remoteSdp = String(msg.payload?.sdp ?? '');
          setDiagnosticSdp((previous) => ({ ...previous, remote: remoteSdp }));
          writeDiagnostic('SDP OFFERTA ricevuta', {
            type: msg.payload?.type ?? null,
            hasVideoMLine: /(^|\\r?\\n)m=video /m.test(remoteSdp),
            hasAudioMLine: /(^|\\r?\\n)m=audio /m.test(remoteSdp),
            sdpLength: remoteSdp.length,
          });
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({ type: 'rollback' });
          }
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          setDiagnosticSdp((previous) => ({
            ...previous,
            remote: pc.remoteDescription?.sdp ?? remoteSdp,
          }));
          writeDiagnostic('setRemoteDescription(offer) completato', {
            signalingState: pc.signalingState,
            remoteHasVideoMLine: /(^|\\r?\\n)m=video /m.test(pc.remoteDescription?.sdp ?? ''),
          });
          await flushPendingIceCandidates();
          const answer = await pc.createAnswer();
          writeDiagnostic('createAnswer completato', {
            type: answer.type,
            hasVideoMLine: /(^|\\r?\\n)m=video /m.test(answer.sdp ?? ''),
            sdpLength: answer.sdp?.length ?? 0,
          });
          await pc.setLocalDescription(answer);
          const localSdp = pc.localDescription?.sdp ?? answer.sdp ?? '';
          setDiagnosticSdp((previous) => ({ ...previous, local: localSdp }));
          writeDiagnostic('SDP RISPOSTA inviata', {
            type: pc.localDescription?.type ?? answer.type,
            hasVideoMLine: /(^|\\r?\\n)m=video /m.test(localSdp),
            hasAudioMLine: /(^|\\r?\\n)m=audio /m.test(localSdp),
            sdpLength: localSdp.length,
          });
          await signaling.sendMessage('answer', pc.localDescription ?? answer);
          // SDP accepted does not mean video is flowing: wait for ontrack/play.
        } else if (msg.type === 'answer') {
          const remoteSdp = String(msg.payload?.sdp ?? '');
          setDiagnosticSdp((previous) => ({ ...previous, remote: remoteSdp }));
          writeDiagnostic('SDP RISPOSTA ricevuta', {
            type: msg.payload?.type ?? null,
            hasVideoMLine: /(^|\\r?\\n)m=video /m.test(remoteSdp),
            sdpLength: remoteSdp.length,
          });
          if (pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
            await flushPendingIceCandidates();
          }
        } else if (msg.type === 'candidate' && msg.payload) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
          } else {
            pendingIceCandidates.push(msg.payload as RTCIceCandidateInit);
          }
        } else if (msg.type === 'status') {
          const info = msg.payload?.cameraInfo;
          if (info) {
            if (info.batteryLevel !== undefined) setBatteryLevel(info.batteryLevel);
            if (info.isCharging !== undefined) setIsCharging(info.isCharging);
          }
        }
      } catch (error) {
        console.error('Errore di segnalazione WebRTC nella schermata dettaglio', error);
      }
    });

    return () => {
      signaling.destroy();
      pc.close();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    };
  }, [camera.sessionId, camera.type]);

  // Remote Actions
  const toggleTorch = () => {
    const next = !torchOn;
    setTorchOn(next);
    if (signalingRef.current) {
      signalingRef.current.sendMessage('command', { command: 'torch', enabled: next });
    }
    onUpdate({ ...camera, torchOn: next });
  };

  const toggleRecording = () => {
    if (isRecording) {
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording') recorder.stop();
      recorderRef.current = null;
      setIsRecording(false);
      return;
    }

    if (camera.type !== 'phone' || !videoRef.current?.srcObject) {
      console.warn('Registrazione non disponibile: nessun flusso video reale è collegato.');
      return;
    }

    const sourceStream = videoRef.current.srcObject as MediaStream;
    if (!sourceStream.getVideoTracks().some((track) => track.readyState === 'live')) {
      console.warn('Registrazione non disponibile: la traccia video non è attiva.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      console.warn('Questo dispositivo non supporta la registrazione video in questa WebView.');
      return;
    }

    const mime = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mime) {
      console.warn('Nessun formato di registrazione compatibile è disponibile.');
      return;
    }

    try {
      recordingChunksRef.current = [];
      recordingMimeRef.current = mime;
      const recorder = new MediaRecorder(sourceStream, { mimeType: mime });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        console.error('Errore durante la registrazione', event);
        setIsRecording(false);
        recorderRef.current = null;
      };
      recorder.onstop = () => {
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (chunks.length) {
          const blob = new Blob(chunks, { type: recordingMimeRef.current });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `camguard-${camera.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        }
        setIsRecording(false);
        recorderRef.current = null;
      };
      recorder.start(1000);
      setIsRecording(true);
      playChimeSound();
    } catch (error) {
      console.error('Impossibile avviare la registrazione', error);
      setIsRecording(false);
      recorderRef.current = null;
    }
  };

  const handleStartIntercom = async () => {
    const pcAtStart = peerConnectionRef.current;
    writeDiagnostic('PARLA: pressione/inizio', {
      connectionState: pcAtStart?.connectionState ?? 'no-pc',
      iceConnectionState: pcAtStart?.iceConnectionState ?? 'no-pc',
      signalingState: pcAtStart?.signalingState ?? 'no-pc',
      transceivers: pcAtStart?.getTransceivers().map((transceiver) => ({
        kind: transceiver.receiver.track.kind,
        direction: transceiver.direction,
        currentDirection: transceiver.currentDirection,
        senderTrack: transceiver.sender.track?.kind ?? null,
      })) ?? [],
    });
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microfono non disponibile in questa WebView.');
      }
      if (!peerConnectionRef.current || peerConnectionRef.current.signalingState === 'closed') {
        throw new Error('Connessione video non attiva.');
      }

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
      const audioTrack = micStream.getAudioTracks()[0];
      if (!audioTrack) throw new Error('Traccia microfono non disponibile.');

      const pc = peerConnectionRef.current;
      // The audio transceiver was negotiated with the initial video offer.
      // Its sender.track is null until Talk is pressed, so find it through
      // the transceiver rather than getSenders().find(track.kind === 'audio').
      const audioTransceiver = pc.getTransceivers().find(
        (transceiver) => transceiver.receiver.track.kind === 'audio'
      );
      if (!audioTransceiver) {
        throw new Error('Canale audio non negoziato. Chiudi e riapri la telecamera.');
      }
      await audioTransceiver.sender.replaceTrack(audioTrack);
      writeDiagnostic('PARLA: replaceTrack(audio) completato', {
        senderTrackKind: audioTransceiver.sender.track?.kind ?? null,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
        note: 'La funzione non chiama createOffer/createAnswer e non modifica l’SDP.',
      });

      await signalingRef.current?.sendMessage('command', { command: 'intercom_start' });
      writeDiagnostic('PARLA: comando intercom_start inviato', {
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
      });
      setIsIntercomActive(true);
    } catch (err) {
      writeDiagnostic('ERRORE PARLA', {
        message: err instanceof Error ? err.message : String(err),
        connectionState: peerConnectionRef.current?.connectionState ?? 'no-pc',
        signalingState: peerConnectionRef.current?.signalingState ?? 'no-pc',
      });
      console.error('Intercom microphone error', err);
      setIsIntercomActive(false);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
    }
  };

  const handleStopIntercom = () => {
    const pc = peerConnectionRef.current;
    writeDiagnostic('PARLA: rilascio pulsante', {
      connectionState: pc?.connectionState ?? 'no-pc',
      iceConnectionState: pc?.iceConnectionState ?? 'no-pc',
      signalingState: pc?.signalingState ?? 'no-pc',
    });
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    // Keep the negotiated audio channel but stop sending microphone samples.
    const pc = peerConnectionRef.current;
    const audioTransceiver = pc?.getTransceivers().find(
      (transceiver) => transceiver.receiver.track.kind === 'audio'
    );
    if (audioTransceiver) {
      void audioTransceiver.sender.replaceTrack(null).catch((error) => {
        console.warn('Impossibile disattivare la traccia del microfono', error);
      });
    }
    if (signalingRef.current) {
      signalingRef.current.sendMessage('command', { command: 'intercom_stop' });
    }
    writeDiagnostic('PARLA: replaceTrack(null) richiesto; nessuna nuova SDP', {
      connectionState: pc?.connectionState ?? 'no-pc',
      signalingState: pc?.signalingState ?? 'no-pc',
    });
    setIsIntercomActive(false);
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (camera.type !== 'phone' || !video || !video.srcObject || video.readyState < 2) {
      console.warn('Snapshot unavailable: no live video frame is available.');
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      console.warn('Snapshot unavailable: video dimensions are not ready.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable');
      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          console.warn('Unable to encode snapshot image.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `camguard-snapshot-${camera.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        playChimeSound();
        setSnapshotFeedback(true);
        window.setTimeout(() => setSnapshotFeedback(false), 2400);
      }, 'image/jpeg', 0.92);
    } catch (error) {
      console.error('Unable to capture snapshot', error);
    }
  };

  const saveName = () => {
    setIsEditingName(false);
    if (name.trim()) {
      onUpdate({ ...camera, name: name.trim() });
    }
  };

  const isRealPhoneStream = camera.type === 'phone' && Boolean(videoRef.current?.srcObject);


  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 bg-[#080E18] text-[#F4F8FF] flex flex-col overflow-y-auto selection:bg-[#36C5FF]/30"
    >
      {/* 1. Header (Screen 3 in mockup) */}
      <header className="sticky top-0 z-40 bg-[#080E18]/90 backdrop-blur-md border-b border-[#24364D] px-4 py-3 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-[#101C2B] hover:bg-[#17283B] text-[#99B0CA] hover:text-[#F4F8FF] border border-[#24364D] transition-colors active:scale-95"
            title="Chiudi"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="min-w-0 flex items-center gap-2">
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-2 py-0.5 bg-[#101C2B] border border-[#36C5FF] rounded-lg text-sm text-[#F4F8FF] font-bold focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={saveName}
                  className="p-1 bg-[#36C5FF] text-[#080E18] rounded-lg"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#F4F8FF] tracking-tight truncate">
                  {camera.name}
                </h2>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="p-1 text-[#99B0CA] hover:text-[#F4F8FF]"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border flex items-center gap-1 shrink-0 ${isRealPhoneStream ? 'bg-[#45D7B0]/20 text-[#45D7B0] border-[#45D7B0]/35' : 'bg-[#FF6577]/20 text-[#FF6577] border-[#FF6577]/35'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isRealPhoneStream ? 'bg-[#45D7B0] animate-pulse' : 'bg-[#FF6577]'}`} />
              {isRealPhoneStream ? 'FLUSSO RICEVUTO' : camera.type === 'ip' ? 'RTSP NON COLLEGATO' : 'IN ATTESA DEL VIDEO'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 rounded-xl bg-[#101C2B] text-[#99B0CA] hover:text-[#F4F8FF] border border-[#24364D] transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-xl bg-[#101C2B] text-[#99B0CA] hover:text-[#F4F8FF] border border-[#24364D] transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content: Video Viewport & Controls */}
      <div className="max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* 2. Video Preview Container */}
        <div className="relative aspect-video w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-black border border-[#24364D] shadow-2xl">
          {camera.type === 'phone' ? (
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              autoPlay
              playsInline
              muted
              onDoubleClick={toggleDiagnosticsWithDoubleTap}
              onTouchEnd={toggleDiagnosticsWithDoubleTap}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#080E18] text-center p-6">
              <Camera className="w-10 h-10 text-[#64748B]" />
              <p className="text-sm font-bold text-white">Flusso RTSP/ONVIF non disponibile</p>
              <p className="text-xs text-[#99B0CA] max-w-sm">Questa versione non può riprodurre direttamente RTSP. Non viene mostrata un'immagine sostitutiva come se fosse il video reale.</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setDiagnosticsOpen((open) => !open);
              writeDiagnostic('Overlay diagnostica attivato tramite pulsante DIAG');
            }}
            className="absolute top-3 left-3 z-30 rounded-lg border border-[#36C5FF]/60 bg-black/75 px-3 py-1.5 text-[10px] font-bold tracking-widest text-[#36C5FF] backdrop-blur"
            title="Apri diagnostica WebRTC"
          >
            DIAG WEBRTC
          </button>

          {/* Buffering Indicator */}
          {isBuffering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080E18]/75 z-20">
              <div className="w-12 h-12 rounded-full border-2 border-[#24364D] border-t-[#36C5FF] animate-spin" />
              <p className="text-xs font-mono tracking-wider text-[#36C5FF] mt-3 uppercase">
                Aggancio Flusso Locale...
              </p>
            </div>
          )}

          {/* Snapshot Feedback Toast */}
          <AnimatePresence>
            {snapshotFeedback && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#45D7B0] text-[#080E18] text-xs font-bold px-3 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 z-30"
              >
                <Check className="w-4 h-4" />
                <span>Screenshot salvato in locale</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Top-Right Badges: HD selector + Fullscreen */}
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2">
            <button
              onClick={() => setSelectedQuality(selectedQuality === 'HD' ? '4K' : 'HD')}
              className="px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/80 text-[#F4F8FF] border border-white/15 backdrop-blur-md text-xs font-bold flex items-center gap-1 transition-colors"
            >
              <span>{selectedQuality}</span>
              <ChevronDown className="w-3 h-3 text-[#99B0CA]" />
            </button>

            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(() => {});
                } else {
                  document.exitFullscreen().catch(() => {});
                }
              }}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-[#F4F8FF] border border-white/15 backdrop-blur-md transition-colors"
              title="Schermo intero"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3. Circular Action Controls Row (Matching Screen 3 Mockup) */}
        <div className="flex items-center justify-around py-3 px-2 rounded-2xl bg-[#101C2B] border border-[#24364D]">
          {/* Screenshot */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.16 }}
              onClick={takeSnapshot}
              className="w-12 h-12 rounded-full bg-[#17283B] hover:bg-[#24364D] text-[#36C5FF] flex items-center justify-center border border-[#24364D] shadow-md cursor-pointer"
              title="Cattura screenshot"
            >
              <Camera className="w-5 h-5" />
            </motion.button>
            <span className="text-[11px] text-[#99B0CA] font-medium">Screenshot</span>
          </div>

          {/* Registra */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.16 }}
              onClick={toggleRecording}
              className={`w-12 h-12 rounded-full flex items-center justify-center border shadow-md cursor-pointer ${
                isRecording
                  ? 'bg-[#FF6577] text-white border-[#FF6577] shadow-[0_0_15px_rgba(255,101,119,0.5)]'
                  : 'bg-[#17283B] hover:bg-[#24364D] text-[#FF6577] border-[#24364D]'
              }`}
              title="Registra video"
            >
              <div className={`w-4 h-4 rounded-full ${isRecording ? 'bg-white animate-pulse' : 'bg-[#FF6577]'}`} />
            </motion.button>
            <span className="text-[11px] text-[#99B0CA] font-medium">
              {isRecording ? 'Registra (ON)' : 'Registra'}
            </span>
          </div>

          {/* Audio */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.16 }}
              onClick={() => setIsMuted(!isMuted)}
              className={`w-12 h-12 rounded-full flex items-center justify-center border shadow-md cursor-pointer ${
                !isMuted
                  ? 'bg-[#36C5FF] text-[#080E18] border-[#36C5FF]'
                  : 'bg-[#17283B] hover:bg-[#24364D] text-[#99B0CA] border-[#24364D]'
              }`}
              title="Attiva/Disattiva audio"
            >
              {!isMuted ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </motion.button>
            <span className="text-[11px] text-[#99B0CA] font-medium">Audio</span>
          </div>

          {/* Parla (Intercom) */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.16 }}
              onMouseDown={handleStartIntercom}
              onMouseUp={handleStopIntercom}
              onTouchStart={handleStartIntercom}
              onTouchEnd={handleStopIntercom}
              className={`w-12 h-12 rounded-full flex items-center justify-center border shadow-md cursor-pointer ${
                isIntercomActive
                  ? 'bg-[#45D7B0] text-[#080E18] border-[#45D7B0] scale-105'
                  : 'bg-[#17283B] hover:bg-[#24364D] text-[#45D7B0] border-[#24364D]'
              }`}
              title="Tieni premuto per parlare"
            >
              <Mic className="w-5 h-5" />
            </motion.button>
            <span className="text-[11px] text-[#99B0CA] font-medium">
              {isIntercomActive ? 'Parlando...' : 'Parla'}
            </span>
          </div>

          {/* Luce / Torcia */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.16 }}
              onClick={toggleTorch}
              className={`w-12 h-12 rounded-full flex items-center justify-center border shadow-md cursor-pointer ${
                torchOn
                  ? 'bg-[#FFC56E] text-[#080E18] border-[#FFC56E]'
                  : 'bg-[#17283B] hover:bg-[#24364D] text-[#FFC56E] border-[#24364D]'
              }`}
              title="Attiva/disattiva luce"
            >
              {torchOn ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
            </motion.button>
            <span className="text-[11px] text-[#99B0CA] font-medium">Luce</span>
          </div>
        </div>

        {/* 4. Interactive Timeline Bar (Matching Screen 3 Mockup) */}
        <div className="p-4 rounded-2xl bg-[#101C2B] border border-[#24364D] space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#F4F8FF]">Oggi, 26 Ottobre 2026</span>
            <span className="font-mono text-[#36C5FF] font-semibold">10:40:15</span>
          </div>

          {/* Interactive Scrub Timeline */}
          <div
            className="relative h-10 bg-[#080E18] rounded-xl border border-[#24364D] flex items-center px-4 cursor-pointer overflow-hidden select-none"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
              setTimelinePosition(pct);
            }}
          >
            {/* Hour ticks */}
            <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none text-[9px] font-mono text-[#99B0CA]/70">
              <span>10:00</span>
              <span>10:20</span>
              <span>10:40</span>
              <span>11:00</span>
              <span>11:20</span>
            </div>

            {/* Motion event zones on timeline */}
            <div className="absolute left-[30%] w-8 h-4 bg-[#FF6577]/30 rounded" />
            <div className="absolute left-[60%] w-12 h-4 bg-[#36C5FF]/30 rounded" />

            {/* Red playhead marker */}
            <div
              style={{ left: `${timelinePosition}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-[#FF6577] z-10 -translate-x-1/2 flex items-center justify-center"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF6577] -top-1 absolute" />
            </div>
          </div>
        </div>

        {/* 5. Eventi Rilevati Carousel con Miniature Fotografiche (Matching Screen 3 Mockup) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <h3 className="font-bold text-[#F4F8FF]">Eventi rilevati (3)</h3>
            <span className="text-[11px] text-[#99B0CA]">Oggi</span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {[
              { time: '10:32', type: 'Movimento', img: ASSETS.roomLivingRoom },
              { time: '10:12', type: 'Persona', img: ASSETS.roomGardenPatio },
              { time: '09:48', type: 'Movimento', img: ASSETS.roomModernGarage },
            ].map((ev, i) => (
              <div
                key={i}
                className="p-2 rounded-xl bg-[#101C2B] border border-[#24364D] space-y-1.5 cursor-pointer hover:border-[#36C5FF]/50 transition-colors"
              >
                <div className="relative aspect-video rounded-lg overflow-hidden border border-[#24364D]">
                  <img src={ev.img} alt={ev.type} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20" />
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-mono text-[#F4F8FF] font-bold">{ev.time}</span>
                  <span className="text-[#36C5FF]">{ev.type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. Settings Options List (Matching Screen 3 Mockup) */}
        <div className="rounded-2xl bg-[#101C2B] border border-[#24364D] divide-y divide-[#24364D]">
          <button className="w-full p-4 flex items-center justify-between text-left hover:bg-[#17283B] transition-colors rounded-t-2xl">
            <div className="flex items-center gap-3">
              <Settings className="w-4 h-4 text-[#36C5FF]" />
              <span className="text-xs font-semibold text-[#F4F8FF]">Impostazioni telecamera</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#99B0CA]" />
          </button>

          <button className="w-full p-4 flex items-center justify-between text-left hover:bg-[#17283B] transition-colors">
            <div className="flex items-center gap-3">
              <Radio className="w-4 h-4 text-[#45D7B0]" />
              <span className="text-xs font-semibold text-[#F4F8FF]">Dettagli dispositivo &amp; LAN</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#99B0CA]" />
          </button>

          <button className="w-full p-4 flex items-center justify-between text-left hover:bg-[#17283B] transition-colors rounded-b-2xl">
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-[#FFC56E]" />
              <span className="text-xs font-semibold text-[#F4F8FF]">Zona e posizione sulla planimetria</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#99B0CA]" />
          </button>
        </div>
      </div>
      {diagnosticsOpen && (
        <div className="absolute inset-3 z-[100] flex flex-col overflow-hidden rounded-2xl border border-[#36C5FF]/70 bg-[#050B13]/[0.97] shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b border-[#24364D] px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-black tracking-widest text-[#36C5FF]">DIAGNOSTICA WEBRTC</div>
              <div className="mt-1 text-[10px] text-[#99B0CA]">Doppio tap sul video per aprire/chiudere • aggiornamento statistiche ogni 2 s</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => void collectWebRtcStats()} className="rounded-lg border border-[#24364D] bg-[#101C2B] px-3 py-2 text-[11px] font-bold text-white">Aggiorna</button>
              <button type="button" onClick={exportWebRtcDiagnostics} className="rounded-lg border border-[#36C5FF]/50 bg-[#10263A] px-3 py-2 text-[11px] font-bold text-[#36C5FF]">Esporta JSON</button>
              <button type="button" onClick={() => setDiagnosticsOpen(false)} className="rounded-lg border border-[#24364D] bg-[#101C2B] px-3 py-2 text-[11px] font-bold text-white">Chiudi</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[#24364D] bg-[#101C2B] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#99B0CA]">Connection</div>
              <div className="mt-1 break-words text-sm font-bold text-white">{peerConnectionRef.current?.connectionState ?? 'assente'}</div>
            </div>
            <div className="rounded-lg border border-[#24364D] bg-[#101C2B] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#99B0CA]">ICE connection</div>
              <div className="mt-1 break-words text-sm font-bold text-white">{peerConnectionRef.current?.iceConnectionState ?? 'assente'}</div>
            </div>
            <div className="rounded-lg border border-[#24364D] bg-[#101C2B] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#99B0CA]">Signaling</div>
              <div className="mt-1 break-words text-sm font-bold text-white">{peerConnectionRef.current?.signalingState ?? 'assente'}</div>
            </div>
            <div className="rounded-lg border border-[#24364D] bg-[#101C2B] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#99B0CA]">Pacchetti video ricevuti</div>
              <div className="mt-1 text-xl font-black text-[#45D7B0]">{videoStats.packetsReceived ?? '—'}</div>
            </div>
            <div className="rounded-lg border border-[#24364D] bg-[#101C2B] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#99B0CA]">Pacchetti persi</div>
              <div className="mt-1 text-xl font-black text-[#FFC56E]">{videoStats.packetsLost ?? '—'}</div>
            </div>
            <div className="rounded-lg border border-[#24364D] bg-[#101C2B] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#99B0CA]">Bitrate video in ingresso</div>
              <div className="mt-1 text-xl font-black text-[#36C5FF]">
                {videoStats.bitrateBps === null ? 'calcolo…' : `${Math.round(videoStats.bitrateBps / 1000)} kbps`}
              </div>
            </div>
            <div className="rounded-lg border border-[#24364D] bg-[#101C2B] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#99B0CA]">Frame ricevuti / decodificati</div>
              <div className="mt-1 text-sm font-bold text-white">{videoStats.framesReceived ?? '—'} / {videoStats.framesDecoded ?? '—'}</div>
            </div>
            <div className="rounded-lg border border-[#24364D] bg-[#101C2B] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#99B0CA]">Risoluzione / codec</div>
              <div className="mt-1 break-words text-sm font-bold text-white">
                {videoStats.frameWidth && videoStats.frameHeight ? `${videoStats.frameWidth}×${videoStats.frameHeight}` : '—'}
                {videoStats.codec ? ` / ${videoStats.codec}` : ''}
              </div>
            </div>
            <div className="rounded-lg border border-[#24364D] bg-[#101C2B] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#99B0CA]">Byte video ricevuti</div>
              <div className="mt-1 break-words text-sm font-bold text-white">{videoStats.bytesReceived ?? '—'}</div>
            </div>
            {videoStats.error && (
              <div className="col-span-2 rounded-lg border border-[#FF6577]/60 bg-[#36131B] p-3 text-xs text-[#FF9BA7] sm:col-span-3">
                Errore statistiche: {videoStats.error}
              </div>
            )}
            <div className="col-span-2 rounded-lg border border-[#24364D] bg-[#101C2B] p-3 sm:col-span-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wide text-[#36C5FF]">SDP esatto scambiato</div>
                <div className="text-[10px] text-[#99B0CA]">
                  remoto m=video: {/(^|\r?\n)m=video /m.test(diagnosticSdp.remote) ? 'SÌ' : 'NO'}
                  {' • '}
                  locale m=video: {/(^|\r?\n)m=video /m.test(diagnosticSdp.local) ? 'SÌ' : 'NO'}
                </div>
              </div>
              <details className="mb-2 rounded-md border border-[#24364D] p-2">
                <summary className="cursor-pointer text-xs font-bold text-white">SDP remoto (offerta normalmente inviata dal telefono)</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[9px] leading-4 text-[#B5C8DD]">{diagnosticSdp.remote || 'In attesa di SDP remoto…'}</pre>
              </details>
              <details className="rounded-md border border-[#24364D] p-2">
                <summary className="cursor-pointer text-xs font-bold text-white">SDP locale (risposta del centro di controllo)</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[9px] leading-4 text-[#B5C8DD]">{diagnosticSdp.local || 'In attesa di SDP locale…'}</pre>
              </details>
            </div>
            <div className="col-span-2 rounded-lg border border-[#24364D] bg-[#101C2B] p-3 sm:col-span-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wide text-[#36C5FF]">Eventi in ordine temporale</div>
                <div className="text-[10px] text-[#99B0CA]">{diagnosticEntries.length} eventi (max 300)</div>
              </div>
              <div className="max-h-56 overflow-auto rounded-md bg-black/40 p-2 font-mono text-[9px] leading-4 text-[#B5C8DD]">
                {diagnosticEntries.length === 0 ? (
                  <div>Nessun evento registrato finora.</div>
                ) : (
                  diagnosticEntries.map((entry, index) => <div key={index} className="break-all border-b border-white/5 py-1">{entry}</div>)
                )}
              </div>
            </div>
            <div className="col-span-2 pb-2 text-[10px] text-[#99B0CA] sm:col-span-3">
              Il bitrate richiede almeno due campioni. “Pacchetti persi” e contatori provengono da getStats(); gli errori di negoziazione/playback compaiono nel registro.
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

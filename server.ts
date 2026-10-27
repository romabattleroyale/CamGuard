import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import os from 'os';
import path from 'path';
import { randomInt, randomUUID } from 'node:crypto';

interface SignalingMessage {
  id: string;
  sender: 'viewer' | 'camera';
  target: 'viewer' | 'camera';
  type: 'offer' | 'answer' | 'candidate' | 'command' | 'status' | 'disconnect';
  payload: any;
  timestamp: number;
}

interface Session {
  id: string;
  pin: string;
  name?: string;
  createdAt: number;
  lastPing: number;
  cameraInfo?: {
    model?: string;
    batteryLevel?: number;
    isCharging?: boolean;
    facing?: string;
    resolution?: string;
    torchSupported?: boolean;
    motionDetected?: boolean;
  };
  messages: SignalingMessage[];
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Render terminates HTTPS before forwarding requests to the Node process.
app.set('trust proxy', 1);

// Allow the hosted web app plus the known Capacitor WebView origins.
// Keep this scoped rather than enabling CORS for every arbitrary website.
const allowedCorsOrigins = new Set([
  'https://camguard-signaling.onrender.com',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost',
]);
app.use((req: Request, res: Response, next) => {
  const origin = req.get('origin');
  let isAllowedOrigin = !origin || allowedCorsOrigins.has(origin);
  if (origin && !isAllowedOrigin) {
    try {
      const parsedOrigin = new URL(origin);
      isAllowedOrigin =
        parsedOrigin.hostname === 'localhost' &&
        ['http:', 'https:', 'capacitor:'].includes(parsedOrigin.protocol);
    } catch {
      isAllowedOrigin = false;
    }
  }

  if (origin && isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(isAllowedOrigin ? 204 : 403);
  }
  next();
});

// Bound JSON payload size so signaling endpoints cannot accept arbitrary large bodies.
app.use(express.json({ limit: '256kb' }));

const allowedMessageTypes = new Set([
  'offer',
  'answer',
  'candidate',
  'command',
  'status',
  'disconnect',
]);
function isValidRole(value: unknown): value is 'viewer' | 'camera' {
  return value === 'viewer' || value === 'camera';
}

// In-memory sessions store (kept for 2 hours)
const sessions = new Map<string, Session>();
const pinIndex = new Map<string, string>(); // PIN -> sessionId

// Helper to clean up old sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastPing > 2 * 60 * 60 * 1000) {
      if (session.pin) pinIndex.delete(session.pin);
      sessions.delete(id);
    }
  }
}, 60000);

// Helper to get local network IP
function getLocalNetworkIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
      if (!iface.internal && iface.family === 'IPv4') {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// LAN info endpoint
app.get('/api/lan-info', (req: Request, res: Response) => {
  const localIp = getLocalNetworkIp();
  const host = req.get('host') || `${localIp}:${PORT}`;
  const protocol = req.protocol || 'http';
  res.json({
    localIp,
    port: PORT,
    detectedHost: host,
    lanUrl: `${protocol}://${host}`,
  });
});

// Create new camera session (initiated by Viewer)
app.post('/api/signaling/create', (req: Request, res: Response) => {
  const id = `cam_${randomUUID()}`;
  // Use a cryptographically secure 6-digit PIN and avoid collisions.
  let pin = '';
  do {
    pin = String(randomInt(100000, 1000000));
  } while (pinIndex.has(pin));

  const requestedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const session: Session = {
    id,
    pin,
    name: (requestedName || 'Telefono Camera').slice(0, 80),
    createdAt: Date.now(),
    lastPing: Date.now(),
    messages: [],
  };

  sessions.set(id, session);
  pinIndex.set(pin, id);

  res.json({
    success: true,
    sessionId: id,
    pin,
  });
});

// Join an existing session (initiated by Camera phone)
app.post('/api/signaling/join', (req: Request, res: Response) => {
  const { sessionId, pin, cameraInfo } = req.body ?? {};
  let targetSessionId = typeof sessionId === 'string' ? sessionId : '';

  if (!targetSessionId && typeof pin === 'string') {
    targetSessionId = pinIndex.get(pin.trim()) || '';
  }

  if (!targetSessionId || !sessions.has(targetSessionId)) {
    res.status(404).json({ error: 'Sessione non trovata o codice non valido' });
    return;
  }

  const session = sessions.get(targetSessionId)!;
  const suppliedPin = typeof pin === 'string' ? pin.trim() : '';
  if (!suppliedPin || suppliedPin !== session.pin) {
    res.status(403).json({ error: 'PIN di abbinamento non valido' });
    return;
  }

  session.lastPing = Date.now();
  if (cameraInfo) {
    session.cameraInfo = { ...session.cameraInfo, ...cameraInfo };
  }

  // Notify viewer that camera has joined
  session.messages.push({
    id: 'msg_' + Math.random().toString(36).substring(2, 9),
    sender: 'camera',
    target: 'viewer',
    type: 'status',
    payload: { status: 'joined', cameraInfo: session.cameraInfo },
    timestamp: Date.now(),
  });

  res.json({
    success: true,
    sessionId: session.id,
    name: session.name,
    pin: session.pin,
  });
});

// Send a signaling message (offer, answer, candidate, command, status)
app.post('/api/signaling/:sessionId/message', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Sessione scaduta o inesistente' });
    return;
  }

  const suppliedPin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
  if (!suppliedPin || suppliedPin !== session.pin) {
    res.status(403).json({ error: 'PIN di abbinamento non valido' });
    return;
  }

  session.lastPing = Date.now();
  const { sender, type, payload } = req.body ?? {};
  if (!isValidRole(sender) || typeof type !== 'string' || !allowedMessageTypes.has(type)) {
    res.status(400).json({ error: 'Ruolo o tipo di messaggio non valido' });
    return;
  }
  if (payload === undefined || (typeof payload !== 'object' && typeof payload !== 'string')) {
    res.status(400).json({ error: 'Payload non valido' });
    return;
  }

  const target = sender === 'viewer' ? 'camera' : 'viewer';
  const requestedId = typeof req.body?.id === 'string' ? req.body.id : '';
  const safeId = /^msg_[a-zA-Z0-9_-]{1,100}$/.test(requestedId)
    ? requestedId
    : `msg_${randomUUID()}`;
  const message: SignalingMessage = {
    id: safeId,
    sender,
    target,
    type: type as SignalingMessage['type'],
    payload,
    timestamp: Date.now(),
  };

  session.messages.push(message);

  // Keep last 100 messages max
  if (session.messages.length > 100) {
    session.messages = session.messages.slice(-100);
  }

  if (type === 'status' && sender === 'camera' && payload?.cameraInfo) {
    session.cameraInfo = { ...session.cameraInfo, ...payload.cameraInfo };
  }

  res.json({ success: true, messageId: message.id });
});

// Poll messages intended for this role
app.get('/api/signaling/:sessionId/messages', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const rawRole = req.query.role;
  if (!isValidRole(rawRole)) {
    res.status(400).json({ error: 'Ruolo non valido' });
    return;
  }
  const role = rawRole;
  const rawSince = req.query.since;
  const parsedSince = typeof rawSince === 'string' ? Number(rawSince) : 0;
  const since = Number.isFinite(parsedSince) && parsedSince >= 0 ? parsedSince : 0;

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Sessione scaduta' });
    return;
  }

  const suppliedPin = typeof req.query.pin === 'string' ? req.query.pin.trim() : '';
  if (!suppliedPin || suppliedPin !== session.pin) {
    res.status(403).json({ error: 'PIN di abbinamento non valido' });
    return;
  }

  session.lastPing = Date.now();

  // Find messages where target matches role and timestamp > since
  const pending = session.messages.filter(
    (m) => m.target === role && m.timestamp > since
  );

  res.json({
    sessionId,
    messages: pending,
    cameraInfo: session.cameraInfo,
    timestamp: Date.now(),
  });
});

// Terminate or remove session. The session PIN is required to prevent
// anyone who only knows the session ID from disconnecting a camera.
app.post('/api/signaling/:sessionId/leave', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Sessione scaduta o inesistente' });
    return;
  }

  const suppliedPin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
  if (!suppliedPin || suppliedPin !== session.pin) {
    res.status(403).json({ error: 'PIN di abbinamento non valido' });
    return;
  }

  pinIndex.delete(session.pin);
  sessions.delete(sessionId);
  res.json({ success: true });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

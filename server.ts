import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import os from 'os';
import path from 'path';

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

app.use(express.json());

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
  const id = 'cam_' + Math.random().toString(36).substring(2, 9);
  // 6-digit numeric PIN
  let pin = Math.floor(100000 + Math.random() * 900000).toString();
  while (pinIndex.has(pin)) {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  }

  const session: Session = {
    id,
    pin,
    name: req.body.name || 'Telefono Camera',
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
  const { sessionId, pin, cameraInfo } = req.body;
  let targetSessionId = sessionId;

  if (!targetSessionId && pin) {
    targetSessionId = pinIndex.get(String(pin).trim());
  }

  if (!targetSessionId || !sessions.has(targetSessionId)) {
    res.status(404).json({ error: 'Sessione non trovata o codice non valido' });
    return;
  }

  const session = sessions.get(targetSessionId)!;
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

  session.lastPing = Date.now();
  const { sender, type, payload } = req.body;
  const target = sender === 'viewer' ? 'camera' : 'viewer';

  const message: SignalingMessage = {
    id: 'msg_' + Math.random().toString(36).substring(2, 9),
    sender,
    target,
    type,
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
  const role = req.query.role as 'viewer' | 'camera';
  const since = parseInt(req.query.since as string, 10) || 0;

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Sessione scaduta' });
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

// Terminate or remove session
app.post('/api/signaling/:sessionId/leave', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (session) {
    if (session.pin) pinIndex.delete(session.pin);
    sessions.delete(sessionId);
  }
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

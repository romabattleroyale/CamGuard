import { CameraDevice } from '../types/camera';

export interface SignalingMessage {
  id: string;
  sender: 'viewer' | 'camera';
  target: 'viewer' | 'camera';
  type: 'offer' | 'answer' | 'candidate' | 'command' | 'status' | 'disconnect';
  payload: any;
  timestamp: number;
}

export type MessageCallback = (msg: SignalingMessage) => void;

/**
 * Dual Signaling client: Uses BroadcastChannel for instant same-browser cross-tab comms,
 * AND REST polling against /api/signaling for cross-device LAN comms.
 */
export class SignalingClient {
  private sessionId: string;
  private role: 'viewer' | 'camera';
  private broadcastChannel: BroadcastChannel | null = null;
  private pollInterval: any = null;
  private lastTimestamp: number = 0;
  private listeners: Set<MessageCallback> = new Set();
  private isDestroyed = false;

  constructor(sessionId: string, role: 'viewer' | 'camera') {
    this.sessionId = sessionId;
    this.role = role;

    // 1. Setup BroadcastChannel for instant local tab testing
    try {
      this.broadcastChannel = new BroadcastChannel(`camguard_${sessionId}`);
      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data as SignalingMessage;
        if (msg && msg.target === this.role) {
          this.notifyListeners(msg);
        }
      };
    } catch (err) {
      console.warn('BroadcastChannel not supported', err);
    }

    // 2. Setup server REST polling for separate devices on Wi-Fi
    this.startPolling();
  }

  public onMessage(callback: MessageCallback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(msg: SignalingMessage) {
    this.listeners.forEach((cb) => {
      try {
        cb(msg);
      } catch (err) {
        console.error('Error in signaling listener', err);
      }
    });
  }

  public async sendMessage(
    type: SignalingMessage['type'],
    payload: any
  ): Promise<boolean> {
    const msg: SignalingMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      sender: this.role,
      target: this.role === 'viewer' ? 'camera' : 'viewer',
      type,
      payload,
      timestamp: Date.now(),
    };

    // Broadcast locally to tabs
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.warn('BroadcastChannel error', err);
      }
    }

    // Send to LAN server
    try {
      await fetch(`/api/signaling/${this.sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: this.role,
          type,
          payload,
        }),
      });
      return true;
    } catch (err) {
      // In purely offline mock/same tab, server fetch might fail or return error, which is fine
      return false;
    }
  }

  private startPolling() {
    const poll = async () => {
      if (this.isDestroyed) return;
      try {
        const res = await fetch(
          `/api/signaling/${this.sessionId}/messages?role=${this.role}&since=${this.lastTimestamp}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.messages && Array.isArray(data.messages)) {
            data.messages.forEach((m: SignalingMessage) => {
              if (m.timestamp > this.lastTimestamp) {
                this.lastTimestamp = m.timestamp;
                this.notifyListeners(m);
              }
            });
          }
        }
      } catch {
        // Ignore polling errors
      }
    };

    // Fast poll for low-latency pairing & messages (650ms)
    this.pollInterval = setInterval(poll, 650);
    poll();
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    this.listeners.clear();
  }
}

/**
 * Creates standard WebRTC RTCPeerConnection configuration
 */
export function createPeerConnectionConfig(): RTCConfiguration {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 4,
  };
}

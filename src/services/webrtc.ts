import { CameraDevice } from '../types/camera';
import { apiFetch } from './api';

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
  private processedMessageIds = new Set<string>();
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
          this.processIncoming(msg);
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

  private processIncoming(msg: SignalingMessage) {
    if (msg.id && this.processedMessageIds.has(msg.id)) return;
    if (msg.id) {
      this.processedMessageIds.add(msg.id);
      // Keep memory bounded; older messages are outside the polling cursor window.
      if (this.processedMessageIds.size > 1000) {
        const oldest = this.processedMessageIds.values().next().value;
        if (oldest) this.processedMessageIds.delete(oldest);
      }
    }
    this.lastTimestamp = Math.max(this.lastTimestamp, msg.timestamp || 0);
    this.notifyListeners(msg);
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
      await apiFetch(`/api/signaling/${this.sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: msg.id,
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
        const res = await apiFetch(
          `/api/signaling/${this.sessionId}/messages?role=${this.role}&since=${Math.max(0, this.lastTimestamp - 1)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.messages && Array.isArray(data.messages)) {
            data.messages.forEach((m: SignalingMessage) => {
              this.processIncoming(m);
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

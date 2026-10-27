export type CameraType = 'phone' | 'ip';

export type CameraStatus = 'online' | 'connecting' | 'offline';

export interface CameraDevice {
  id: string;
  name: string;
  type: CameraType;
  status: CameraStatus;
  location?: string;
  room?: string;
  coverImage?: string;
  isIndoor?: boolean; // True for indoor rooms (blurred in Privacy Mode), false for outdoors
  createdAt: number;
  lastSeen?: number;

  // Specific to Phone Camera
  sessionId?: string;
  pin?: string;
  batteryLevel?: number; // 0 to 100
  isCharging?: boolean;
  facingMode?: 'environment' | 'user';
  torchOn?: boolean;
  resolution?: string;
  fps?: number;
  motionDetected?: boolean;
  motionSensitivity?: number; // 1 to 10
  lastMotionAt?: number;
  viewerCount?: number;

  // Specific to IP Camera
  brand?: 'tapo' | 'ezviz' | 'reolink' | 'generic';
  ip?: string;
  port?: number;
  username?: string;
  password?: string;
  streamPath?: string;
  rtspUrl?: string;
  isSimulated?: boolean;
  ptzSupport?: boolean;
  currentPan?: number;
  currentTilt?: number;
}

export interface MotionEvent {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  snapshotUrl?: string;
  description: string;
}

export interface SignalingPayload {
  type: 'offer' | 'answer' | 'candidate' | 'command' | 'status' | 'disconnect';
  sender: 'viewer' | 'camera';
  payload: any;
}

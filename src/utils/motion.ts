/**
 * Lightweight local motion detector using Canvas image diffing
 * Runs on-device at 5 FPS without requiring heavy ML models or cloud processing.
 */
export class MotionDetector {
  private prevFrameData: Uint8ClampedArray | null = null;
  private width = 160;
  private height = 90;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private sensitivity: number; // 1 to 10 (higher = more sensitive)
  private cooldownMs = 2500;
  private lastTriggerTime = 0;

  constructor(sensitivity = 5) {
    this.sensitivity = sensitivity;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  public setSensitivity(val: number) {
    this.sensitivity = Math.max(1, Math.min(10, val));
  }

  public processVideoFrame(video: HTMLVideoElement): {
    motionDetected: boolean;
    motionScore: number;
    snapshotUrl?: string;
  } {
    if (!this.ctx || video.readyState < 2) {
      return { motionDetected: false, motionScore: 0 };
    }

    this.ctx.drawImage(video, 0, 0, this.width, this.height);
    const frame = this.ctx.getImageData(0, 0, this.width, this.height);
    const data = frame.data;

    if (!this.prevFrameData) {
      this.prevFrameData = new Uint8ClampedArray(data);
      return { motionDetected: false, motionScore: 0 };
    }

    let diffCount = 0;
    // Threshold inversely related to sensitivity:
    // sensitivity 10 -> diff threshold 20, sensitivity 1 -> diff threshold 65
    const diffThreshold = Math.max(15, 70 - this.sensitivity * 5);
    const totalPixels = this.width * this.height;

    for (let i = 0; i < data.length; i += 4) {
      // Fast luminance diff
      const lumCurr = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const lumPrev =
        0.299 * this.prevFrameData[i] +
        0.587 * this.prevFrameData[i + 1] +
        0.114 * this.prevFrameData[i + 2];

      if (Math.abs(lumCurr - lumPrev) > diffThreshold) {
        diffCount++;
      }
    }

    // Save current frame for next comparison
    this.prevFrameData.set(data);

    // Percentage of frame with motion
    const motionPercentage = (diffCount / totalPixels) * 100;
    const triggerThreshold = Math.max(1.5, 6 - this.sensitivity * 0.4);

    const now = Date.now();
    const isMotion = motionPercentage > triggerThreshold;

    if (isMotion && now - this.lastTriggerTime > this.cooldownMs) {
      this.lastTriggerTime = now;

      // Capture snapshot
      let snapshotUrl: string | undefined;
      try {
        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = 480;
        snapCanvas.height = Math.round((480 * video.videoHeight) / (video.videoWidth || 1));
        const snapCtx = snapCanvas.getContext('2d');
        if (snapCtx) {
          snapCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
          snapshotUrl = snapCanvas.toDataURL('image/jpeg', 0.65);
        }
      } catch {
        // Ignore
      }

      return {
        motionDetected: true,
        motionScore: Math.round(motionPercentage * 10) / 10,
        snapshotUrl,
      };
    }

    return {
      motionDetected: false,
      motionScore: Math.round(motionPercentage * 10) / 10,
    };
  }

  public reset() {
    this.prevFrameData = null;
  }
}

/**
 * Device helpers: Screen WakeLock and Battery API
 */

export class WakeLockManager {
  private sentinel: any = null;

  public async acquire(): Promise<boolean> {
    if ('wakeLock' in navigator) {
      try {
        this.sentinel = await (navigator as any).wakeLock.request('screen');
        this.sentinel.addEventListener('release', () => {
          this.sentinel = null;
        });
        return true;
      } catch (err) {
        console.warn('Wake Lock request failed', err);
        return false;
      }
    }
    return false;
  }

  public release() {
    if (this.sentinel) {
      try {
        this.sentinel.release();
      } catch {
        // Ignore
      }
      this.sentinel = null;
    }
  }
}

export async function getBatteryStatus(): Promise<{
  level: number;
  charging: boolean;
} | null> {
  if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
    try {
      const battery = await (navigator as any).getBattery();
      return {
        level: Math.round(battery.level * 100),
        charging: Boolean(battery.charging),
      };
    } catch {
      return null;
    }
  }
  return null;
}

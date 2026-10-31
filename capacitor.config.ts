import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cscmessage.app',
  appName: 'CsCMessage',
  webDir: 'dist',
  android: { backgroundColor: '#080d1b' },
  ios: { contentInset: 'automatic' }
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cscmessage.app',
  appName: 'CsCMessage',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: { backgroundColor: '#080d1b' },
  ios: { contentInset: 'automatic' }
};

export default config;

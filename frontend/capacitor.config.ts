import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ikas.app',
  appName: 'ikas',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
  },
};

export default config;

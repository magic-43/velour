import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.velour.luxury',
  appName: 'Velour',
  webDir: 'dist',
  backgroundColor: '#0a0a0c',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0c',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0a0a0c',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
  android: {
    backgroundColor: '#0a0a0c',
    allowMixedContent: true,
    captureInput: true,
  },
};

export default config;

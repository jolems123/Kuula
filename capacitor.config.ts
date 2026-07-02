import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ug.kuula.app',
  appName: 'Kuula',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    // WebView debugging is OFF in release builds — keeps JS console out of
    // the shipped APK and avoids leaking internal logs via remote inspection.
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    // iOS WKWebView scrolls the body by default, which fights our in-app
    // scroll region. Disable it so only the screen content scrolls.
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0D5C3A',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      // Auto-hide is also triggered from useNativeChrome() once React has
      // mounted, so the splash never lingers past first paint on slow devices.
      androidSplashResourceName: 'splash',
    },
    StatusBar: {
      // Default styling — overridden at runtime by useNativeChrome() so the
      // status bar matches the active screen's header.
      style: 'LIGHT',
      backgroundColor: '#0A4A2E',
      overlaysWebView: false,
    },
  },
};

export default config;

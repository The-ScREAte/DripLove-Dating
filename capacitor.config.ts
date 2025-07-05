import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.fef6ab3677bc4046b6f5fc5b2ad8c182',
  appName: 'AfroVibe',
  webDir: 'dist',
  // Toggle the next line ON/OFF depending on your build type:
  // server: {
  //   url: 'https://fef6ab36-77bc-4046-b6f5-fc5b2ad8c182.lovableproject.com?forceHideBadge=true',
  //   cleartext: true
  // },
  plugins: {
    Keyboard: {
      resize: 'native',
      style: 'dark',
      resizeOnFullScreen: true
    }
  }
};

export default config;


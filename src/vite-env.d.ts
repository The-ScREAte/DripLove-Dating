/// <reference types="vite/client" />

interface CapacitorInstance {
  isNativePlatform: () => boolean;
  getPlatform: () => string;
}

interface Window {
  Capacitor?: CapacitorInstance;
}

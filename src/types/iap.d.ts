// Global type declarations for IAP
declare global {
  interface Window {
    iapPurchaseInitiated?: boolean;
    iapInitializationFailed?: boolean;
    CdvPurchase?: {
      store?: any;
    };
  }
}

export {};
// Global type declarations for IAP
declare global {
  interface Window {
    iapPurchaseInitiated?: boolean;
    CdvPurchase?: {
      store?: any;
    };
  }
}

export {};
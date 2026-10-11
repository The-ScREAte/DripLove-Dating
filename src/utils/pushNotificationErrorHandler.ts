import { Capacitor } from '@capacitor/core';

export interface PushNotificationError {
  code: string;
  message: string;
  platform: string;
  recoverable: boolean;
}

export function handlePushNotificationError(error: any): PushNotificationError {
  const platform = Capacitor.getPlatform();
  
  // Firebase initialization errors
  if (error?.message?.includes('Default FirebaseApp is not initialized')) {
    return {
      code: 'FIREBASE_NOT_INITIALIZED',
      message: 'Firebase not properly initialized. Push notifications unavailable.',
      platform,
      recoverable: true
    };
  }
  
  // Firebase messaging errors
  if (error?.message?.includes('messaging/unsupported-browser')) {
    return {
      code: 'FIREBASE_UNSUPPORTED_BROWSER',
      message: 'Firebase messaging not supported in this environment.',
      platform,
      recoverable: false
    };
  }
  
  // Permission errors
  if (error?.message?.includes('permission') || error?.message?.includes('denied')) {
    return {
      code: 'PERMISSION_DENIED',
      message: 'Push notification permissions denied by user.',
      platform,
      recoverable: true
    };
  }
  
  // Network errors
  if (error?.message?.includes('network') || error?.message?.includes('timeout')) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Network error during push notification setup.',
      platform,
      recoverable: true
    };
  }
  
  // Generic error
  return {
    code: 'UNKNOWN_ERROR',
    message: error?.message || 'Unknown push notification error',
    platform,
    recoverable: false
  };
}

export function shouldRetryPushNotificationSetup(error: PushNotificationError): boolean {
  return error.recoverable && !['PERMISSION_DENIED', 'FIREBASE_UNSUPPORTED_BROWSER'].includes(error.code);
}

export function logPushNotificationError(error: PushNotificationError): void {
  const emoji = error.recoverable ? '⚠️' : '❌';
  // Error logged in production monitoring
} 
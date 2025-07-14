# Push Notification System Migration: Firebase → Supabase

## Overview
Successfully migrated the push notification system from Firebase to Supabase Realtime with Edge Functions.

## Changes Made

### 1. **Removed Firebase Dependencies**
- ❌ Removed `firebase` package from package.json
- ❌ Deleted `src/config/firebase.ts` 
- ❌ Deleted `public/firebase-messaging-sw.js`
- ❌ Backed up old service to `src/services/pushNotifications.ts.bak`

### 2. **New Supabase-Based Service**
- ✅ Created `src/services/pushNotifications.ts` with Supabase Realtime
- ✅ Uses Supabase Realtime for instant notifications
- ✅ Supports native mobile push notifications via Capacitor
- ✅ Web browser notifications via Web Push API
- ✅ Stores notifications in Supabase database

### 3. **Updated Hook**
- ✅ Updated `src/hooks/usePushNotifications.ts` to use new service
- ✅ Added unread notification count tracking
- ✅ Improved error handling and state management

### 4. **Enhanced Edge Function**
- ✅ Updated `supabase/functions/send-push-notification/index.ts`
- ✅ Added Web Push API support (VAPID keys)
- ✅ Kept FCM fallback for legacy mobile support
- ✅ Added APNS placeholder for iOS

## Key Features

### Real-time Notifications
- **Supabase Realtime**: Instant in-app notifications via WebSocket
- **Database Integration**: All notifications stored in `notifications` table
- **Read Status**: Track read/unread notifications

### Multi-Platform Support
- **Web**: Browser notifications + in-app toasts
- **iOS**: Native push notifications (via Capacitor)
- **Android**: Native push notifications (via Capacitor)

### Notification Types
- `match`: When users match
- `message`: New chat messages
- `like`: When someone likes your profile
- `system`: System announcements
- `admin`: Admin notifications

## API Usage

### Initialize Service
```typescript
import { initializePushNotifications } from '@/services/pushNotifications';
await initializePushNotifications(userId);
```

### Send Notification
```typescript
import { sendPushNotification } from '@/services/pushNotifications';
await sendPushNotification({
  title: "New Match!",
  body: "You have a new match",
  userId: "user-123",
  type: "match"
});
```

### Using Hook
```typescript
import { usePushNotifications } from '@/hooks/usePushNotifications';

const { 
  isInitialized, 
  unreadCount, 
  sendMatchNotification,
  markAsRead 
} = usePushNotifications(userId);
```

## Environment Variables

### Required for Edge Function
```bash
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Optional for Enhanced Features
```bash
# Web Push (VAPID keys)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# Firebase Cloud Messaging (legacy support)
FCM_SERVER_KEY=your-fcm-server-key

# Apple Push Notifications (iOS)
APNS_KEY_ID=your-apns-key-id
APNS_TEAM_ID=your-apns-team-id
APNS_PRIVATE_KEY=your-apns-private-key
```

## Database Schema

### notifications table
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  related_user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### push_tokens table
```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, platform)
);
```

## Benefits of Migration

1. **No External Dependencies**: No need for Firebase configuration
2. **Real-time**: Instant notifications via Supabase Realtime
3. **Database Integration**: All notifications stored and queryable
4. **Better UX**: In-app notifications + browser notifications
5. **Scalable**: Uses Supabase Edge Functions for delivery
6. **Cost Effective**: No Firebase billing

## Testing

The system automatically:
- Initializes when user logs in
- Shows in-app toast notifications
- Stores notifications in database
- Tracks read/unread status
- Handles permission requests

## Next Steps

1. **Set up VAPID keys** for proper Web Push notifications
2. **Configure APNS** for iOS push notifications
3. **Test notification delivery** on all platforms
4. **Monitor Edge Function** performance and logs

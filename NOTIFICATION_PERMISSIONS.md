# 🔔 Notification Permission System

## Overview
DripLove automatically requests notification permissions for all users (not just admins) with smart retry logic.

## How It Works

### ✅ **For Regular Users (Automatic)**
1. **First Login**: Permission request pops up automatically
2. **If User Accepts**: 
   - ✅ Notifications are enabled immediately
   - Custom sound plays for all notifications
   - Push tokens are saved to database

3. **If User Declines**:
   - ⏰ System waits **3 days** before asking again
   - Timestamp is saved in localStorage
   - After 3 days, next app launch will trigger permission request again
   - This cycle repeats until user accepts

### 🛡️ **For Admin Users (Manual Testing)**
- Admin page has `NotificationTester` component
- **"Enable Notifications" button** shows if not initialized
- Used for testing notification functionality
- Regular users never see this component

## Storage System

### LocalStorage Key
- **Key**: `notification_permission_last_denied`
- **Value**: ISO timestamp of last denial (e.g., `"2025-10-27T15:30:00.000Z"`)

### Logic
```typescript
// Check if 3 days have passed since last denial
const daysSinceDenial = (Date.now() - lastDenied) / (1000 * 60 * 60 * 24);
if (daysSinceDenial >= 3) {
  // Show permission request again
}
```

## Permission States

### iOS/Android Native
- **granted**: User accepted ✅
- **denied**: User declined ❌
- **prompt**: Not asked yet ⏳

### Web Browser
- **granted**: User accepted ✅
- **denied**: User declined ❌
- **default**: Not asked yet ⏳

## Implementation Details

### Files Modified
1. **`src/services/pushNotifications.ts`**
   - Added `PERMISSION_DENIAL_KEY` constant
   - Added `RETRY_DELAY_DAYS = 3` constant
   - `shouldRequestPermission()` - Checks if 3 days passed
   - `recordPermissionDenial()` - Saves denial timestamp
   - `clearPermissionDenial()` - Removes timestamp on grant
   - Updated `initializeNativePushNotifications()` - Respects retry delay
   - Updated `requestWebNotificationPermission()` - Respects retry delay

2. **`src/components/NotificationTester.tsx`**
   - Added permission request button for admins
   - Shows yellow alert when not initialized
   - Only visible in admin page

## User Experience

### Regular User Flow
```
App Launch → Auto Permission Request → User's Choice
   ↓                                         ↓
Granted?                                  Denied?
   ↓                                         ↓
✅ Notifications Active               ⏰ Wait 3 Days
                                            ↓
                                    Next Login → Ask Again
```

### Admin Testing Flow
```
Admin Page → See "Enable Notifications" Button
     ↓
Tap Button → iOS Permission Dialog
     ↓
Grant Permission → System Ready ✅
     ↓
Test All Notification Types
```

## Benefits

✅ **Non-Intrusive**: Users aren't spammed with permission requests
✅ **Automatic**: No manual intervention needed for regular users  
✅ **Smart Retry**: 3-day delay respects user experience
✅ **Persistent**: Works across app updates and reinstalls
✅ **Platform Agnostic**: Works on iOS, Android, and Web

## Testing

### Test Permission Denial & Retry
1. Launch app and **decline** notification permission
2. Check localStorage: `notification_permission_last_denied` should be set
3. Close and reopen app → No permission request (too soon)
4. **Change system date** forward by 3+ days
5. Close and reopen app → Permission request appears again ✅

### Test Admin Panel
1. Login as admin user
2. Navigate to Admin page
3. If notifications not enabled, see yellow "Enable Notifications" button
4. Tap button → Grant permission
5. Page reloads → See "✅ Notification System Ready"
6. Test all notification types

## Notes
- Admin panel button is **only for testing** purposes
- Regular users get **automatic** permission requests
- System respects user's choice with 3-day cooldown
- localStorage is used (not database) to avoid server load
- Permission state is per-device (if user has multiple devices, each gets asked separately)

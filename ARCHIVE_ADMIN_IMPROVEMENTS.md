# Archive System - Admin Panel Improvements

## ✅ Implementation Summary (December 21, 2024)

### What Was Added

#### 1. **Admin Visibility** (Read-Only)
- **Location**: [AdminPage.tsx](src/components/AdminPage.tsx)
- **Changes**:
  - Added `is_archived` field to user query (line ~930)
  - Added subtle gray "Archived" badge for archived users (line ~1910)
  - **No toggles, no buttons** — admin can only view status

#### 2. **Email Re-Engagement** 
- **Location**: [EmailExport.tsx](src/components/admin/EmailExport.tsx)
- **Changes**:
  - Added checkbox: "Include archived users (for re-engagement emails)"
  - Filter applies to query: `is_archived.is.null,is_archived.eq.false` (default OFF)
  - When checked, includes archived users in email export
  - **Safety filters**: Excludes deleted/suspended users even when archived is checked
  - **Email only** — no push notifications to archived users

#### 3. **Broadcast System** (Production Architecture)
- **Location**: [BroadcastNotifications.tsx](src/components/admin/BroadcastNotifications.tsx)
- **Edge Function**: [send-broadcast-campaign](supabase/functions/send-broadcast-campaign/index.ts)
- **Changes**:
  - **Server-side sending**: All broadcast logic moved to Supabase Edge Function
  - **Single button**: Replaced "Send & Wait" and "Send & Leave" with one "Send Broadcast" button
  - **Safe navigation**: Admin can leave page immediately after starting broadcast
  - **Batch processing**: 10 users per batch with 500ms delay
  - **Progress tracking**: Real-time updates to campaign stats in database
  - **No client lock**: No spinner blocking, no double-send risk

#### 4. **Scheduled Archiving** (Already Exists)
- **Location**: [20251221210527_84da4ce9-3e79-42c1-914d-96da656b6979.sql](supabase/migrations/20251221210527_84da4ce9-3e79-42c1-914d-96da656b6979.sql)
- **Schedule**: Daily at 3 AM UTC
- **Function**: `auto_archive_inactive_users()`
- **Criteria**: 30+ days without login
- **Status**: ✅ Already deployed

---

## 📊 What's Working (No Changes Needed)

### Archive Fundamentals
- ✅ `profiles.is_archived` boolean exists
- ✅ Excluded from Discover, Chat, Pool calculations
- ✅ Auto-unarchive on activity (`useActivityTracker`)
- ✅ No user-facing banners or warnings
- ✅ Silent, non-destructive behavior

### Performance Protections
- ✅ Heavy use of `userDataCache`
- ✅ Debounced queries
- ✅ Lazy tab loading
- ✅ RPC aggregation (`get_admin_stats`)
- ✅ Premium filtering applied before caching

### Discover Fairness
- ✅ Free users still see profiles
- ✅ Premium unlock logic untouched
- ✅ Archive is not deletion (reactivation-friendly)

---

## 🚫 What Was NOT Added (Intentionally)

As per your requirements, the following were **explicitly excluded**:

- ❌ Archive banners for users
- ❌ Chat disappearance warnings
- ❌ Manual archive/unarchive buttons in admin
- ❌ Push notifications for archived users
- ❌ Any user-facing archive messaging
- ❌ Client-side broadcast sending (moved to server)

---

## 🏗️ Broadcast Architecture (Tinder/Meta Style)

### Why Server-Side?

**Problem**: Client-side sending stops when admin leaves page
- Browser cancels requests
- JS execution stops
- Batch loops die mid-send
- Unreliable for large campaigns

**Solution**: Edge Function handles everything
- Runs on Supabase servers
- Continues after admin leaves
- Handles batching, delays, retries
- Client only triggers once

### How It Works

```typescript
// Client (one button, one call)
const sendBroadcast = async () => {
  await supabase.functions.invoke('send-broadcast-campaign', {
    body: {
      title,
      message,
      targetCountries,
      userIds,
      notificationType: 'system',
    },
  });
  
  toast({
    title: 'Broadcast Started',
    description: 'You can safely leave this page.',
  });
};

// Server (edge function)
// - Creates campaign record
// - Creates recipient records
// - Sends in batches of 10
// - Updates progress in real-time
// - Continues until complete
```

### Benefits

| Requirement | Result |
|-------------|--------|
| Leave page | ✅ Works |
| Large campaigns | ✅ Safe |
| No duplicate sends | ✅ |
| Fast UI | ✅ |
| Mobile friendly | ✅ |
| Future automation | ✅ |

---

## 📝 Dormant Conversations (Separate Feature)

### Status: Already Implemented
- **Location**: [ChatPage.tsx](src/components/ChatPage.tsx)
- **Logic**: 30-day inactivity threshold (not archive-related)
- **Behavior**: Silent, collapsible "Earlier conversations" section
- **No database changes required** — runtime computation only

### How It Works
```typescript
// Check if chat is dormant (30+ days)
isDormantChat(lastMessageAt: string): boolean {
  const thirtyDaysAgo = subDays(new Date(), 30);
  return isBefore(new Date(lastMessageAt), thirtyDaysAgo);
}
```

**Key Distinction**:
- **Archive** (30+ days no login) → profile hidden from platform
- **Dormant** (30+ days no chat) → chat hidden in collapsible section

---

## 🎯 Use Cases

### 1. Admin Viewing Archived Users
```
Admin → User List → Filter: "Archived Only"
Result: See all archived users with subtle gray badge
```

### 2. Re-Engagement Campaigns
```
Admin → Broadcast → Emailing Tab
✅ Check "Include archived users"
Export emails → Send "We miss you" campaign
```

### 3. Broadcast Notifications (New!)
```
Admin → Broadcast → New Tab
Select countries → Select users → Compose message
Click "Send Broadcast" → Leave page immediately
Server handles sending → Check history later
```

### 4. Automatic Archiving
```
Supabase Cron (3 AM UTC daily)
→ auto_archive_inactive_users()
→ Users inactive 30+ days marked as archived
→ Auto-unarchive on next login
```

---

## 🔒 Safety Guarantees

- **No data deletion**: Archive is soft flag only
- **Instant reactivation**: Any login unarchives automatically
- **Premium safe**: Premium logic bypasses archive checks
- **Free user fair**: Archive doesn't affect active users
- **Performance**: No impact on Discover/Chat speed
- **Email safety**: Deleted/suspended users excluded from exports
- **Broadcast reliability**: Server-side processing, never interrupted

---

## 📈 Future Enhancements (Optional)

If you want to further optimize in the future:

### A. Discover Preloading (High Impact)
- Preload next 2 profile images
- Exclude archived users from preload
- Cache image URLs in memory for session

### B. Reduce Supabase Roundtrips
- Merge `profiles → subscriptions → preferences` into one RPC
- Already done in admin, apply same pattern in Discover

### C. Dormant Chat Backend (Low Priority)
- Currently runtime only (no performance issue)
- Could add DB flag if chat list becomes slow (1000+ chats)

### D. Broadcast Scheduling
- Edge function already supports delayed execution
- Add UI for scheduled campaigns (date/time picker)
- Cron job checks for pending scheduled broadcasts

---

## ✅ Production Ready

All archive improvements are:
- ✅ Type-safe (no TypeScript errors)
- ✅ Performance-neutral
- ✅ Tinder/Hinge-style (silent UX)
- ✅ Admin-friendly (visibility without control)
- ✅ Re-engagement ready (email export)
- ✅ Server-side reliable (broadcast never interrupted)
- ✅ Mobile-safe (no long-running client processes)

No breaking changes. All existing functionality preserved.

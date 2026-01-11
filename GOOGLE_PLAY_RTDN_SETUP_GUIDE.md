# Google Play Real-Time Developer Notifications (RTDN) Setup Guide

This guide will help you ensure your Google Play subscriptions auto-renew properly.

---

## ✅ **OPTION 1: Verify RTDN is Configured (CRITICAL)**

### **Step 1: Check if RTDN is Enabled**

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app: **DripLove**
3. Navigate to: **Monetization** → **Monetization setup**
4. Look for: **"Real-time developer notifications"** section

### **Step 2: Verify Webhook URL**

Your webhook URL should be:
```
https://tglisyvjhabsovironessw.supabase.co/functions/v1/google-play-webhook
```

**What to check:**
- ✅ URL is entered correctly (no typos)
- ✅ Status shows "Verified" (green checkmark)
- ✅ Topic name is set (see Step 3)

### **Step 3: Set Up Google Cloud Pub/Sub Topic**

If you haven't set this up yet:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select the same project linked to your Google Play Console
3. Navigate to: **Pub/Sub** → **Topics**
4. Create a new topic (if not exists):
   - Topic ID: `play-subscriptions` (or any name)
   - Copy the full topic name: `projects/YOUR-PROJECT-ID/topics/play-subscriptions`

5. Back in Google Play Console:
   - Paste the topic name in the **"Topic name"** field
   - Click **"Send test notification"** to verify

### **Step 4: Grant Permissions**

Google Play needs permission to publish to your Pub/Sub topic:

1. In Google Cloud Console → **Pub/Sub** → **Topics**
2. Click on your topic: `play-subscriptions`
3. Go to **"Permissions"** tab
4. Click **"Add Principal"**
5. Add this email:
   ```
   google-play-developer-notifications@system.gserviceaccount.com
   ```
6. Assign role: **Pub/Sub Publisher**
7. Click **"Save"**

### **Step 5: Test the Webhook**

1. In Google Play Console → Monetization setup → RTDN section
2. Click **"Send test notification"**
3. Check Supabase Edge Functions logs:
   - Go to Supabase Dashboard → Edge Functions
   - Click on `google-play-webhook`
   - Check the **Logs** tab
   - You should see: `✅ Notification processed`

### **Step 6: Test with Real Subscription**

Best way to verify it's working:

1. Have a test user with an active subscription
2. Cancel their subscription (don't refund)
3. Within a few minutes, check your database:
   ```sql
   SELECT status, auto_renew, updated_at 
   FROM user_subscriptions 
   WHERE payment_method = 'google' 
   ORDER BY updated_at DESC 
   LIMIT 5;
   ```
4. The subscription should show:
   - `status = 'cancelled'`
   - `auto_renew = false`
   - `updated_at` = recent timestamp

---

## ✅ **OPTION 2: Deploy Backup Cron Job**

This Edge Function runs daily to sync subscriptions (insurance in case webhooks fail).

### **Step 1: Deploy the Edge Function**

```bash
cd "/Users/deanonearth/Desktop/DripLove Dating"

# Deploy the sync function
npx supabase functions deploy sync-google-subscriptions
```

### **Step 2: Set Up Cron Trigger**

1. Go to Supabase Dashboard → **Database** → **Cron Jobs**
2. Or run this SQL in the SQL Editor:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily sync at 3 AM UTC
SELECT cron.schedule(
  'sync-google-subscriptions-daily',
  '0 3 * * *',  -- Every day at 3 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://tglisyvjhabsovironessw.supabase.co/functions/v1/sync-google-subscriptions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

### **Step 3: Verify Cron Job is Running**

Check cron job status:
```sql
SELECT * FROM cron.job WHERE jobname = 'sync-google-subscriptions-daily';
```

Check cron job execution history:
```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-google-subscriptions-daily')
ORDER BY start_time DESC 
LIMIT 10;
```

### **Step 4: Test Manually**

You can trigger the sync manually to test it:

```bash
# Using curl
curl -X POST \
  https://tglisyvjhabsovironessw.supabase.co/functions/v1/sync-google-subscriptions \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Or in Supabase Dashboard:
1. Go to **Edge Functions** → `sync-google-subscriptions`
2. Click **"Invoke function"**
3. Check the response and logs

---

## 🔍 **How to Monitor Both Systems**

### **Check RTDN Webhooks are Working:**

```sql
-- Check recent webhook updates
SELECT 
  user_id,
  status,
  expires_at,
  auto_renew,
  updated_at
FROM user_subscriptions
WHERE payment_method = 'google'
  AND updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;
```

### **Check Cron Job is Running:**

Go to Supabase → Edge Functions → `sync-google-subscriptions` → Logs

Look for daily entries at 3 AM UTC showing:
```
✅ Sync complete: X updated, Y expired, 0 errors
```

---

## 🚨 **What If RTDN Isn't Configured?**

**Impact:**
- ❌ Users get charged but lose premium access
- ❌ Subscriptions expire even though they renewed
- ❌ Users have to manually restore purchases

**Temporary Workaround:**
- The cron job (Option 2) will sync once per day
- Users can restore purchases when they open the app
- But not ideal - there will be gaps

**Solution:**
- **YOU MUST set up RTDN** (Option 1) for proper auto-renewal
- The cron job is just backup insurance

---

## ✅ **Checklist**

- [ ] RTDN webhook URL configured in Google Play Console
- [ ] Google Cloud Pub/Sub topic created
- [ ] Permissions granted to Google Play service account
- [ ] Test notification sent successfully
- [ ] Real subscription cancel/renew tested
- [ ] Backup cron job deployed
- [ ] Cron job scheduled and running
- [ ] Both systems monitored for 1 week

---

## 📞 **Need Help?**

If you get errors:
1. Check Supabase Edge Functions logs
2. Check Google Cloud Pub/Sub logs
3. Verify service account credentials are set in Supabase secrets
4. Make sure `GOOGLE_PLAY_SERVICE_ACCOUNT` environment variable is set

---

**Last Updated:** January 10, 2026

package com.driplove.dating;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

public class CustomFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "FCM Service";
    
    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        
        // Get notification data
        Map<String, String> data = remoteMessage.getData();
        RemoteMessage.Notification notification = remoteMessage.getNotification();
        
        // Determine channel and priority
        String channelId = "driplove_notifications";
        String title = "DripLove";
        String body = "";
        
        if (notification != null) {
            title = notification.getTitle() != null ? notification.getTitle() : title;
            body = notification.getBody() != null ? notification.getBody() : body;
        } else if (data.containsKey("title")) {
            title = data.get("title");
            body = data.containsKey("body") ? data.get("body") : "";
        }
        
        // Determine notification type and channel
        String notificationType = data.get("type");
        if (notificationType != null) {
            switch (notificationType) {
                case "message":
                case "new_message":
                    channelId = "driplove_messages";
                    break;
                case "match":
                case "new_match":
                    channelId = "driplove_matches";
                    break;
                case "like":
                case "new_like":
                    channelId = "driplove_likes";
                    break;
                default:
                    channelId = "driplove_general";
                    break;
            }
        }
        
        // Send notification
        sendNotification(title, body, channelId, data);
    }
    
    private void sendNotification(String title, String messageBody, String channelId, Map<String, String> data) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        
        // Add data to intent
        if (data != null) {
            for (Map.Entry<String, String> entry : data.entrySet()) {
                intent.putExtra(entry.getKey(), entry.getValue());
            }
        }
        
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            intent,
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );
        
        // Custom sound URI
        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/botificationsound");
        
        // Build notification
        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(messageBody)
                .setAutoCancel(true)
                .setSound(soundUri)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setContentIntent(pendingIntent)
                .setVibrate(new long[]{0, 250, 250, 250})
                .setLights(Color.MAGENTA, 1000, 300)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(0); // Don't use defaults, we set custom sound

        // Match/message notifications carry the other person's photo (see
        // send-push-notification edge function) - show it as the rounded
        // avatar on the right, same as any messaging app. onMessageReceived
        // already runs off the main thread, so a blocking download here is
        // safe; a missing/failed image just falls back to the plain layout.
        String imageUrl = data != null ? data.get("imageUrl") : null;
        if (imageUrl != null && !imageUrl.isEmpty()) {
            Bitmap avatar = downloadAndRoundBitmap(imageUrl);
            if (avatar != null) {
                notificationBuilder.setLargeIcon(avatar);
            }
        }
        
        // For heads-up notifications (Android 5.0+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            notificationBuilder.setCategory(NotificationCompat.CATEGORY_MESSAGE);
        }

        // setNumber() is the FCM/Android equivalent of iOS's aps.badge - some
        // launchers (Samsung, etc) badge the icon from this directly. The
        // edge function sends the real count (send-push-notification's
        // profiles.badge_count), same number iOS gets.
        String badgeCountStr = data != null ? data.get("badge_count") : null;
        if (badgeCountStr != null) {
            try {
                notificationBuilder.setNumber(Integer.parseInt(badgeCountStr));
            } catch (NumberFormatException ignored) {
                // Missing/malformed badge_count just means no setNumber() call - never worth dropping the notification over.
            }
        }

        NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        // Create notification channel for Android 8.0+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = notificationManager.getNotificationChannel(channelId);
            if (channel == null) {
                // Create channel if it doesn't exist
                createNotificationChannel(notificationManager, channelId);
            }
        }

        // Each push gets its OWN entry in the shade and stays there until the
        // user taps it or clears it. This used to notify() with a stable
        // per-channel id, so every new message/like/match silently replaced
        // the previous one and the phone only ever showed one DripLove
        // notification. The unique tag comes from the server (notificationTag)
        // and related notifications share a group (threadKey) so one
        // conversation still bundles together.
        String tag = data != null ? data.get("notificationTag") : null;
        if (tag == null || tag.isEmpty()) {
            tag = channelId + "-" + System.currentTimeMillis() + "-" + Math.round(Math.random() * 100000);
        }
        String threadKey = data != null ? data.get("threadKey") : null;
        if (threadKey != null && !threadKey.isEmpty()) {
            notificationBuilder.setGroup(threadKey);
        }

        notificationManager.notify(tag, tag.hashCode(), notificationBuilder.build());
    }

    // Downloads the given image URL and crops it to a circle, matching how
    // every profile photo already displays elsewhere in the app. Returns
    // null (never throws) on any network/decode failure, so a bad URL just
    // means no avatar rather than a dropped notification.
    private Bitmap downloadAndRoundBitmap(String imageUrl) {
        try {
            URL url = new URL(imageUrl);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setDoInput(true);
            connection.connect();

            InputStream input = connection.getInputStream();
            Bitmap source = BitmapFactory.decodeStream(input);
            input.close();
            connection.disconnect();

            if (source == null) return null;

            int size = Math.min(source.getWidth(), source.getHeight());
            int x = (source.getWidth() - size) / 2;
            int y = (source.getHeight() - size) / 2;
            Bitmap squared = Bitmap.createBitmap(source, x, y, size, size);

            Bitmap rounded = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(rounded);
            Paint paint = new Paint();
            paint.setAntiAlias(true);
            canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
            paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
            canvas.drawBitmap(squared, new Rect(0, 0, size, size), new Rect(0, 0, size, size), paint);

            return rounded;
        } catch (Exception e) {
            android.util.Log.w(TAG, "Failed to download/round notification avatar: " + e.getMessage());
            return null;
        }
    }

    private void createNotificationChannel(NotificationManager manager, String channelId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence channelName = "DripLove Notifications";
            String channelDescription = "Notifications from DripLove";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            
            switch (channelId) {
                case "driplove_messages":
                    channelName = "DripLove Messages";
                    channelDescription = "Notifications for new messages";
                    break;
                case "driplove_matches":
                    channelName = "DripLove Matches";
                    channelDescription = "Notifications for new matches";
                    break;
                case "driplove_likes":
                    channelName = "DripLove Likes";
                    channelDescription = "Notifications for new likes";
                    importance = NotificationManager.IMPORTANCE_DEFAULT;
                    break;
                case "driplove_general":
                    channelName = "DripLove";
                    channelDescription = "General notifications from DripLove";
                    importance = NotificationManager.IMPORTANCE_DEFAULT;
                    break;
            }
            
            NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
            channel.setDescription(channelDescription);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 250, 250});
            channel.enableLights(true);
            channel.setLightColor(Color.MAGENTA);
            channel.setShowBadge(true);
            
            // Set custom sound
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build();
            
            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/botificationsound");
            channel.setSound(soundUri, audioAttributes);
            
            manager.createNotificationChannel(channel);
        }
    }
    
    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        android.util.Log.d(TAG, "🔥 FCM Token received: " + token.substring(0, 20) + "...");
        // Token refresh is handled by Capacitor plugin
    }
}

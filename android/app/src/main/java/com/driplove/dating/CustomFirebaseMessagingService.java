package com.driplove.dating;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
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
        
        // For heads-up notifications (Android 5.0+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            notificationBuilder.setCategory(NotificationCompat.CATEGORY_MESSAGE);
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
        
        // Show notification
        notificationManager.notify((int) System.currentTimeMillis(), notificationBuilder.build());
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
        // Token refresh is handled by Capacitor plugin
    }
}

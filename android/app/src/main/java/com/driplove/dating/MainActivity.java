package com.driplove.dating;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Enable WebView debugging for development
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        
        // Configure WebView settings for video playback
        configureWebViewForVideo();
        
        // Create notification channels with custom sound
        createNotificationChannels();
    }
    
    private void configureWebViewForVideo() {
        // Get the WebView from BridgeActivity
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            
            // Enable media playback
            settings.setMediaPlaybackRequiresUserGesture(false);
            
            // Enable DOM storage for video
            settings.setDomStorageEnabled(true);
            
            // Enable database storage
            settings.setDatabaseEnabled(true);
            
            // Set cache mode for better video loading
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            
            // Enable hardware acceleration for smooth video
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
        }
    }
    
    private void createNotificationChannels() {
        // Only needed for Android 8.0 (API 26) and above
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            
            // Create default DripLove Notifications Channel (for FCM)
            createDefaultChannel(notificationManager);
            
            // Create DripLove Messages Channel with custom sound
            createMessageChannel(notificationManager);
            
            // Create DripLove Matches Channel
            createMatchChannel(notificationManager);
            
            // Create DripLove Likes Channel
            createLikeChannel(notificationManager);
            
            // Create DripLove General Channel
            createGeneralChannel(notificationManager);
        }
    }
    
    private void createDefaultChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String channelId = "driplove_notifications";
            CharSequence channelName = "DripLove Notifications";
            String channelDescription = "All notifications from DripLove";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            
            NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
            channel.setDescription(channelDescription);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 250, 250});
            channel.enableLights(true);
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
    
    private void createMessageChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String channelId = "driplove_messages";
            CharSequence channelName = "DripLove Messages";
            String channelDescription = "Notifications for new messages";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            
            NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
            channel.setDescription(channelDescription);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 250, 250});
            channel.enableLights(true);
            channel.setShowBadge(true);
            
            // Set custom sound for messages
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build();
            
            // Use custom sound file: botificationsound.mp3 in res/raw folder
            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/botificationsound");
            channel.setSound(soundUri, audioAttributes);
            
            manager.createNotificationChannel(channel);
        }
    }
    
    private void createMatchChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String channelId = "driplove_matches";
            CharSequence channelName = "DripLove Matches";
            String channelDescription = "Notifications for new matches";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            
            NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
            channel.setDescription(channelDescription);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 400, 200, 400});
            channel.enableLights(true);
            channel.setShowBadge(true);
            
            // Use custom sound for matches
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build();
            
            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/botificationsound");
            channel.setSound(soundUri, audioAttributes);
            
            manager.createNotificationChannel(channel);
        }
    }
    
    private void createLikeChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String channelId = "driplove_likes";
            CharSequence channelName = "DripLove Likes";
            String channelDescription = "Notifications for new likes";
            int importance = NotificationManager.IMPORTANCE_DEFAULT;
            
            NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
            channel.setDescription(channelDescription);
            channel.enableVibration(true);
            channel.setShowBadge(true);
            
            manager.createNotificationChannel(channel);
        }
    }
    
    private void createGeneralChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String channelId = "driplove_general";
            CharSequence channelName = "DripLove";
            String channelDescription = "General notifications from DripLove";
            int importance = NotificationManager.IMPORTANCE_DEFAULT;
            
            NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
            channel.setDescription(channelDescription);
            channel.enableVibration(true);
            channel.setShowBadge(true);
            
            manager.createNotificationChannel(channel);
        }
    }
}

package com.driplove.dating;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge: allow content to draw behind system bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Enable WebView debugging for development
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Configure WebView settings for video playback
        configureWebViewForVideo();

        // Create notification channels with custom sound
        createNotificationChannels();

        // Cold start from a notification tap: CustomFirebaseMessagingService
        // builds its own notification (needed for the sender-photo large
        // icon) and its PendingIntent carries the FCM data payload as plain
        // intent extras - it never went through Capacitor's own push plugin,
        // so nothing was ever routing that tap anywhere. Route it here.
        handleNotificationIntent(getIntent());
    }

    // App already running (backgrounded): tapping a notification delivers
    // here instead of onCreate.
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
    }

    // Deliberately NOT clearing the notification shade on resume. Opening
    // the app must not wipe every pending notification - each one stays
    // until the user taps it (or clears it), and the app only dismisses the
    // notifications for a specific conversation when that conversation is
    // opened (see clearThreadNotifications in src/services/pushNotifications.ts).

    // Mirrors resolveNotificationRoute() in src/services/pushNotifications.ts -
    // keep the two in sync. message -> the specific conversation, match ->
    // the chat list, like -> Liked Me, open_circle_profile -> that one
    // Circle profile, everything else -> Discover (default).
    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("action");
        String profileId = intent.getStringExtra("profileId");
        String type = intent.getStringExtra("type");

        String route;
        if ("open_circle_profile".equals(action) && profileId != null) {
            route = "/?tab=circle&circleUserId=" + profileId;
        } else if (type == null) {
            return;
        } else if ("message".equals(type) && intent.getStringExtra("chatId") != null) {
            route = "/?tab=chat&matchId=" + intent.getStringExtra("chatId");
        } else if ("match".equals(type)) {
            route = "/?tab=chat";
        } else if ("like".equals(type)) {
            route = "/?tab=liked";
        } else {
            return;
        }

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        String escapedRoute = route.replace("\\", "\\\\").replace("'", "\\'");
        // Queue the destination immediately. The tiny readiness loop replaces
        // the old blind 1.5-second reload, preserves the SPA, and hands the
        // route to MainApp as soon as its document exists.
        webView.post(() -> webView.evaluateJavascript(
            "(function go(){if(document&&document.documentElement){history.replaceState({},'', '" + escapedRoute + "');window.dispatchEvent(new Event('popstate'));}else{setTimeout(go,25);}})();",
            null));
    }
    
    private void configureWebViewForVideo() {
        // Get the WebView from BridgeActivity
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            
            // Lock text rendering to 100% regardless of the device's system font-size
            // (Settings > Display > Font size) - without this, WebView scales every
            // CSS font-size by that system setting, which is why the same layout can
            // render with noticeably oversized text on some Android devices/emulators
            // but not others, even though the CSS itself never changed.
            settings.setTextZoom(100);

            // Enable media playback
            settings.setMediaPlaybackRequiresUserGesture(false);
            
            // Enable DOM storage for video
            settings.setDomStorageEnabled(true);
            
            // Enable database storage
            settings.setDatabaseEnabled(true);
            
            // Set cache mode for better video loading and overall performance
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            
            // Enable and optimize JavaScript performance
            settings.setJavaScriptEnabled(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            
            // Enable hardware acceleration for smooth video and animations
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
            
            // Performance optimizations for Android WebView
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
            settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
            
            // Enable zoom controls (optional, improves UX)
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            
            // Enable safe browsing and security features
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            
            // Improve image loading performance
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                settings.setSafeBrowsingEnabled(true);
            }
            
            // Enable geolocation
            settings.setGeolocationEnabled(true);
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

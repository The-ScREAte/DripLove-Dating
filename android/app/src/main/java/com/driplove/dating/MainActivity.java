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
    // keep the two in sync. open_discover -> Discover (default, no route
    // needed), open_games -> the Games hub (a top-level route, not a tab on
    // "/" - the replaceState+popstate dispatch below is what makes
    // BrowserRouter itself switch which route renders, same mechanism as
    // every tab-query-param case), open_circle_profile -> that one Circle
    // profile, open_chat/open_liked/open_profile/open_circle -> that tab
    // (scheduled messages choose it), message -> the specific conversation,
    // match -> the chat list, like -> Liked Me, image_rejected -> Profile,
    // everything else -> Discover (default).
    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("action");
        String profileId = intent.getStringExtra("profileId");
        String type = intent.getStringExtra("type");

        String route;
        // action wins over type, same as resolveNotificationRoute - an
        // admin broadcast can carry both an explicit action AND a type
        // (used only for the notification's channel/sound), and the action
        // is the one that says where a tap should actually go.
        if ("open_discover".equals(action)) {
            return;
        } else if ("open_games".equals(action)) {
            route = "/games";
        } else if ("open_circle_profile".equals(action) && profileId != null) {
            route = "/?tab=circle&circleUserId=" + profileId;
        } else if ("open_chat".equals(action)) {
            route = "/?tab=chat";
        } else if ("open_liked".equals(action) || "open_liked_me".equals(action)) {
            route = "/?tab=liked";
        } else if ("open_profile".equals(action)) {
            route = "/?tab=profile";
        } else if ("open_circle".equals(action)) {
            route = "/?tab=circle";
        } else if (type == null) {
            return;
        } else if ("message".equals(type) || "match".equals(type)) {
            // That conversation; the Chat list if the push didn't say which.
            String conversationId = "message".equals(type)
                ? intent.getStringExtra("chatId") : intent.getStringExtra("matchId");
            route = conversationId != null ? "/?tab=chat&matchId=" + conversationId : "/?tab=chat";
        } else if ("like".equals(type)) {
            route = "/?tab=liked";
        } else if ("image_rejected".equals(type)) {
            route = "/?tab=profile";
        } else {
            return;
        }

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        String escapedRoute = route.replace("\\", "\\\\").replace("'", "\\'");
        String tapId = escapedRoute + "#" + System.currentTimeMillis();
        // On a cold start (app closed when the notification was tapped) this
        // runs while the WebView is still loading - a script evaluated then
        // lands in the blank placeholder page and is thrown away when the app
        // page replaces it, so the tap opened Discover. So it's tried a few
        // times over several seconds and only applied inside the real app page
        // (http/https with #root), once per tap; when the app is already open
        // the first try applies it straight away. MainApp reads the URL on
        // mount and listens for popstate, so either moment works.
        final String script =
            "(function(){try{"
            + "if((location.protocol!=='https:'&&location.protocol!=='http:')||!document.getElementById('root'))return;"
            + "if(window.__dlNotificationTap==='" + tapId + "')return;"
            + "window.__dlNotificationTap='" + tapId + "';"
            // Capacitor's own tap event may already have routed this same tap
            // (navigateFromNotification stamps __dlNotificationRoute) - don't
            // apply it a second time.
            + "var m=window.__dlNotificationRoute;"
            + "if(m&&m.route==='" + escapedRoute + "'&&Date.now()-m.at<2500)return;"
            + "window.__dlNotificationRoute={route:'" + escapedRoute + "',at:Date.now()};"
            + "history.replaceState({},'','" + escapedRoute + "');"
            + "window.dispatchEvent(new Event('popstate'));"
            + "}catch(e){}})();";
        long[] delays = {0, 300, 800, 1500, 2500, 4000, 6000, 9000};
        for (long delay : delays) {
            webView.postDelayed(() -> webView.evaluateJavascript(script, null), delay);
        }
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
 
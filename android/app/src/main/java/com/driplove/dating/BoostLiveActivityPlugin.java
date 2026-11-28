package com.driplove.dating;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * BoostLiveActivity (Android side) - the running Boost's countdown at the top of the device instead of in the
 * app header: an ongoing, non-dismissable notification whose small icon sits in the status bar and whose
 * chronometer counts down to the boost's end in the shade. On Android 16+ it asks to be promoted to a
 * status-bar chip ("Live Update"); the system decides whether it is.
 *
 * JS: src/native/boostLiveActivity.ts (driven by boostLiveActivityBridge.ts). Registered in MainActivity.
 * Tap -> MainActivity with action=open_boost (handled by handleNotificationIntent, same as a boost push).
 */
@CapacitorPlugin(name = "BoostLiveActivity")
public class BoostLiveActivityPlugin extends Plugin {

    static final String CHANNEL_ID = "boost_timer";
    private static final int NOTIFICATION_ID = 0xB0057;
    private static final int BRAND_PINK = Color.parseColor("#EC4899");
    /** Notification.EXTRA_REQUEST_PROMOTED_ONGOING (API 36). Literal because compileSdk 36's android.jar
     *  does not expose Notification.Builder#setRequestPromotedOngoing yet (added in 36.1). */
    private static final String EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing";

    /** End time of the notification currently shown (ms epoch), 0 when none. */
    private static long shownEndsAt = 0;

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", canNotify(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String boostId = call.getString("boostId");
        Double endsAtD = call.getDouble("endsAt");
        if (boostId == null || boostId.isEmpty() || endsAtD == null) {
            call.reject("boostId and endsAt are required");
            return;
        }
        long endsAt = endsAtD.longValue();
        long now = System.currentTimeMillis();
        if (endsAt <= now) {
            call.resolve();
            return;
        }
        Context ctx = getContext();
        if (!canNotify(ctx)) {
            // Notifications not allowed: nothing to show, not an error.
            call.resolve();
            return;
        }
        String title = call.getString("title", "Boost is on");
        String subtitle = call.getString("subtitle", "You're at the front");
        try {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            ensureChannel(nm);
            nm.notify(NOTIFICATION_ID, build(ctx, title, subtitle, endsAt, now));
            shownEndsAt = endsAt;
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not show the boost timer", e);
        }
    }

    @PluginMethod
    public void end(PluginCall call) {
        boolean onlyExpired = Boolean.TRUE.equals(call.getBoolean("onlyExpired", false));
        if (onlyExpired && shownEndsAt > System.currentTimeMillis()) {
            // A boost is still running (this process showed it) - keep it.
            call.resolve();
            return;
        }
        if (onlyExpired && shownEndsAt == 0) {
            // Fresh process: an expired leftover was already removed by setTimeoutAfter; a still-running one
            // (app was killed mid-boost) is re-posted by start() once the boost loads. Nothing to do.
            call.resolve();
            return;
        }
        try {
            NotificationManager nm = getContext().getSystemService(NotificationManager.class);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        } catch (Exception ignored) {
        }
        shownEndsAt = 0;
        call.resolve();
    }

    private static boolean canNotify(Context ctx) {
        try {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm == null || !nm.areNotificationsEnabled()) return false;
            NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
            // The person turned off just the "Boost timer" channel.
            return ch == null || ch.getImportance() != NotificationManager.IMPORTANCE_NONE;
        } catch (Exception e) {
            return false;
        }
    }

    private static void ensureChannel(NotificationManager nm) {
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        // LOW: no sound, no vibration, no heads-up - just the icon in the status bar and the countdown in the shade.
        // (Not MIN: a MIN channel can't show a status-bar icon or be promoted to a Live Update chip.)
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Boost timer", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shows how long your Boost has left");
        channel.setShowBadge(false);
        channel.enableVibration(false);
        channel.enableLights(false);
        channel.setSound(null, null);
        nm.createNotificationChannel(channel);
    }

    private static Notification build(Context ctx, String title, String subtitle, long endsAt, long now) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("action", "open_boost");
        PendingIntent contentIntent = PendingIntent.getActivity(
            ctx,
            NOTIFICATION_ID,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder b = new Notification.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_PINK)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setShowWhen(true)
            .setWhen(endsAt)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            // Gone by itself when the boost ends, even if the app is closed by then.
            .setTimeoutAfter(Math.max(1000L, endsAt - now));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
            // Android 16 "Live Updates": ask for the status-bar chip. Requires ongoing + a title + a standard style
            // + not colorized (all true here) and the POST_PROMOTED_NOTIFICATIONS permission (manifest). The chip
            // shows the chronometer's countdown.
            Bundle extras = new Bundle();
            extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true);
            b.addExtras(extras);
        }
        return b.build();
    }
}

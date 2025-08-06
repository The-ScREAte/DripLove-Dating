package com.driplove.dating;

import android.app.Application;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

public class MainApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        
        try {
            // Initialize Firebase with proper error handling
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this);
            }
        } catch (Exception e) {
            android.util.Log.e("DripLove", "Failed to initialize Firebase: " + e.getMessage());
        }
    }
}

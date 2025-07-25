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
                android.util.Log.d("DripLove", "Firebase initialized successfully");
            } else {
                android.util.Log.d("DripLove", "Firebase already initialized");
            }
        } catch (Exception e) {
            android.util.Log.e("DripLove", "Failed to initialize Firebase: " + e.getMessage());
        }
    }
}

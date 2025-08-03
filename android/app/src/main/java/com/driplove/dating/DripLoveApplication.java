package com.driplove.dating;

import android.app.Application;
import com.google.firebase.FirebaseApp;

public class DripLoveApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        
        // Initialize Firebase as early as possible in the application lifecycle
        try {
            FirebaseApp.initializeApp(this);
            android.util.Log.d("DripLove", "Firebase initialized in Application.onCreate()");
        } catch (Exception e) {
            android.util.Log.d("DripLove", "Firebase initialization in Application: " + e.getMessage());
        }
    }
}

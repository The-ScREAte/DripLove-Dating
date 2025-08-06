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
        } catch (Exception e) {
            // Firebase initialization failed
        }
    }
}

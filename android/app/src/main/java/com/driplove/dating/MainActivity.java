package com.driplove.dating;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        try {
            // Ensure Firebase is initialized before any plugins try to use it
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this);
                android.util.Log.d("DripLove", "Firebase initialized in MainActivity");
            }
        } catch (Exception e) {
            android.util.Log.e("DripLove", "Failed to initialize Firebase in MainActivity: " + e.getMessage());
        }
    }
}

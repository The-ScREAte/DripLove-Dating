package com.driplove.dating;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Initialize Firebase FIRST, before anything else
        initializeFirebase();
        
        super.onCreate(savedInstanceState);
    }
    
    private void initializeFirebase() {
        try {
            // Always try to initialize Firebase explicitly
            FirebaseApp.initializeApp(this);
        } catch (Exception e) {
            // Try to get existing instance to verify it's working
            try {
                FirebaseApp.getInstance();
            } catch (Exception e2) {
                android.util.Log.e("DripLove", "Firebase is completely unavailable: " + e2.getMessage());
            }
        }
    }
}

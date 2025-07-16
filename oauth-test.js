// Test script to verify OAuth configuration
// You can run this in the browser console at http://localhost:8080

console.log('🔧 Testing OAuth Configuration...');

// Test 1: Check if Supabase client is available
if (typeof window !== 'undefined' && window.supabase) {
  console.log('✅ Supabase client is available');
} else {
  console.log('❌ Supabase client not found');
}

// Test 2: Test Google OAuth (paste this in browser console)
async function testGoogleOAuth() {
  try {
    console.log('🚀 Testing Google OAuth...');
    
    // Import supabase (if not already available)
    const { supabase } = await import('/src/integrations/supabase/client.js');
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:8080',
      },
    });

    if (error) {
      console.error('❌ OAuth Error:', error);
    } else {
      console.log('✅ OAuth initiated successfully:', data);
    }
  } catch (err) {
    console.error('❌ Test failed:', err);
  }
}

// Test 3: Check current session
async function checkSession() {
  try {
    const { supabase } = await import('/src/integrations/supabase/client.js');
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Session Error:', error);
    } else if (session) {
      console.log('✅ Current session:', session);
    } else {
      console.log('ℹ️  No active session');
    }
  } catch (err) {
    console.error('❌ Session check failed:', err);
  }
}

// Instructions for testing
console.log(`
🎯 To test OAuth manually:
1. Open browser console at http://localhost:8080
2. Click on the "Continue with Google" button
3. OR run: testGoogleOAuth()

🔍 To check current session:
Run: checkSession()

📋 Expected OAuth flow:
1. Click Google button → Opens Google login popup
2. Complete Google login → Redirects to localhost:8080
3. App checks user profile → Shows profile completion if needed
4. Complete profile → Access main app

🌐 OAuth Configuration:
- Authorized JavaScript Origin: http://localhost:8080
- Authorized Redirect URI: http://localhost:8080
- Supabase Callback: https://tgjisyvihabsovironesw.supabase.co/auth/v1/callback
`);

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.testGoogleOAuth = testGoogleOAuth;
  window.checkSession = checkSession;
}

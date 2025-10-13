import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { startCustomAppleOAuth } from '@/utils/customAppleOAuth';

/**
 * Debug component to test Apple OAuth flow
 */
const AppleOAuthTest = () => {
  const [testing, setTesting] = useState(false);

  const handleTestAppleOAuth = async () => {
    setTesting(true);
    try {
      console.log('🧪 Testing Custom Apple OAuth...');
      await startCustomAppleOAuth();
    } catch (error) {
      console.error('🧪 Test failed:', error);
      alert(`Test failed: ${error}`);
      setTesting(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle className="text-center">Apple OAuth Test</CardTitle>
        <CardDescription className="text-center">
          Test the custom Apple OAuth flow for web browsers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-gray-600 space-y-2">
          <p><strong>Current Environment:</strong></p>
          <p>Origin: {window.location.origin}</p>
          <p>Hostname: {window.location.hostname}</p>
          <p>Services ID: com.driplove.dating.signin</p>
          <p>Using: Apple JS SDK with popup</p>
        </div>
        
        <Button 
          onClick={handleTestAppleOAuth}
          disabled={testing}
          className="w-full bg-black hover:bg-gray-800 text-white"
        >
          {testing ? 'Redirecting to Apple...' : '🍎 Test Apple Sign-In'}
        </Button>
        
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Required Apple Developer Setup:</strong></p>
          <p>1. Services ID: com.driplove.dating.signin</p>
          <p>2. Add domain: {window.location.hostname}</p>
          <p>3. Enable "Sign In with Apple" for Services ID</p>
          <p>4. Supabase: Keep native config (App ID)</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AppleOAuthTest;
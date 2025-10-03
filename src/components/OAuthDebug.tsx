import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

const OAuthDebug = () => {
  const [urlInfo, setUrlInfo] = useState<any>({});
  const [localStorageInfo, setLocalStorageInfo] = useState<any>({});

  useEffect(() => {
    // Collect URL information
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const fragment = new URLSearchParams(url.hash.replace('#', ''));
    
    const info = {
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      fullUrl: window.location.href,
      searchParams: Object.fromEntries(params.entries()),
      fragmentParams: Object.fromEntries(fragment.entries()),
    };
    
    setUrlInfo(info);

    // Check localStorage for auth tokens
    const storage = {
      supabaseToken: localStorage.getItem('supabase.auth.token'),
      oauthProfile: sessionStorage.getItem('oauth_profile'),
      allLocalStorage: Object.keys(localStorage).reduce((acc, key) => {
        if (key.includes('supabase') || key.includes('auth')) {
          acc[key] = localStorage.getItem(key);
        }
        return acc;
      }, {} as Record<string, any>)
    };
    
    setLocalStorageInfo(storage);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>OAuth Debug Information</CardTitle>
            <CardDescription>
              This debug page helps diagnose OAuth redirect issues
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                URL Information
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => copyToClipboard(JSON.stringify(urlInfo, null, 2))}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </h3>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(urlInfo, null, 2)}
              </pre>
            </div>

            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                Storage Information
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => copyToClipboard(JSON.stringify(localStorageInfo, null, 2))}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </h3>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(localStorageInfo, null, 2)}
              </pre>
            </div>

            <div className="space-y-2">
              <Button 
                onClick={() => window.location.href = '/'}
                className="mr-2"
              >
                Go to Home
              </Button>
              <Button 
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OAuthDebug;
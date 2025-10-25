import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const RedirectHandler = () => {
  const { id } = useParams<{ id: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleRedirect = async () => {
      if (!id) {
        setError('Invalid redirect link');
        return;
      }

      try {
        // Fetch redirect data
        const { data, error: fetchError } = await supabase
          .from('redirects')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError || !data) {
          setError('Redirect link not found');
          return;
        }

        // Detect user agent BEFORE updating database
        const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
        
        let targetUrl = data.web_url; // Default fallback

        // Check for iOS
        if (/iPhone|iPad|iPod/i.test(ua)) {
          targetUrl = data.ios_url || data.web_url;
        }
        // Check for Android
        else if (/Android/i.test(ua)) {
          targetUrl = data.android_url || data.web_url;
        }

        // Redirect IMMEDIATELY using replace (no back button history)
        window.location.replace(targetUrl);

        // Update click count AFTER redirect (non-blocking)
        supabase
          .from('redirects')
          .update({
            clicks: (data.clicks || 0) + 1,
            last_clicked_at: new Date().toISOString(),
          })
          .eq('id', id)
          .then(() => {
            // Silent update
          });

      } catch (err) {
        console.error('Redirect error:', err);
        setError('An error occurred while redirecting');
      }
    };

    handleRedirect();
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
        <div className="text-center space-y-4 p-8">
          <div className="text-6xl">❌</div>
          <h1 className="text-2xl font-bold text-gray-800">{error}</h1>
          <p className="text-gray-600">This link may be invalid or expired.</p>
          <a
            href="https://driplove.love"
            className="inline-block mt-4 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:shadow-lg transition-shadow"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
      <div className="text-center space-y-4 p-8">
        <div className="text-6xl animate-pulse">🔄</div>
        <h1 className="text-2xl font-bold text-gray-800">Redirecting you...</h1>
        <p className="text-gray-600">Please wait while we take you to the right place.</p>
        <div className="flex justify-center gap-2 mt-4">
          <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );
};

export default RedirectHandler;

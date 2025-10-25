import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet';

const RedirectHandler = () => {
  const { id } = useParams<{ id: string }>();
  const [error, setError] = useState<string | null>(null);
  const [redirectData, setRedirectData] = useState<any>(null);

  useEffect(() => {
    const handleRedirect = async () => {
      if (!id) {
        setError('Invalid redirect link');
        return;
      }

      try {
        // Fetch redirect data with minimal fields for speed
        const { data, error: fetchError } = await supabase
          .from('redirects')
          .select('ios_url, android_url, web_url')
          .eq('id', id)
          .single();

        if (fetchError || !data) {
          setError('Redirect link not found');
          return;
        }

        // Store data for meta tags
        setRedirectData(data);

        // Detect user agent IMMEDIATELY
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

        // Redirect INSTANTLY (no delay)
        window.location.replace(targetUrl);

        // Update click count in background (non-blocking, fire and forget)
        setTimeout(() => {
          supabase.rpc('increment_redirect_clicks', { redirect_id: id }).then(() => {});
        }, 0);

      } catch (err) {
        console.error('Redirect error:', err);
        setError('An error occurred while redirecting');
      }
    };

    handleRedirect();
  }, [id]);

  // Render minimal HTML with meta tags for social sharing
  return (
    <>
      <Helmet>
        <title>DripLove - Redirecting...</title>
        <meta name="description" content="DripLove - Find Your Perfect Match" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://driplove.love/r/${id}`} />
        <meta property="og:title" content="DripLove - Find Your Perfect Match" />
        <meta property="og:description" content="Join DripLove to meet amazing people and find meaningful connections" />
        <meta property="og:image" content="https://driplove.love/images/logo.png" />
        
        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content={`https://driplove.love/r/${id}`} />
        <meta property="twitter:title" content="DripLove - Find Your Perfect Match" />
        <meta property="twitter:description" content="Join DripLove to meet amazing people and find meaningful connections" />
        <meta property="twitter:image" content="https://driplove.love/images/logo.png" />
      </Helmet>

      {error ? (
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
      ) : (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
          <div className="text-center space-y-2 p-8">
            <div className="text-4xl animate-spin">�</div>
            <p className="text-sm text-gray-600">Redirecting...</p>
          </div>
        </div>
      )}
    </>
  );
};

export default RedirectHandler;

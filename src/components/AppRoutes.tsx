import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useMobileOAuth } from '@/hooks/useMobileOAuth';
import { useNavigate } from 'react-router-dom';

// Eagerly load only essential pages
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";

// Lazy load all heavy pages for better performance
const DiscoverPage = lazy(() => import('@/components/DiscoverPage'));
const AdminPage = lazy(() => import('./AdminPage'));
const ProfileCompletionPage = lazy(() => import('./ProfileCompletionPage'));
const EmailConfirmPage = lazy(() => import('./EmailConfirmPage'));
const AppleOAuthCallback = lazy(() => import('./AppleOAuthCallback'));
const AppleOAuthTest = lazy(() => import('./AppleOAuthTest'));
const OAuthCallback = lazy(() => import('./OAuthCallback'));
const OAuthDebug = lazy(() => import('./OAuthDebug'));
const PaymentSuccess = lazy(() => import('../pages/PaymentSuccess'));
const Unsubscribe = lazy(() => import('../pages/Unsubscribe'));
const ResetPasswordPage = lazy(() => import('./ResetPasswordPage'));
const RedirectHandler = lazy(() => import('./RedirectHandler'));
const TermsOfService = lazy(() => import('./TermsOfService'));
const PrivacyPolicy = lazy(() => import('./PrivacyPolicy'));

// Loading component
const PageLoader = () => (
  <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
    <div className="text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-pink-500 animate-pulse mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

const AppRoutes = () => {
  // Initialize mobile OAuth handler inside router context
  useMobileOAuth();
  const navigate = useNavigate();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/discover" element={<DiscoverPage currentUser={null} />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/auth/callback" element={<OAuthCallback />} />
      <Route path="/auth/apple-callback" element={<AppleOAuthCallback />} />
      <Route path="/auth/debug" element={<OAuthDebug />} />
      <Route path="/auth/apple-test" element={<AppleOAuthTest />} />
      <Route path="/complete-profile" element={<ProfileCompletionPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/terms-of-service" element={<TermsOfService onBack={() => navigate(-1)} />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy onBack={() => navigate(-1)} />} />
      <Route path="/r/:id" element={<RedirectHandler />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
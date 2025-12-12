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
const FaceVerificationPage = lazy(() => import('../pages/FaceVerificationPage'));
const ResetPasswordPage = lazy(() => import('./ResetPasswordPage'));
const RedirectHandler = lazy(() => import('./RedirectHandler'));
const TermsOfService = lazy(() => import('./TermsOfService'));
const PrivacyPolicy = lazy(() => import('./PrivacyPolicy'));

// Loading component with inline SVG for instant display
const PageLoader = () => (
  <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
    <div className="text-center">
      <style>{`
        @keyframes logoHop {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
        }
      `}</style>
      <div className="mb-4" style={{ animation: 'logoHop 1s ease-in-out infinite' }}>
        <svg className="w-24 h-24 mx-auto" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <path d="M50 88C50 88 12 58 12 35C12 20 24 10 38 10C44 10 50 14 50 14C50 14 56 10 62 10C76 10 88 20 88 35C88 58 50 88 50 88Z" fill="url(#heartGrad)"/>
          <circle cx="35" cy="35" r="6" fill="white" opacity="0.6"/>
        </svg>
      </div>
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
        <Route path="/face-verification" element={<FaceVerificationPage />} />
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
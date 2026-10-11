import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useMobileOAuth } from '@/hooks/useMobileOAuth';
import { useNavigate } from 'react-router-dom';
import ChunkLoadBoundary from '@/components/ChunkLoadBoundary';

// Eagerly load only essential pages
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";

// Lazy load all heavy pages for better performance
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
const ChildSafetyStandards = lazy(() => import('./ChildSafetyStandards'));
const CommunityGuidelines = lazy(() => import('./CommunityGuidelines'));
const SafetyTips = lazy(() => import('./SafetyTips'));
const InfluencerPortal = lazy(() => import('../pages/InfluencerPortal'));
const InfluencerSetPassword = lazy(() => import('../pages/InfluencerSetPassword'));
const Games = lazy(() => import('../pages/Games'));
const TestYourToast = lazy(() => import('../pages/TestYourToast'));
const ShootYourShot = lazy(() => import('../pages/ShootYourShot'));
const RedFlagGreenFlag = lazy(() => import('../pages/RedFlagGreenFlag'));
const LinksPage = lazy(() => import('../pages/LinksPage'));
const CircleUpPrepare = lazy(() => import('../pages/circle-up/CircleUpPrepare'));
const CircleUpMatching = lazy(() => import('../pages/circle-up/CircleUpMatching'));
const CircleUpCall = lazy(() => import('../pages/circle-up/CircleUpCall'));

// Shown while a lazy route's chunk is being fetched. A blank screen here reads as "the tap did
// nothing" on a slow mobile connection — a visible spinner confirms the navigation registered.
const PageLoader = () => (
  <div className="min-h-screen w-full flex items-center justify-center bg-black">
    <div className="w-8 h-8 rounded-full border-2 border-pink-500/30 border-t-pink-500 animate-spin" />
  </div>
);

const AppRoutes = ({
  user,
  isAuthenticated,
}: {
  user: ({
    id: string;
    email?: string | null;
    app_metadata?: { provider?: string };
    user_metadata?: Record<string, unknown>;
  } & Record<string, unknown>) | null;
  isAuthenticated: boolean;
}) => {
  // Initialize mobile OAuth handler inside router context
  useMobileOAuth();
  const navigate = useNavigate();

  return (
    <ChunkLoadBoundary>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Index user={user} isAuthenticated={isAuthenticated} />} />
        {/* Nothing in the app links here - the real Discover experience lives in
            MainApp's tab (mounted at "/"), which has a fully-loaded profile to
            work with. Rendering DiscoverPage directly from this route only had
            the raw Supabase auth user available (id/email/metadata, none of the
            profile fields Discover's matching/ad-targeting logic needs), so this
            just redirects instead of ever mounting it in a broken state. */}
        <Route path="/discover" element={<Navigate to="/" replace />} />
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
      <Route path="/child-safety" element={<ChildSafetyStandards onBack={() => navigate(-1)} />} />
      <Route path="/community-guidelines" element={<CommunityGuidelines onBack={() => navigate(-1)} />} />
      <Route path="/safety-tips" element={<SafetyTips onBack={() => navigate(-1)} />} />
      <Route path="/influencer" element={<InfluencerPortal />} />
      <Route path="/influencer/set-password" element={<InfluencerSetPassword />} />
      <Route path="/games" element={<Games />} />
      <Route path="/games/test-your-toast" element={<TestYourToast />} />
      <Route path="/games/shoot-your-shot" element={<ShootYourShot />} />
      <Route path="/games/red-flag-green-flag" element={<RedFlagGreenFlag />} />
      <Route path="/circle-up" element={<CircleUpPrepare />} />
      <Route path="/circle-up/matching" element={<CircleUpMatching />} />
      <Route path="/circle-up/call" element={<CircleUpCall />} />
      <Route path="/links" element={<LinksPage />} />
      <Route path="/r/:id" element={<RedirectHandler />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
    </ChunkLoadBoundary>
  );
};

export default AppRoutes; 
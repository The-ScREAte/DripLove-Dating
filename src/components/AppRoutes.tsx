import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useMobileOAuth } from '@/hooks/useMobileOAuth';
import { useNavigate } from 'react-router-dom';
import ChunkLoadBoundary from '@/components/ChunkLoadBoundary';
import { BrandLoader } from '@/components/ui/LoadingStates';

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

// Shown while a lazy route's chunk is being fetched. Branded, and only visible if the wait is
// longer than ~150ms (no spinner flash on fast loads); the black surface is already there, so
// nothing flashes white either.
const PageLoader = () => <BrandLoader fullScreen />;

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
  // Opened directly (no in-app history, e.g. from a shared link)? Go home instead of leaving.
  const safeBack = () => {
    const idx = (window.history.state && (window.history.state as { idx?: number }).idx) || 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };
  const location = useLocation();

  return (
    <ChunkLoadBoundary>
    <Suspense fallback={<PageLoader />}>
      {/* Keyed by pathname: a real route change fades the new screen in (opacity only, so fixed
          headers/sheets inside pages never shift). Query-string/tab changes never replay it. */}
      <div key={location.pathname} className="dl-route w-full h-full">
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
      <Route path="/terms-of-service" element={<TermsOfService onBack={safeBack} />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy onBack={safeBack} />} />
      <Route path="/child-safety" element={<ChildSafetyStandards onBack={safeBack} />} />
      <Route path="/community-guidelines" element={<CommunityGuidelines onBack={safeBack} />} />
      <Route path="/safety-tips" element={<SafetyTips onBack={safeBack} />} />
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
      </div>
    </Suspense>
    </ChunkLoadBoundary>
  );
};

export default AppRoutes; 
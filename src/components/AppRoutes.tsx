import React from 'react';
import { Routes, Route } from "react-router-dom";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import DiscoverPage from '@/components/DiscoverPage';
import PaymentSuccess from '@/pages/PaymentSuccess';
import Unsubscribe from '@/pages/Unsubscribe';
import OAuthCallback from '@/components/OAuthCallback';
import OAuthDebug from '@/components/OAuthDebug';
import ProfileCompletionPage from '@/components/ProfileCompletionPage';
import ResetPasswordPage from '@/components/ResetPasswordPage';
import { useMobileOAuth } from '@/hooks/useMobileOAuth';

const AppRoutes = () => {
  // Initialize mobile OAuth handler inside router context
  useMobileOAuth();

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/discover" element={<DiscoverPage currentUser={null} />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/unsubscribe" element={<Unsubscribe />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      <Route path="/auth/debug" element={<OAuthDebug />} />
      <Route path="/complete-profile" element={<ProfileCompletionPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
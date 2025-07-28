import React from 'react';
import { Routes, Route } from "react-router-dom";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import DiscoverPage from '@/components/DiscoverPage';
import PaymentSuccess from '@/pages/PaymentSuccess';
import OAuthCallback from '@/components/OAuthCallback';
import ProfileCompletionPage from '@/components/ProfileCompletionPage';
import { useMobileOAuth } from '@/hooks/useMobileOAuth';

const AppRoutes = () => {
  // Initialize mobile OAuth handler inside router context
  useMobileOAuth();

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/discover" element={<DiscoverPage currentUser={null} />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      <Route path="/complete-profile" element={<ProfileCompletionPage />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
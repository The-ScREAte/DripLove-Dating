import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import DiscoverPage from './components/DiscoverPage';
import PaymentSuccess from './pages/PaymentSuccess';
import OAuthCallback from './components/OAuthCallback';
import ProfileCompletionPage from './components/ProfileCompletionPage';
import { initializeAndroidOptimizations, startAndroidElementWatcher } from './utils/androidOptimizations';

const queryClient = new QueryClient();

const App = () => {
  // Initialize Android optimizations on app start
  useEffect(() => {
    // Initialize Android-specific optimizations
    initializeAndroidOptimizations();
    
    // Start watching for new elements to optimize
    const stopWatcher = startAndroidElementWatcher();
    
    // Cleanup function
    return () => {
      stopWatcher();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        
        {/* ✅ Mobile-responsive container with Android safe area support */}
        <div className="mobile-container">
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/discover" element={<DiscoverPage currentUser={null} />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />
              <Route path="/auth/callback" element={<OAuthCallback />} />
              <Route path="/complete-profile" element={<ProfileCompletionPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

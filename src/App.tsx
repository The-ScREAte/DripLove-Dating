import React from "react";
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

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        
        {/* Standard web container */}
        <div className="w-full h-full">
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

import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "@/components/AppRoutes";
import { useGlobalKeyboardOffset } from "@/hooks/useGlobalKeyboardOffset";
import { detectDeviceLanguage } from "@/utils/languageSync";
import i18n from "@/i18n/config";
import ScreenCaptureBlockedOverlay from "@/components/ScreenCaptureBlockedOverlay";

// ⭐ ANDROID PERFORMANCE: Optimized QueryClient with aggressive caching
// Reduces network requests and improves UI responsiveness on Android
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60 * 1000, // Data fresh for 3 minutes
      gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes
      retry: 1, // Single retry on failure (faster than default 3)
      refetchOnWindowFocus: false, // Prevent refetch on tab focus (Android switches often)
      refetchOnReconnect: false, // Don't refetch on network reconnect
    },
  },
});
 
const App = ({
  user,
  isAuthenticated,
}: {
  user: any | null;
  isAuthenticated: boolean;
}) => {
  // Add error boundary to prevent crashes
  const [hasError, setHasError] = React.useState(false);
  
  // Keep focused inputs visible above the on-screen keyboard, app-wide
  // (login, admin, broadcast, everywhere) - see hook for why the previous
  // handler silently didn't work on iOS.
  useGlobalKeyboardOffset();

  // Detect and set device language on app start
  React.useEffect(() => {
    const deviceLanguage = detectDeviceLanguage();
    i18n.changeLanguage(deviceLanguage);
  }, []);
  
  const handleError = (error: Error) => {
    console.error('App error:', error);
    setHasError(true);
  };

  if (hasError) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Something went wrong</h2>
          <p className="text-gray-600 mb-4">Please refresh the app to continue.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
          >
            Refresh App
          </button>
        </div>
      </div>
    );
  }

  try {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ScreenCaptureBlockedOverlay isAuthenticated={isAuthenticated} />

          {/* Mobile-optimized container */}
          <div className="w-full h-full"
               style={{ 
                 touchAction: 'manipulation',
                 userSelect: 'none',
                 WebkitUserSelect: 'none',
                 WebkitTouchCallout: 'none'
               }}>
            <BrowserRouter>
              <AppRoutes user={user} isAuthenticated={isAuthenticated} />
            </BrowserRouter>
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    );
  } catch (error) {
    handleError(error as Error);
    return null;
  }
};

export default App;

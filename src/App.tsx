import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "@/components/AppRoutes";

const queryClient = new QueryClient();

const App = () => {
  // Add error boundary to prevent crashes
  const [hasError, setHasError] = React.useState(false);
  
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
          
          {/* Mobile-optimized container */}
          <div className="w-full h-full"
               style={{ 
                 touchAction: 'manipulation',
                 userSelect: 'none',
                 WebkitUserSelect: 'none',
                 WebkitTouchCallout: 'none'
               }}>
            <BrowserRouter>
              <AppRoutes />
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

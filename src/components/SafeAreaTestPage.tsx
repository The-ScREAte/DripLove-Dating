import React from 'react';
import SafeAreaDebug from './SafeAreaDebug';

interface SafeAreaTestPageProps {
  onClose?: () => void;
}

export const SafeAreaTestPage: React.FC<SafeAreaTestPageProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[9999] bg-white">
      {/* Safe Area Debug Component */}
      <SafeAreaDebug />
      
      {/* Admin Page Test */}
      <div className="admin-page-container min-h-screen bg-gradient-to-br from-blue-400 to-purple-600">
        <div className="p-4">
          <h1 className="text-2xl font-bold text-white mb-4">Safe Area Test - Admin Page</h1>
          <p className="text-white/90 mb-4">This should respect the safe areas on mobile devices</p>
          {onClose && (
            <button 
              onClick={onClose}
              className="bg-white text-black px-4 py-2 rounded"
            >
              Close Test
            </button>
          )}
        </div>
      </div>
      
      {/* Terms Page Test */}
      <div className="terms-container min-h-screen bg-gradient-to-br from-green-400 to-blue-600 fixed top-0 left-full w-full">
        <div className="p-4">
          <h1 className="text-2xl font-bold text-white mb-4">Safe Area Test - Terms Page</h1>
          <p className="text-white/90">This should also respect the safe areas</p>
        </div>
      </div>
      
      {/* Toast Test */}
      <div className="toast-viewport-safe fixed">
        <div className="bg-black text-white p-4 rounded-lg">
          Toast Test - Should respect safe areas
        </div>
      </div>
    </div>
  );
};

export default SafeAreaTestPage;

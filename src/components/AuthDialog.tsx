import React, { Suspense, lazy } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Was a static import - AuthDialog itself renders unconditionally alongside
// WelcomeScreen (gated only by its own `open` prop, not by whether it's
// mounted at all), so a static import here pulled AuthForm's ~765 lines
// into the main bundle regardless of Index.tsx's own lazy() wrapper around
// AuthForm - the dynamic import there was silently defeated by this static
// one (confirmed via Vite's own build warning about it).
const AuthForm = lazy(() => import('./AuthForm'));

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLogin: boolean;
  onToggle: () => void;
  onOAuthSuccess?: (needsCompletion: boolean) => void;
}

const AuthDialog: React.FC<AuthDialogProps> = ({ 
  open, 
  onOpenChange, 
  isLogin, 
  onToggle,
  onOAuthSuccess 
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] sm:w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-0 bg-transparent border-none">
        <DialogTitle className="sr-only">{isLogin ? 'Sign In' : 'Sign Up'}</DialogTitle>
        <DialogDescription className="sr-only">
          {isLogin ? 'Enter your credentials to sign in to your account' : 'Create a new account by providing your information'}
        </DialogDescription>
        <div className="bg-white/30 backdrop-blur-xl rounded-2xl">
          <Suspense fallback={null}>
            <AuthForm
              isLogin={isLogin}
              onToggle={onToggle}
              onOAuthSuccess={onOAuthSuccess}
              onBack={() => onOpenChange(false)}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;

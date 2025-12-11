import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import AuthForm from './AuthForm';

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
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-0 bg-transparent border-none">
        <DialogTitle className="sr-only">{isLogin ? 'Sign In' : 'Sign Up'}</DialogTitle>
        <DialogDescription className="sr-only">
          {isLogin ? 'Enter your credentials to sign in to your account' : 'Create a new account by providing your information'}
        </DialogDescription>
        <div className="bg-white/30 backdrop-blur-xl rounded-2xl">
          <AuthForm
            isLogin={isLogin}
            onToggle={onToggle}
            onOAuthSuccess={onOAuthSuccess}
            onBack={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;

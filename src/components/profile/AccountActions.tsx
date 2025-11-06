
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LogOut, AlertTriangle, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import RateAppButton from '@/components/RateAppButton';
import LanguageSelector from '@/components/LanguageSelector';

import { useEnhancedSubscription } from '@/hooks/useEnhancedSubscription';
import { useNavigate } from 'react-router-dom';

interface AccountActionsProps {
  currentUser: any;
  onLogout: () => void;
  onShowTerms?: () => void;
  onShowPrivacy?: () => void;
  hideLogoutTermsPrivacy?: boolean;
  preferredLanguage?: string;
  onLanguageChange?: (language: string) => void;
}

const AccountActions = ({ currentUser, onLogout, onShowTerms, onShowPrivacy, hideLogoutTermsPrivacy, preferredLanguage, onLanguageChange }: AccountActionsProps) => {
  const { t } = useTranslation();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const { toast } = useToast();
  const { isPremium, subscriptionStatus, loading } = useEnhancedSubscription();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      // Remove push token before logging out
      if (currentUser?.id) {
        const { removePushToken } = await import('@/services/pushNotifications');
        await removePushToken(currentUser.id);
      }
      
      await supabase.auth.signOut();
      onLogout();
      toast({
        title: "Logged out",
        description: "See you again soon!",
      });
    } catch (error) {
  // ...removed log...
    }
  };

  const handleDeleteAccountRequest = () => {
    setShowPasswordDialog(true);
    setPassword('');
    setPasswordError('');
  };

  const handleDeleteAccount = async () => {
    if (!password.trim()) {
      setPasswordError('Password is required');
      return;
    }

    setDeletingAccount(true);
    setPasswordError('');
    
    try {
      // First verify the password by attempting to reauthenticate
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: password,
      });

      if (authError) {
        setPasswordError('Incorrect password');
        setDeletingAccount(false);
        return;
      }

      // If password is correct, proceed with account deletion
      const { error } = await supabase.rpc('delete_user_and_data', {
        user_id_to_delete: currentUser.id
      });

      if (error) throw error;

      toast({
        title: "Account deleted",
        description: "Your account and all associated data have been permanently deleted.",
      });

      // Remove push token before logging out
      if (currentUser?.id) {
        const { removePushToken } = await import('@/services/pushNotifications');
        await removePushToken(currentUser.id);
      }

      await supabase.auth.signOut();
      onLogout();
    } catch (error: any) {
  // ...removed log...
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingAccount(false);
      setShowPasswordDialog(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.accountActions')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Language Selector */}
        {preferredLanguage && onLanguageChange && (
          <div className="bg-gray-50 p-4 rounded-lg border">
            <LanguageSelector
              value={preferredLanguage}
              onChange={onLanguageChange}
              isEditing={true}
              showLabel={true}
            />
          </div>
        )}

        {/* Rate DripLove Button */}
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="flex flex-col space-y-3">
            <span className="font-medium text-gray-900">{t('settings.enjoyingDripLove')}</span>
            <p className="text-sm text-gray-600">
              {t('settings.rateExperience')}
            </p>
            <RateAppButton className="w-full sm:w-auto" />
          </div>
        </div>

        {/* Support Email */}
        <div className="bg-gray-50 p-4 rounded-lg border">
          <div className="flex items-center space-x-2 mb-2">
            <Mail className="w-4 h-4 text-pink-600" />
            <span className="font-medium text-gray-700">{t('settings.needHelp')}</span>
          </div>
          <p className="text-sm text-gray-600 mb-2">
            {t('settings.contactSupport')}
          </p>
          <a 
            href="mailto:support@driplove.com" 
            className="text-blue-600 hover:text-blue-800 underline"
          >
            support@driplove.com
          </a>
        </div>

        {/* Legal Links and Logout only if not hidden by prop */}
        {!hideLogoutTermsPrivacy && (
          <>
            {(onShowTerms || onShowPrivacy) && (
              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="flex flex-wrap justify-center gap-4 text-sm">
                  {onShowTerms && (
                    <button 
                      onClick={onShowTerms}
                      className="text-purple-600 hover:text-purple-700 hover:underline transition-colors"
                    >
                      {t('settings.termsOfService')}
                    </button>
                  )}
                  {onShowTerms && onShowPrivacy && (
                    <span className="text-gray-400">•</span>
                  )}
                  {onShowPrivacy && (
                    <button 
                      onClick={onShowPrivacy}
                      className="text-purple-600 hover:text-purple-700 hover:underline transition-colors"
                    >
                      {t('settings.privacyPolicy')}
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={handleLogout}
                variant="outline"
                className="flex items-center justify-center space-x-2 border-gray-300 text-gray-700 hover:bg-gray-50 w-full sm:w-auto"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('common.logout')}</span>
              </Button>
            </div>
          </>
        )}
        {/* Cancel Subscription (only if premium and active) */}
        {(isPremium || (subscriptionStatus && subscriptionStatus.plan_name === 'premium')) && 
         (!subscriptionStatus || subscriptionStatus.status === 'active') && (
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Button
              variant="outline"
              className="flex items-center justify-center space-x-2 w-full sm:w-auto border-red-400 text-red-600 hover:bg-red-50"
              onClick={() => navigate('/unsubscribe')}
            >
              {t('settings.cancelSubscription')}
            </Button>
          </div>
        )}
        {/* Delete Account always visible */}
        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive"
                className="flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Delete Account</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="sm:max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Account</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete your account? This action will:
                  <ul className="list-disc ml-6 mt-2 space-y-1">
                    <li>Delete your profile and all personal information</li>
                    <li>Remove all your photos</li>
                    <li>Delete all your matches and conversations</li>
                    <li>Remove all likes given and received</li>
                  </ul>
                  <br />
                  <strong>This action cannot be undone and your profile won't exist anymore.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>No, Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteAccountRequest}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Yes, Delete My Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Password Confirmation Dialog */}
        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Account Deletion</DialogTitle>
              <DialogDescription>
                Please enter your password to confirm you want to delete your account permanently.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  className={passwordError ? 'border-red-500' : ''}
                />
                {passwordError && (
                  <p className="text-red-500 text-sm mt-1">{passwordError}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowPasswordDialog(false);
                  setPassword('');
                  setPasswordError('');
                }}
                disabled={deletingAccount}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteAccount}
                disabled={deletingAccount || !password.trim()}
              >
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default AccountActions;

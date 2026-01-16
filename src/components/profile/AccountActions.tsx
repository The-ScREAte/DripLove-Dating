import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LogOut, AlertTriangle, Mail, Loader2, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import RateAppButton from '@/components/RateAppButton';
import LanguageSelector from '@/components/LanguageSelector';
import LiveChat from '@/components/LiveChat';

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

type AuthProvider = 'email' | 'google' | 'apple' | 'unknown';

const AccountActions = ({ currentUser, onLogout, onShowTerms, onShowPrivacy, hideLogoutTermsPrivacy, preferredLanguage, onLanguageChange }: AccountActionsProps) => {
  const { t } = useTranslation();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [authProvider, setAuthProvider] = useState<AuthProvider>('unknown');
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [emailForVerification, setEmailForVerification] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [showLiveChat, setShowLiveChat] = useState(false);
  const { toast } = useToast();
  const { isPremium, subscriptionStatus, loading } = useEnhancedSubscription();
  const navigate = useNavigate();
  
  const isNativePlatform = Capacitor.isNativePlatform();
  const isAndroidNative = isNativePlatform && Capacitor.getPlatform() === 'android';

  // Determine auth provider on mount
  useEffect(() => {
    const checkAuthProvider = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const provider = user.app_metadata?.provider || 'email';
          if (provider === 'google') {
            setAuthProvider('google');
          } else if (provider === 'apple') {
            setAuthProvider('apple');
          } else {
            setAuthProvider('email');
          }
        }
      } catch (error) {
        console.error('Error checking auth provider:', error);
        setAuthProvider('email'); // Default to email
      }
    };
    checkAuthProvider();
  }, []);

  const handleLogout = async () => {
    try {
      // Remove push token before logging out
      if (currentUser?.id) {
        const { removePushToken } = await import('@/services/pushNotifications');
        await removePushToken(currentUser.id);
      }
      
      // Clear all IAP state to prevent it leaking to next logged-in user
      const { clearAllIapState } = await import('@/iap-google');
      clearAllIapState();
      
      await supabase.auth.signOut();
      onLogout();
      toast({
        title: "Logged out",
        description: "See you again soon!",
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const handleDeleteAccountRequest = () => {
    setShowPasswordDialog(true);
    setPassword('');
    setPasswordError('');
    setVerificationCode('');
    setEmailForVerification('');
    setCodeSent(false);
  };

  // Send verification code to email for web OAuth users
  const handleSendVerificationCode = async () => {
    if (!emailForVerification.trim()) {
      setPasswordError('Please enter your email address');
      return;
    }

    if (emailForVerification.toLowerCase() !== currentUser.email.toLowerCase()) {
      setPasswordError('Email does not match your account');
      return;
    }

    setSendingCode(true);
    setPasswordError('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailForVerification,
        options: {
          shouldCreateUser: false,
        },
      });

      if (error) throw error;

      setCodeSent(true);
      toast({
        title: 'Verification code sent',
        description: 'Please check your email for the verification code.',
      });
    } catch (error: any) {
      console.error('Error sending verification code:', error);
      setPasswordError('Failed to send verification code. Please try again.');
    } finally {
      setSendingCode(false);
    }
  };

  // Handle OAuth re-authentication for native platforms
  const handleOAuthReauth = async (): Promise<boolean> => {
    setIsReauthenticating(true);
    setPasswordError('');
    
    try {
      if (authProvider === 'google' && isNativePlatform) {
        // Use native Google Sign-In for re-authentication
        const { signInWithGoogleNative, signOutGoogleNative } = await import('@/utils/googleNativeAuth');
        
        try {
          await signOutGoogleNative();
        } catch (e) {
          // Ignore signout errors
        }
        
        const result = await signInWithGoogleNative();
        
        if (!result?.user) {
          setPasswordError('Google authentication failed. Please try again.');
          return false;
        }
        
        // Verify it's the same user
        if (result.user.email !== currentUser.email) {
          setPasswordError('Please sign in with the same Google account you used to create this account.');
          await supabase.auth.signOut();
          return false;
        }
        
        return true;
      } else if (authProvider === 'apple' && isNativePlatform) {
        // Use native Apple Sign-In for re-authentication
        const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
        
        const result = await SignInWithApple.authorize({
          clientId: 'com.driplove.dating',
          redirectURI: 'https://tgjsyyihabsovironesw.supabase.co/auth/v1/callback',
          scopes: 'email name',
        });
        
        if (!result?.response?.identityToken) {
          setPasswordError('Apple authentication failed. Please try again.');
          return false;
        }
        
        // Re-authenticate with Supabase using the Apple token
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: result.response.identityToken,
        });
        
        if (error) {
          setPasswordError('Re-authentication failed. Please try again.');
          return false;
        }
        
        return true;
      }
      
      return false;
    } catch (error: any) {
      console.error('OAuth re-auth error:', error);
      setPasswordError(error.message || 'Authentication failed. Please try again.');
      return false;
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleDeleteAccount = async () => {
    // For email users, require password
    if (authProvider === 'email') {
      if (!password.trim()) {
        setPasswordError('Password is required');
        return;
      }
    }

    // For web OAuth users (Google/Apple), require verification code
    if (!isNativePlatform && (authProvider === 'google' || authProvider === 'apple')) {
      if (!codeSent) {
        setPasswordError('Please send and enter the verification code first');
        return;
      }
      if (!verificationCode.trim()) {
        setPasswordError('Verification code is required');
        return;
      }
    }

    setDeletingAccount(true);
    setPasswordError('');
    
    try {
      // Re-authenticate based on provider
      if (authProvider === 'email') {
        // Email/password re-authentication
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: currentUser.email,
          password: password,
        });

        if (authError) {
          setPasswordError('Incorrect password');
          setDeletingAccount(false);
          return;
        }
      } else if (isNativePlatform && (authProvider === 'google' || authProvider === 'apple')) {
        // Native OAuth re-authentication
        const success = await handleOAuthReauth();
        if (!success) {
          setDeletingAccount(false);
          return;
        }
      } else if (!isNativePlatform && (authProvider === 'google' || authProvider === 'apple')) {
        // Web OAuth users - verify OTP code
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: emailForVerification,
          token: verificationCode,
          type: 'email',
        });

        if (verifyError) {
          setPasswordError('Invalid verification code. Please try again.');
          setDeletingAccount(false);
          return;
        }
      }

      // If re-auth is successful, deactivate all payment methods first
      try {
        await supabase.functions.invoke('deactivate-user-payments', {
          body: { user_id: currentUser.id }
        });
      } catch (paymentError) {
        console.error('Error deactivating payment methods:', paymentError);
        // Non-fatal: continue with deletion even if this fails
      }

      // Delete face from AWS Rekognition
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('face_descriptor')
          .eq('id', currentUser.id)
          .single();

        if (profile?.face_descriptor) {
          await supabase.functions.invoke('face-verify', {
            body: {
              action: 'delete_face',
              userId: currentUser.id,
              faceId: profile.face_descriptor
            }
          });
        }
      } catch (faceError) {
        console.error('Error deleting face from Rekognition:', faceError);
        // Continue with account deletion even if face deletion fails
      }

      // Proceed with account deletion
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
      console.error('Delete account error:', error);
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
      <CardHeader className={isAndroidNative ? 'p-4' : undefined}>
        <CardTitle className={isAndroidNative ? 'text-xl' : undefined}>{t('profile.accountActions')}</CardTitle>
      </CardHeader>
      <CardContent className={isAndroidNative ? 'p-4 pt-0 space-y-3' : 'space-y-4'}>
        {/* 1. Support & Help - Most important for users */}
        <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-lg border border-pink-100">
          <div className="flex items-center space-x-2 mb-3">
            <MessageCircle className="w-5 h-5 text-pink-600" />
            <span className="font-semibold text-gray-800">{t('settings.needHelp')}</span>
          </div>
          
          <Button
            onClick={() => setShowLiveChat(true)}
            size={isAndroidNative ? 'sm' : 'default'}
            className={`w-full mb-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-medium ${isAndroidNative ? 'text-xs' : ''}`}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Chat with Support
          </Button>
          
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Mail className="w-4 h-4 text-gray-500" />
            <a 
              href="mailto:driploveinfo@gmail.com" 
              className="text-blue-600 hover:text-blue-800 underline"
            >
              driploveinfo@gmail.com
            </a>
          </div>
        </div>
        
        <LiveChat open={showLiveChat} onOpenChange={setShowLiveChat} />

        {/* 2. Language Selector - Common setting */}
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

        {/* 3. Rate App - Positive action */}
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="flex flex-col space-y-3">
            <span className="font-medium text-gray-900">{t('settings.enjoyingDripLove')}</span>
            <p className={isAndroidNative ? 'text-xs text-gray-600' : 'text-sm text-gray-600'}>
              {t('settings.rateExperience')}
            </p>
            <RateAppButton className="w-full sm:w-auto" />
          </div>
        </div>

        {/* 4. Legal Links - Reference info */}
        {!hideLogoutTermsPrivacy && (onShowTerms || onShowPrivacy) && (
          <div className="bg-gray-50 p-4 rounded-lg border">
            <p className="text-xs text-gray-500 mb-2 font-medium">Legal</p>
            <div className={isAndroidNative ? 'flex flex-wrap justify-center gap-3 text-xs' : 'flex flex-wrap justify-center gap-4 text-sm'}>
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

        {/* 5. Logout Button - Session action */}
        {!hideLogoutTermsPrivacy && (
          <Button 
            onClick={handleLogout}
            variant="outline"
            size={isAndroidNative ? 'sm' : 'default'}
            className={`w-full flex items-center justify-center space-x-2 border-gray-300 text-gray-700 hover:bg-gray-100 ${isAndroidNative ? 'text-xs' : ''}`}
          >
            <LogOut className="w-4 h-4" />
            <span>{t('common.logout')}</span>
          </Button>
        )}

        {/* 6. Subscription Management - Cancel or Resume */}
        {(isPremium || (subscriptionStatus && subscriptionStatus.plan_name === 'premium' && subscriptionStatus.is_active)) && (
          <div className="space-y-3">
            {/* Show subscription status if cancelled but still active until expiration */}
            {subscriptionStatus && subscriptionStatus.status === 'cancelled' && subscriptionStatus.expires_at && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  <span className="font-semibold text-orange-800">Subscription Cancelled</span>
                </div>
                <p className="text-sm text-orange-700 mb-1">
                  Your premium features remain active until:
                </p>
                <p className="text-base font-bold text-orange-900">
                  {new Date(subscriptionStatus.expires_at).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
                <p className="text-xs text-orange-600 mt-2">
                  You will not be charged again and can resubscribe anytime.
                </p>
              </div>
            )}

            {/* Cancel button for active subscriptions only */}
            {(!subscriptionStatus || subscriptionStatus.status === 'active') && (
              <Button
                variant="outline"
                size={isAndroidNative ? 'sm' : 'default'}
                className={`w-full flex items-center justify-center space-x-2 border-orange-300 text-orange-600 hover:bg-orange-50 ${isAndroidNative ? 'text-xs' : ''}`}
                onClick={() => navigate('/unsubscribe')}
              >
                {t('settings.cancelSubscription')}
              </Button>
            )}

            {/* Resume button for cancelled Paystack subscriptions */}
            {subscriptionStatus && 
             subscriptionStatus.status === 'cancelled' && 
             subscriptionStatus.payment_method === 'paystack' && (
              <Button
                variant="outline"
                size={isAndroidNative ? 'sm' : 'default'}
                className={`w-full flex items-center justify-center space-x-2 border-green-300 text-green-600 hover:bg-green-50 ${isAndroidNative ? 'text-xs' : ''}`}
                onClick={async () => {
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) return;

                    const { error } = await supabase
                      .from('user_subscriptions')
                      .update({ 
                        status: 'active',
                        auto_renew: true,
                        updated_at: new Date().toISOString()
                      })
                      .eq('user_id', user.id)
                      .eq('status', 'cancelled');

                    if (error) throw error;

                    toast({
                      title: 'Subscription Resumed',
                      description: 'Your subscription has been reactivated and will auto-renew.',
                    });

                    // Refresh the page to update UI
                    window.location.reload();
                  } catch (err: any) {
                    toast({
                      title: 'Error',
                      description: 'Failed to resume subscription. Please try again.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Resume Subscription
              </Button>
            )}
          </div>
        )}
        {/* Delete Account always visible */}
        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive"
                size={isAndroidNative ? 'sm' : 'default'}
                className={`flex items-center justify-center space-x-2 w-full sm:w-auto ${isAndroidNative ? 'text-xs' : ''}`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Delete Account</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="sm:max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Account</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div>
                    <p>
                      Are you sure you want to permanently delete your account? This action will:
                    </p>
                    <ul className="list-disc ml-6 mt-2 space-y-1">
                      <li>Delete your profile and all personal information</li>
                      <li>Remove all your photos</li>
                      <li>Delete all your matches and conversations</li>
                      <li>Remove all likes given and received</li>
                    </ul>
                    <p className="mt-2">
                      <strong>
                        This action cannot be undone and your profile won't exist anymore.
                      </strong>
                    </p>
                  </div>
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

        {/* Password/OAuth Confirmation Dialog */}
        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Account Deletion</DialogTitle>
              <DialogDescription>
                {authProvider === 'email' 
                  ? 'Please enter your password to confirm you want to delete your account permanently.'
                  : isNativePlatform
                  ? `Please sign in with ${authProvider === 'google' ? 'Google' : 'Apple'} to confirm you want to delete your account permanently.`
                  : 'For security, please verify your email address to confirm account deletion.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {authProvider === 'email' ? (
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
              ) : isNativePlatform ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-600 mb-2">
                    Tap "Delete Account" to sign in with {authProvider === 'google' ? 'Google' : 'Apple'} and confirm deletion.
                  </p>
                  {passwordError && (
                    <p className="text-red-500 text-sm mt-1">{passwordError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={emailForVerification}
                      onChange={(e) => {
                        setEmailForVerification(e.target.value);
                        setPasswordError('');
                      }}
                      disabled={codeSent}
                      className={passwordError && !codeSent ? 'border-red-500' : ''}
                    />
                  </div>
                  {!codeSent && (
                    <Button
                      onClick={handleSendVerificationCode}
                      disabled={sendingCode || !emailForVerification.trim()}
                      className="w-full"
                      variant="outline"
                    >
                      {sendingCode ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending Code...
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Send Verification Code
                        </>
                      )}
                    </Button>
                  )}
                  {codeSent && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Verification Code
                      </label>
                      <Input
                        type="text"
                        placeholder="Enter 6-digit code"
                        value={verificationCode}
                        onChange={(e) => {
                          setVerificationCode(e.target.value);
                          setPasswordError('');
                        }}
                        className={passwordError ? 'border-red-500' : ''}
                        maxLength={6}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Check your email for the verification code
                      </p>
                    </div>
                  )}
                  {passwordError && (
                    <p className="text-red-500 text-sm">{passwordError}</p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowPasswordDialog(false);
                  setPassword('');
                  setPasswordError('');
                  setVerificationCode('');
                  setEmailForVerification('');
                  setCodeSent(false);
                }}
                disabled={deletingAccount || isReauthenticating || sendingCode}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteAccount}
                disabled={
                  deletingAccount || 
                  isReauthenticating || 
                  sendingCode ||
                  (authProvider === 'email' && !password.trim()) ||
                  (!isNativePlatform && (authProvider === 'google' || authProvider === 'apple') && (!codeSent || !verificationCode.trim()))
                }
              >
                {deletingAccount || isReauthenticating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isReauthenticating ? 'Verifying...' : 'Deleting...'}
                  </>
                ) : 'Delete Account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default AccountActions;

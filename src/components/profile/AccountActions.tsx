import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
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

const DELETE_CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';

const AccountActions = ({ currentUser, onLogout, onShowTerms, onShowPrivacy, hideLogoutTermsPrivacy, preferredLanguage, onLanguageChange }: AccountActionsProps) => {
  const { t } = useTranslation();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [showLiveChat, setShowLiveChat] = useState(false);
  const { toast } = useToast();
  const { isPremium, subscriptionStatus, loading, refetch: refetchSubscription } = useEnhancedSubscription();
  const navigate = useNavigate();
  
  const isNativePlatform = Capacitor.isNativePlatform();
  const isAndroidNative = isNativePlatform && Capacitor.getPlatform() === 'android';

  const openStoreSubscriptionManagement = async () => {
    const platform = Capacitor.getPlatform();
    try {
      if (platform === 'ios') {
        await Browser.open({ url: 'itms-apps://apps.apple.com/account/subscriptions', windowName: '_system' });
        return;
      }
      if (platform === 'android') {
        await Browser.open({ url: 'https://play.google.com/store/account/subscriptions', windowName: '_system' });
        return;
      }
    } catch (e) {
      // Web fallback
      const url = platform === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions';
      window.open(url, '_blank');
    }
  };

  const handleLogout = async () => {
    try {
      // Clear chat caches before sign-out to prevent cross-account stale render.
      const { clearChatCache } = await import('@/cache/chatCache');
      clearChatCache();
      if (typeof window !== 'undefined') {
        const w = window as Window & {
          chatMatchesCache?: Map<string, unknown>;
          chatMessagesCache?: Map<string, unknown>;
        };
        w.chatMatchesCache?.clear();
        w.chatMessagesCache?.clear();
      }

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
    setShowDeleteConfirmDialog(true);
    setDeleteConfirmText('');
    setDeleteError('');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== DELETE_CONFIRMATION_PHRASE) {
      setDeleteError(`Please type "${DELETE_CONFIRMATION_PHRASE}" to confirm`);
      return;
    }

    setDeletingAccount(true);
    setDeleteError('');

    try {
      // Deactivate all payment methods first
      try {
        await supabase.functions.invoke('deactivate-user-payments', {
          body: { user_id: currentUser.id }
        });
      } catch (paymentError) {
        console.error('Error deactivating payment methods:', paymentError);
        // Non-fatal: continue with deletion even if this fails
      }

      // Delete every Rekognition face tied to this user. Looked up server-side by
      // user ID rather than trusting a single locally-known faceId, so it still
      // works even if profiles.face_descriptor is stale/missing, and cleans up
      // every face if the user ever re-verified more than once.
      try {
        await supabase.functions.invoke('face-verify', {
          body: {
            action: 'delete_user_faces',
            userId: currentUser.id,
          }
        });
      } catch (faceError) {
        console.error('Error deleting face from Rekognition:', faceError);
        // Continue with account deletion even if face deletion fails
      }

      // Delete the user's photo files from Storage. delete_user_and_data only
      // removes the user_images rows (metadata) - the actual files are never
      // freed unless we remove them here first.
      try {
        const { data: files, error: listError } = await supabase.storage
          .from('user-photos')
          .list(currentUser.id);

        if (!listError && files && files.length > 0) {
          const filePaths = files.map((file) => `${currentUser.id}/${file.name}`);
          await supabase.storage.from('user-photos').remove(filePaths);
        }
      } catch (storageError) {
        console.error('Error deleting photos from storage:', storageError);
        // Continue with account deletion even if storage cleanup fails
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
      setShowDeleteConfirmDialog(false);
    }
  };

  return (
    <div className={isAndroidNative ? 'space-y-3' : 'space-y-4'}>
        {/* 1. Support & Help - Most important for users */}
        <div className="bg-black border border-pink-500/30 p-4 rounded-lg">
          <div className="flex items-center space-x-2 mb-3">
            <MessageCircle className="w-5 h-5 text-pink-500" />
            <span className="font-semibold text-white">{t('settings.needHelp')}</span>
          </div>

          <Button
            onClick={() => setShowLiveChat(true)}
            size={isAndroidNative ? 'sm' : 'default'}
            className={`w-full mb-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-medium ${isAndroidNative ? 'text-xs' : ''}`}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Chat with Support
          </Button>

          <div className="flex items-center gap-2 text-sm text-white/80">
            <Mail className="w-4 h-4 text-white/60" />
            <a
              href="mailto:driploveinfo@gmail.com"
              className="text-pink-400 hover:text-pink-300 underline"
            >
              driploveinfo@gmail.com
            </a>
          </div>
        </div>
        
        <LiveChat open={showLiveChat} onOpenChange={setShowLiveChat} />

        {/* 2. Language Selector - Common setting */}
        {preferredLanguage && onLanguageChange && (
          <div className="bg-black p-4 rounded-lg border border-pink-500/20 text-white">
            <LanguageSelector
              value={preferredLanguage}
              onChange={onLanguageChange}
              isEditing={true}
              showLabel={true}
            />
          </div>
        )}

        {/* 3. Rate App - Positive action */}
        <div className="bg-black p-4 rounded-lg border border-yellow-500/30">
          <div className="flex flex-col space-y-3">
            <span className="font-medium text-white">{t('settings.enjoyingDripLove')}</span>
            <p className={isAndroidNative ? 'text-xs text-white/60' : 'text-sm text-white/60'}>
              {t('settings.rateExperience')}
            </p>
            <RateAppButton className="w-full sm:w-auto" />
          </div>
        </div>

        {/* 4. Legal Links - Reference info */}
        {!hideLogoutTermsPrivacy && (onShowTerms || onShowPrivacy) && (
          <div className="bg-black p-4 rounded-lg border border-pink-500/20">
            <p className="text-xs text-white/60 mb-2 font-medium">Legal</p>
            <div className={isAndroidNative ? 'flex flex-wrap justify-center gap-3 text-xs' : 'flex flex-wrap justify-center gap-4 text-sm'}>
              {onShowTerms && (
                <button
                  onClick={onShowTerms}
                  className="text-pink-400 hover:text-pink-300 hover:underline transition-colors"
                >
                  {t('settings.termsOfService')}
                </button>
              )}
              {onShowTerms && onShowPrivacy && (
                <span className="text-white/40">•</span>
              )}
              {onShowPrivacy && (
                <button
                  onClick={onShowPrivacy}
                  className="text-pink-400 hover:text-pink-300 hover:underline transition-colors"
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
            className={`w-full flex items-center justify-center space-x-2 border-pink-500/30 text-white hover:bg-pink-500/10 ${isAndroidNative ? 'text-xs' : ''}`}
          >
            <LogOut className="w-4 h-4" />
            <span>{t('common.logout')}</span>
          </Button>
        )}

        {/* 6. Subscription Management - Cancel or Resume */}
        {(isPremium || (subscriptionStatus && subscriptionStatus.plan_name === 'premium' && subscriptionStatus.is_active)) && (
          <div className="space-y-3">
            {/* Show subscription status if cancellation requested but still active until expiration */}
            {subscriptionStatus && subscriptionStatus.status === 'cancelled' && subscriptionStatus.expires_at && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  <span className="font-semibold text-orange-800">Subscription Will Not Renew</span>
                </div>
                <p className="text-sm text-orange-700 mb-1">
                  Your current subscription expires on:
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
                  You will not be charged again. You'll keep premium access until the expiration date above.
                </p>
              </div>
            )}

            {/* Cancel button for active subscriptions only (not cancelled) */}
            {subscriptionStatus && subscriptionStatus.status === 'active' && (
              <>
                <Button
                  variant="outline"
                  size={isAndroidNative ? 'sm' : 'default'}
                  className={`w-full flex items-center justify-center space-x-2 border-orange-300 text-orange-600 hover:bg-orange-50 ${isAndroidNative ? 'text-xs' : ''}`}
                  onClick={() => navigate('/unsubscribe')}
                >
                  {t('settings.cancelSubscription')}
                </Button>
                
                {/* Show expiration date for active subscriptions */}
                {subscriptionStatus.expires_at && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-600 mb-1">
                      Your subscription renews on:
                    </p>
                    <p className="text-sm font-semibold text-blue-900">
                      {new Date(subscriptionStatus.expires_at).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Reactivation buttons for cancelled subscriptions */}
            {subscriptionStatus && subscriptionStatus.status === 'cancelled' && (
              <>
                {/* Paystack - Direct reactivation via button */}
                {subscriptionStatus.payment_method === 'paystack' && (
                  <Button
                    variant="outline"
                    size={isAndroidNative ? 'sm' : 'default'}
                    className={`w-full flex items-center justify-center space-x-2 border-green-300 text-green-600 hover:bg-green-50 ${isAndroidNative ? 'text-xs' : ''}`}
                    onClick={async () => {
                      try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;

                        const { data, error } = await supabase.functions.invoke('reactivate-subscription', {
                          body: { user_id: user.id }
                        });

                        if (error) throw error;

                        if (data.charged_immediately) {
                          toast({
                            title: 'Subscription Reactivated & Charged',
                            description: `Your subscription has been reactivated and your card was charged. New expiry: ${new Date(data.new_expires_at).toLocaleDateString()}`,
                          });
                        } else {
                          toast({
                            title: 'Subscription Reactivated',
                            description: `Your subscription will auto-renew on ${new Date(data.will_renew_on).toLocaleDateString()}`,
                          });
                        }

                        // Refresh the page to update UI
                        window.location.reload();
                      } catch (err: any) {
                        toast({
                          title: 'Error',
                          description: err.message || 'Failed to reactivate subscription. Please try again.',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    Continue with Subscription
                  </Button>
                )}

                {/* Non-store subscriptions (e.g., admin/manual) - allow undo in-app */}
                {subscriptionStatus.payment_method !== 'paystack' &&
                  subscriptionStatus.payment_method !== 'apple' &&
                  subscriptionStatus.payment_method !== 'google' &&
                  subscriptionStatus.payment_method !== 'iap' && (
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
                              updated_at: new Date().toISOString(),
                            })
                            .eq('user_id', user.id)
                            .eq('plan_name', 'premium')
                            .eq('status', 'cancelled');

                          if (error) throw error;

                          toast({
                            title: 'Subscription Reactivated',
                            description: 'Auto-renew has been turned back on.',
                          });

                          window.location.reload();
                        } catch (err: any) {
                          toast({
                            title: 'Error',
                            description: err.message || 'Failed to reactivate subscription. Please try again.',
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      Continue with Subscription
                    </Button>
                  )}

                {/* iOS - Redirect to App Store */}
                {subscriptionStatus.payment_method === 'apple' && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700 mb-2">
                      To reactivate your subscription, please go to:
                    </p>
                    <p className="text-xs font-mono text-blue-900">
                      iPhone Settings → [Your Name] → Subscriptions → DripLove → Turn on Auto-Renew
                    </p>
                    <div className="mt-3 space-y-2">
                      <Button
                        variant="outline"
                        size={isAndroidNative ? 'sm' : 'default'}
                        className={`w-full flex items-center justify-center space-x-2 border-green-300 text-green-600 hover:bg-green-50 ${isAndroidNative ? 'text-xs' : ''}`}
                        onClick={async () => {
                          await openStoreSubscriptionManagement();
                        }}
                      >
                        Continue with Subscription
                      </Button>
                      <Button
                        variant="outline"
                        size={isAndroidNative ? 'sm' : 'default'}
                        className={`w-full ${isAndroidNative ? 'text-xs' : ''}`}
                        onClick={async () => {
                          await refetchSubscription();
                          toast({ title: 'Refreshed', description: 'We re-checked your subscription status.' });
                        }}
                      >
                        I reactivated — Refresh
                      </Button>
                    </div>
                  </div>
                )}

                {/* Android - Redirect to Play Store */}
                {subscriptionStatus.payment_method === 'google' && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700 mb-2">
                      To reactivate your subscription, please go to:
                    </p>
                    <p className="text-xs font-mono text-green-900">
                      Play Store → Menu → Subscriptions → DripLove → Resubscribe
                    </p>
                    <div className="mt-3 space-y-2">
                      <Button
                        variant="outline"
                        size={isAndroidNative ? 'sm' : 'default'}
                        className={`w-full flex items-center justify-center space-x-2 border-green-300 text-green-600 hover:bg-green-50 ${isAndroidNative ? 'text-xs' : ''}`}
                        onClick={async () => {
                          await openStoreSubscriptionManagement();
                        }}
                      >
                        Continue with Subscription
                      </Button>
                      <Button
                        variant="outline"
                        size={isAndroidNative ? 'sm' : 'default'}
                        className={`w-full ${isAndroidNative ? 'text-xs' : ''}`}
                        onClick={async () => {
                          await refetchSubscription();
                          toast({ title: 'Refreshed', description: 'We re-checked your subscription status.' });
                        }}
                      >
                        I reactivated — Refresh
                      </Button>
                    </div>
                  </div>
                )}
              </>
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
            <AlertDialogContent className="sm:max-w-lg bg-black border border-pink-500/30 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">Delete Account</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="text-white/80">
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
                      <strong className="text-white">
                        This action cannot be undone and your profile won't exist anymore.
                      </strong>
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-black border-pink-500/30 text-white hover:bg-neutral-800 hover:text-white">No, Cancel</AlertDialogCancel>
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

        {/* Delete Account Confirmation Dialog */}
        <Dialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
          <DialogContent className="sm:max-w-md bg-black border border-pink-500/30 text-white">
            <DialogHeader>
              <DialogTitle className="text-white">Confirm Account Deletion</DialogTitle>
              <DialogDescription className="text-white/80">
                This action is permanent and cannot be undone. Type <strong className="text-white">{DELETE_CONFIRMATION_PHRASE}</strong> below to confirm.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Input
                type="text"
                placeholder={`Type "${DELETE_CONFIRMATION_PHRASE}" to confirm`}
                value={deleteConfirmText}
                onChange={(e) => {
                  setDeleteConfirmText(e.target.value);
                  setDeleteError('');
                }}
                className={`bg-black/40 border-pink-500/30 text-white placeholder:text-white/40 ${deleteError ? 'border-red-500' : ''}`}
                autoCapitalize="characters"
                autoComplete="off"
              />
              {deleteError && (
                <p className="text-red-500 text-sm mt-1">{deleteError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteConfirmDialog(false);
                  setDeleteConfirmText('');
                  setDeleteError('');
                }}
                disabled={deletingAccount}
                className="border-pink-500/30 text-white hover:bg-neutral-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== DELETE_CONFIRMATION_PHRASE}
              >
                {deletingAccount ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : 'Delete Account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
};

export default AccountActions;

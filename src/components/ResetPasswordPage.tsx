import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import HoppingLogo from '@/components/HoppingLogo';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import './auth/auth.css';

// One field, one button. With a show-password toggle a "confirm" field only
// adds friction (web.dev sign-in form guidance), so there isn't one.
const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);

  useEffect(() => {
    // Set up auth state listener to handle the recovery flow
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async () => {
        // Just log the events, don't redirect immediately
      }
    );

    // Check for recovery tokens in URL and set session if present
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');
    const type = urlParams.get('type');

    if (type === 'recovery' && accessToken && refreshToken) {
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError(t('auth.errors.passwordRequired'));
      document.getElementById('reset-password')?.focus();
      return;
    }
    if (password.length < 6) {
      setError(t('auth.errors.passwordTooShort'));
      document.getElementById('reset-password')?.focus();
      return;
    }

    setLoading(true);

    try {
      // Check if user has a valid session first
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setLinkExpired(true);
        setLoading(false);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        // Supabase's own messages here are specific and actionable ("New password should be different...").
        setError(updateError.message || t('auth.unexpectedError'));
        setLoading(false);
        return;
      }

      toast({ title: t('auth.passwordUpdated') });

      // Sign out the user and redirect to login
      await supabase.auth.signOut();
      navigate('/', { state: { showLogin: true } });
    } catch (err: unknown) {
      console.error('Password update error:', err);
      setError(t('auth.unexpectedError'));
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-fill flex items-center justify-center px-5"
      style={{
        background: '#0B0B0F',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      }}
    >
      <div className="dl-auth-status w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <HoppingLogo size={56} />
        </div>

        {linkExpired ? (
          <div className="text-center" role="alert">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-white">
              {t('auth.setNewPasswordTitle')}
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-white/60">{t('auth.resetLinkExpired')}</p>
            <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => navigate('/')}>
              {t('auth.backToSignIn')}
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-center text-[26px] font-bold leading-tight tracking-tight text-white">
              {t('auth.setNewPasswordTitle')}
            </h1>

            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
              <div>
                <Label htmlFor="reset-password" className="mb-1.5 block text-[13px] font-medium text-white/85">
                  {t('auth.newPassword')}
                </Label>
                <div className="relative">
                  <Input
                    id="reset-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    autoFocus
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'reset-password-error' : 'reset-password-hint'}
                    className={`h-12 rounded-xl border-white/15 bg-white/[0.06] px-3.5 pr-12 text-[16px] text-white placeholder:text-white/40 focus-visible:border-pink-500 focus-visible:ring-pink-500/30 ${
                      error ? 'border-red-400/80 focus-visible:border-red-400 focus-visible:ring-red-400/30' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    aria-pressed={showPassword}
                    className="absolute right-0.5 top-0.5 flex h-11 w-11 items-center justify-center rounded-full text-white/55 transition-colors hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
                {error ? (
                  <div
                    id="reset-password-error"
                    role="alert"
                    className="dl-auth-notice mt-2 flex items-start gap-2 text-sm font-medium text-red-300"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>{error}</p>
                  </div>
                ) : (
                  <p id="reset-password-hint" className="mt-1.5 text-xs text-white/45">{t('auth.passwordHint')}</p>
                )}
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
                {loading ? t('auth.updatingPassword') : t('auth.updatePassword')}
              </Button>
            </form>

            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="min-h-11 px-3 text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline"
              >
                {t('auth.backToSignIn')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;

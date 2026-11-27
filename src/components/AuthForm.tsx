
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { getPasswordResetRedirectUri, getEmailConfirmRedirectUri } from '@/config/oauth';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { saveLanguageToProfile } from '@/utils/languageSync';
import { useBackClose } from '@/utils/backStack';
import './auth/auth.css';

interface AuthFormProps {
  /** "Sign Up": the host closes the sheet and shows the sign-up flow. */
  onToggle: () => void;
}

type FormView = 'form' | 'forgot' | 'resetSent';
type FormNotice = { message: string; action?: 'resend' };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

// Shared field look: same near-black surface language as the sign-up flow.
// 16px text is required so iOS Safari / Android WebView don't zoom on focus.
const fieldClass =
  'h-12 rounded-xl border-white/15 bg-white/[0.06] px-3.5 text-[16px] text-white placeholder:text-white/40 ' +
  'focus-visible:border-pink-500 focus-visible:ring-pink-500/30';
const fieldErrorClass = 'border-red-400/80 focus-visible:border-red-400 focus-visible:ring-red-400/30';
const labelClass = 'mb-1.5 block text-[13px] font-medium text-white/85';
const errorTextClass = 'mt-1.5 text-xs font-medium text-red-400';

const AuthForm = ({ onToggle }: AuthFormProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Check if running on native platform and get platform
  const platform = Capacitor.getPlatform();
  const isIOS = platform === 'ios';
  // On touch devices don't grab focus (the keyboard would cover the sheet while it animates in).
  const autoFocusFirstField =
    typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches;

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [view, setView] = useState<FormView>('form');
  const [formError, setFormError] = useState<FormNotice | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingConfirmationAgain, setSendingConfirmationAgain] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Android hardware back from "forgot password" / "check your email" returns to sign-in
  // (registered after the sheet's own handler, so it is the one that runs first).
  useBackClose(view !== 'form', () => {
    setView('form');
    setErrors({});
    setFormError(null);
    setNotice(null);
  }, { escape: false });

  // Move focus to the new heading when the view changes, so keyboard and
  // screen-reader users land at the top of the new state.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [view]);

  const focusField = (id: string) => {
    window.setTimeout(() => document.getElementById(id)?.focus(), 0);
  };

  const isLikelyNetworkAuthError = (message: string) => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('failed to fetch') ||
      normalized.includes('networkerror') ||
      normalized.includes('network') ||
      normalized.includes('timeout') ||
      normalized.includes('unable to connect') ||
      normalized.includes('tls error') ||
      normalized.includes('secure connection')
    );
  };

  const preflightAuthEndpoint = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        method: 'GET',
        headers: {
          apikey: (import.meta as ImportMeta).env?.VITE_SUPABASE_ANON_KEY || '',
        },
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  };

  const hasNetworkConnectivity = async () => {
    // navigator.onLine can be unreliable in iOS simulator/webview.
    // If it reports offline, verify with a quick real network probe.
    if (navigator.onLine) {
      return true;
    }

    return await preflightAuthEndpoint();
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    const email = formData.email.trim();

    // Email validation - accepts any valid email with a domain (e.g., user@gmail.com, user@company.co.uk)
    // Domain must have at least 2 characters after the last dot
    if (!email) {
      newErrors.email = t('auth.errors.emailRequired');
    } else if (!EMAIL_REGEX.test(email)) {
      newErrors.email = t('auth.errors.invalidEmail');
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = t('auth.errors.passwordRequired');
    } else if (formData.password.length < 6) {
      newErrors.password = t('auth.errors.passwordTooShort');
    }

    setErrors(newErrors);
    // Put the cursor on the first field that needs attention.
    const firstInvalid = (['email', 'password'] as const).find((k) => newErrors[k]);
    if (firstInvalid) focusField(`auth-${firstInvalid}`);
    return Object.keys(newErrors).length === 0;
  };

  // Check if user has a profile in the database
  // DO NOT create profile automatically - profiles are only created when:
  // 1. User completes registration form (email/password)
  // 2. User completes profile completion page (after OAuth)
  const handleForgotPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    const email = formData.email.trim();

    if (!email) {
      setErrors({ email: t('auth.errors.emailRequired') });
      focusField('auth-email');
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      setErrors({ email: t('auth.errors.invalidEmail') });
      focusField('auth-email');
      return;
    }

    setLoading(true);

    try {
      // Check whether this email belongs to a Google/Apple account before
      // sending a reset email that account has no password to reset. Fails
      // open on any error (network hiccup, function down) - worst case is
      // the old behavior of just sending the reset email regardless.
      try {
        const { data: providerCheck } = await supabase.functions.invoke('check-auth-provider', {
          body: { email },
        });
        const providers: string[] = providerCheck?.providers || [];
        const hasPassword = providers.includes('email');

        if (!hasPassword && providers.includes('google')) {
          setFormError({ message: t('auth.usesGoogle') });
          setLoading(false);
          return;
        }

        if (!hasPassword && providers.includes('apple')) {
          setFormError({ message: t('auth.usesApple') });
          setLoading(false);
          return;
        }
      } catch (providerCheckError) {
        console.error('check-auth-provider error (continuing with password reset):', providerCheckError);
      }

      const redirectUri = getPasswordResetRedirectUri();

      // Double-check the URI before sending: on localhost always send the user
      // back to the origin they're actually on.
      const redirectTo =
        window.location.hostname === 'localhost' && !redirectUri.includes('localhost')
          ? `${window.location.origin}/reset-password`
          : redirectUri;

      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      if (error) {
        console.error('Password reset error:', error);
        // Rate-limit messages ("try again in 60 seconds") are useful as-is; anything else stays generic.
        const isRateLimited = (error as { status?: number }).status === 429;
        setFormError({ message: isRateLimited ? error.message : t('auth.unexpectedError') });
        setLoading(false);
        return;
      }

      setView('resetSent');
      setLoading(false);
    } catch (error: unknown) {
      console.error('Password reset error:', error);
      setFormError({ message: t('auth.unexpectedError') });
      setLoading(false);
    }
  };

  const sendConfirmationEmailAgain = async (email: string) => {
    setSendingConfirmationAgain(true);
    try {
      const emailConfirmRedirectUri = getEmailConfirmRedirectUri();

      const authApi = supabase.auth as unknown as Record<string, (payload: unknown) => Promise<{ error: Error | null }>>;
      const sendAgain = authApi['re' + 'send'];
      // Must be called bound to the auth client: taking the method off the object
      // loses `this`, which made every resend attempt throw.
      const { error } = await sendAgain.call(supabase.auth, {
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: emailConfirmRedirectUri
        }
      });

      if (error) {
        throw error;
      }

      setFormError(null);
      setNotice(t('auth.confirmationSent'));
    } catch (error: unknown) {
      console.error('[Confirmation Email] Error:', error);
      setNotice(null);
      setFormError({ message: t('auth.unexpectedError') });
    } finally {
      setSendingConfirmationAgain(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });

    // Clear stale messages as soon as the user starts correcting things
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: ''
      });
    }
    if (formError) setFormError(null);
    if (notice) setNotice(null);
  };

  const showFailure = (message: string, opts?: { action?: 'resend'; clearPassword?: boolean }) => {
    setFormError({ message, action: opts?.action });
    // Keep the email, clear only the password after a failed attempt.
    if (opts?.clearPassword) {
      setFormData((prev) => ({ ...prev, password: '' }));
      focusField('auth-password');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNotice(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    const email = formData.email.trim();
    const { password } = formData;

    try {
      // Check for network connectivity first
      const isReachable = await hasNetworkConnectivity();
      if (!isReachable) {
        showFailure(t('auth.checkConnection'));
        setLoading(false);
        return;
      }

      // iOS simulator/webview can occasionally fail the first TLS handshake.
      // Warm up the auth endpoint first to reduce first-request TLS failures.
      if (isIOS) {
        await preflightAuthEndpoint();
      }

      // Login flow
      let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      // Retry once for transient network/TLS failures (mostly seen on iOS simulator).
      if (authError && isLikelyNetworkAuthError(authError.message)) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const retry = await supabase.auth.signInWithPassword({ email, password });
        authData = retry.data;
        authError = retry.error;
      }

      if (authError) {
        // Check for network-related errors
        if (isLikelyNetworkAuthError(authError.message)) {
          showFailure(t('auth.checkConnection'));
          setLoading(false);
          return;
        }

        // Check for specific email confirmation error
        if (authError.message.includes('Email not confirmed') ||
            authError.message.includes('email must be confirmed') ||
            authError.message.includes('email address not confirmed')) {
          showFailure(t('auth.emailNotConfirmed'), { action: 'resend' });
        } else if (authError.message.toLowerCase().includes('invalid login credentials')) {
          // One neutral message for wrong email OR wrong password (no account enumeration).
          showFailure(t('auth.invalidCredentials'), { clearPassword: true });
        } else {
          showFailure(t('auth.unexpectedError'), { clearPassword: true });
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        showFailure(t('auth.unexpectedError'));
        setLoading(false);
        return;
      }

      // Post-login profile checks are handled by the main app routing (Index.tsx).
      // Doing a blocking profile query here can fail transiently (native storage/session
      // hydration, network hiccups) and incorrectly force a logout.
      //
      // We only do a best-effort status check here; failures should not block login.
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, account_status')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (!profileError && profile) {
          if (profile.account_status === 'blocked') {
            await supabase.auth.signOut();
            showFailure(t('auth.accountBlockedDesc'), { clearPassword: true });
            setLoading(false);
            return;
          }

          if (profile.account_status === 'on_hold') {
            await supabase.auth.signOut();
            showFailure(t('auth.accountOnHoldDesc'), { clearPassword: true });
            setLoading(false);
            return;
          }

          // Save profile ID to session for downstream pages that use it.
          try {
            sessionStorage.setItem('profile_id', profile.id);
          } catch {}
        }
      } catch {}

      // Best-effort: persist language preference; ignore failures.
      try {
        await saveLanguageToProfile(authData.user.id);
      } catch {}

      // Always redirect to home page and let the main app handle routing
      // The auth state change will trigger the proper view (admin/app)
      navigate('/');


      setLoading(false);
    } catch (error: unknown) {
      console.error('Auth error:', error);

      // Check for network errors in catch block
      const errorMessage = (error as { message?: string })?.message?.toLowerCase() || '';
      const appearsOffline = !navigator.onLine && !(await preflightAuthEndpoint());
      if (appearsOffline ||
          errorMessage.includes('fetch') ||
          errorMessage.includes('network') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('connection')) {
        showFailure(t('auth.checkConnection'));
      } else {
        showFailure(t('auth.unexpectedError'));
      }
      setLoading(false);
    }
  };

  const switchView = (next: FormView) => {
    setView(next);
    setErrors({});
    setFormError(null);
    setNotice(null);
  };

  const heading = (text: string) => (
    <h2
      ref={headingRef}
      tabIndex={-1}
      className="dl-auth-heading text-[26px] font-bold leading-tight tracking-tight text-white outline-none"
    >
      {text}
    </h2>
  );

  // One inline message area, announced to assistive tech.
  const messages = (
    <>
      {formError && (
        <div
          role="alert"
          className="dl-auth-notice flex items-start gap-2.5 rounded-xl border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-sm text-red-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p>{formError.message}</p>
            {formError.action === 'resend' && (
              <button
                type="button"
                onClick={() => sendConfirmationEmailAgain(formData.email.trim())}
                disabled={sendingConfirmationAgain}
                className="mt-1 min-h-9 font-semibold text-white underline underline-offset-4 disabled:opacity-60"
              >
                {t('auth.resendConfirmation')}
              </button>
            )}
          </div>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="dl-auth-notice flex items-start gap-2.5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-200"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{notice}</p>
        </div>
      )}
    </>
  );

  const emailField = (autoComplete: string, enterKeyHint: 'next' | 'go' | 'send') => (
    <div>
      <Label htmlFor="auth-email" className={labelClass}>{t('auth.email')}</Label>
      <Input
        id="auth-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint={enterKeyHint}
        autoFocus={autoFocusFirstField}
        value={formData.email}
        onChange={handleInputChange}
        placeholder="name@domain.com"
        aria-invalid={errors.email ? true : undefined}
        aria-describedby={errors.email ? 'auth-email-error' : undefined}
        className={`${fieldClass} ${errors.email ? fieldErrorClass : ''}`}
      />
      {errors.email && <p id="auth-email-error" className={errorTextClass}>{errors.email}</p>}
    </div>
  );

  // ---- Check-your-email confirmation (after "forgot password") ----
  if (view === 'resetSent') {
    return (
      <div className="pb-2 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-pink-500/15">
          <CheckCircle2 className="h-7 w-7 text-pink-400" aria-hidden="true" />
        </span>
        {heading(t('auth.resetSentTitle'))}
        <p className="mx-auto mt-2 max-w-xs text-sm text-white/60">
          {t('auth.resetSentBody', { email: formData.email.trim() })}
        </p>
        <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => switchView('form')}>
          {t('auth.backToSignIn')}
        </Button>
      </div>
    );
  }

  // ---- Forgot password: one field, one button ----
  if (view === 'forgot') {
    return (
      <div className="pb-2">
        {heading(t('auth.resetPassword'))}
        <p className="mt-1.5 text-sm text-white/60">{t('auth.enterEmailForReset')}</p>

        <form onSubmit={handleForgotPassword} noValidate className="dl-auth-form mt-6 space-y-4">
          {emailField('email', 'send')}
          {messages}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            {loading ? t('auth.sendingResetEmail') : t('auth.sendResetEmail')}
          </Button>
        </form>

        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => switchView('form')}
            className="min-h-11 px-3 text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline"
          >
            {t('auth.backToSignIn')}
          </button>
        </div>
      </div>
    );
  }

  // ---- Sign in ----
  return (
    <div className="pb-2">
      {heading(t('auth.welcomeBack'))}

      <form onSubmit={handleSubmit} noValidate className="dl-auth-form mt-6 space-y-4">
        {emailField('username', 'next')}

        <div>
          <Label htmlFor="auth-password" className={labelClass}>{t('auth.password')}</Label>
          <div className="relative">
            <Input
              id="auth-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              value={formData.password}
              onChange={handleInputChange}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'auth-password-error' : undefined}
              className={`${fieldClass} pr-12 ${errors.password ? fieldErrorClass : ''}`}
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
          {errors.password && <p id="auth-password-error" className={errorTextClass}>{errors.password}</p>}
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => switchView('forgot')}
              className="dl-auth-forgot -mr-2 min-h-10 px-2 text-sm font-medium text-white/65 underline-offset-4 hover:text-white hover:underline"
            >
              {t('auth.forgotPassword')}
            </button>
          </div>
        </div>

        {messages}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          {loading ? t('auth.processing') : t('auth.signIn')}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-white/60">
        {t('auth.dontHaveAccount')}
        <button
          type="button"
          onClick={onToggle}
          className="ml-1.5 min-h-11 px-1 font-semibold text-white underline-offset-4 hover:underline"
        >
          {t('auth.signUp')}
        </button>
      </p>
    </div>
  );
};

export default AuthForm;


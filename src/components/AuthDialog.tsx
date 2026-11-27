import React, { Suspense, lazy } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/icon-button';
import { useBackClose } from '@/utils/backStack';
import './auth/auth.css';

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
  /** "Sign Up" inside the sheet: the host closes it and shows the sign-up flow. */
  onToggle: () => void;
}

/**
 * The email sign-in sheet. A bottom sheet on phones (thumb-reachable, slides up
 * over the Welcome screen) and a centred card on larger screens. Same near-black
 * surface as the sign-up flow so the whole entry reads as one product.
 */
const AuthDialog: React.FC<AuthDialogProps> = ({
  open,
  onOpenChange,
  onToggle,
}) => {
  const { t } = useTranslation();
  // Android hardware back closes the sheet instead of leaving the app (Radix already handles Escape).
  useBackClose(open, () => onOpenChange(false), { escape: false });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dl-auth-overlay fixed inset-0 z-50" />
        <DialogPrimitive.Content
          className="dl-auth-panel rounded-t-sheet border-t border-white/10 bg-[#0B0B0F] text-white shadow-dl-lg sm:rounded-sheet sm:border"
          // On touch devices don't pop the keyboard the instant the sheet opens
          // (it would cover half the sheet mid-animation); the field is one tap away.
          onOpenAutoFocus={(e) => {
            if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
              e.preventDefault();
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {t('auth.signIn')}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t('auth.welcomeBack')}
          </DialogPrimitive.Description>

          {/* Grabber (phones) + close */}
          <div className="dl-auth-top relative flex h-12 items-center justify-center sm:h-4">
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-white/20 sm:hidden" />
            <DialogPrimitive.Close asChild>
              <IconButton
                aria-label={t('common.close', { defaultValue: 'Close' })}
                size="sm"
                className="absolute right-3 top-2 text-white/70 hover:text-white sm:top-3"
              >
                <X />
              </IconButton>
            </DialogPrimitive.Close>
          </div>

          <div className="px-6 pb-1 sm:px-8 sm:pb-2">
            <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
              <AuthForm onToggle={onToggle} />
            </Suspense>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default AuthDialog;

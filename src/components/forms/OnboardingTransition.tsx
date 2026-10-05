import HoppingLogo from '@/components/HoppingLogo';
import { FORM_PAGE_BG } from '@/components/forms/formTheme';

interface OnboardingTransitionProps {
  title?: string;
  subtitle?: string;
}

// The one in-between screen for the sign-up -> terms -> Discover hand-offs.
// Same solid background as the forms and the terms page, so moving between
// them never flashes a different colour. The text fades in after a short
// delay: a fast hand-off just shows the calm background + logo, and the
// message only appears when there's a real wait worth explaining.
const OnboardingTransition = ({ title, subtitle }: OnboardingTransitionProps) => (
  <div
    className="fixed inset-0 z-[10001] flex flex-col items-center justify-center gap-5 px-8 text-center"
    style={{ background: FORM_PAGE_BG }}
    role="status"
    aria-live="polite"
  >
    <HoppingLogo size={64} />
    {title && (
      <div className="dl-fade-in-delayed">
        <p className="text-base font-semibold text-white">{title}</p>
        {subtitle && <p className="mt-1.5 text-sm text-white/55">{subtitle}</p>}
      </div>
    )}
  </div>
);

export default OnboardingTransition;

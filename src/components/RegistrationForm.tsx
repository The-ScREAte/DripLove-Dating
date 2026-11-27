import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

interface RegistrationFormProps {
  onSubmit: (data: unknown) => void;
  onBackToLogin: () => void;
  /** Called with true the moment the account is created (signUp succeeds),
   *  and false right before onSubmit fires. Lets the parent's global
   *  auth-state routing defer to this form instead of racing it away from
   *  the screen while profile data / photos are still being saved. */
  onRegistrationInProgressChange?: (inProgress: boolean) => void;
}

/**
 * Sign-up. The whole flow (steps, validation, photos, face verification, the
 * account/profile save) lives in the shared onboarding wizard, which
 * complete-profile uses too - so both look and behave the same.
 */
const RegistrationForm = ({ onSubmit, onBackToLogin, onRegistrationInProgressChange }: RegistrationFormProps) => (
  <OnboardingWizard
    mode="register"
    onSubmit={onSubmit}
    onBackToLogin={onBackToLogin}
    onRegistrationInProgressChange={onRegistrationInProgressChange}
  />
);

export default RegistrationForm;

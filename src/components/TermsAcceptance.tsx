import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Heart, Shield, Users, MessageCircle, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TermsAcceptanceProps {
  user: any;
  onAccept: () => void;
}

const TermsAcceptance = ({ user, onAccept }: TermsAcceptanceProps) => {
  const { t } = useTranslation();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAccept = async () => {
    if (!termsAccepted) {
      toast({
        title: t('termsAcceptance.mustAccept'),
        description: t('termsAcceptance.subtitle'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Update user profile to mark terms as accepted
      const { error } = await supabase
        .from('profiles')
        .update({
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        throw error;
      }

      toast({
        title: t('termsAcceptance.termsAccepted'),
        description: t('termsAcceptance.thankYou'),
      });

      onAccept();
    } catch (error: any) {
      console.error('Terms acceptance error:', error);
      toast({
        title: t('termsAcceptance.error'),
        description: t('termsAcceptance.failedToSave'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
  <div className="terms-container min-h-fill bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4 flex items-center justify-center">
      <Card className="w-full max-w-4xl mx-auto backdrop-blur-sm bg-white/95 shadow-2xl border-0">
        <CardHeader className="text-center pb-6">
          <CardTitle className="text-3xl font-bold text-center text-gray-800 mb-2">
            {t('termsAcceptance.cardTitle')}
          </CardTitle>
          <CardDescription className="text-gray-600 text-lg">
            {t('termsAcceptance.cardDescription')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Terms and Conditions Content */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 max-h-96 overflow-y-auto">
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              {t('termsAcceptance.termsOfService')}
            </h3>
            
            <div className="space-y-4 text-sm text-gray-600">
              <section>
                <h4 className="font-semibold text-gray-800 mb-2">1. Acceptance of Terms</h4>
                <p>
                  By creating an account and using DripLove, you agree to comply with and be bound by these Terms and Conditions. 
                  If you do not agree with any part of these terms, you may not use our service.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-800 mb-2">2. User Conduct and Responsibilities</h4>
                <p>You agree to:</p>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                  <li>Provide accurate and truthful information in your profile</li>
                  <li>Treat other users with respect and kindness</li>
                  <li>Not engage in harassment, bullying, or discriminatory behavior</li>
                  <li>Not share inappropriate, offensive, or explicit content</li>
                  <li>Not create fake accounts or impersonate others</li>
                  <li>Report any suspicious or inappropriate behavior</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-gray-800 mb-2">3. Privacy and Data Protection</h4>
                <p>
                  Your privacy is important to us. We collect and use your personal information in accordance with our Privacy Policy. 
                  By using DripLove, you consent to the collection and use of your information as described in our Privacy Policy.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-800 mb-2">4. Safety and Security</h4>
                <p>
                  DripLove implements various safety measures to protect our users. However, you are responsible for your own safety when 
                  interacting with other users. We recommend:
                </p>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                  <li>Meeting in public places for first dates</li>
                  <li>Informing friends or family about your plans</li>
                  <li>Trusting your instincts and reporting concerning behavior</li>
                  <li>Never sharing personal financial information</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-gray-800 mb-2">5. Prohibited Activities</h4>
                <p>The following activities are strictly prohibited:</p>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                  <li>Soliciting money or engaging in commercial activities</li>
                  <li>Sharing or requesting explicit content</li>
                  <li>Spamming or sending unsolicited messages</li>
                  <li>Using automated tools or bots</li>
                  <li>Attempting to hack or manipulate the platform</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-gray-800 mb-2">6. Account Termination</h4>
                <p>
                  DripLove reserves the right to suspend or terminate accounts that violate these terms or engage in inappropriate behavior. 
                  Users may also delete their accounts at any time through their profile settings.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-800 mb-2">7. Intellectual Property</h4>
                <p>
                  All content and materials on DripLove, including logos, designs, and software, are owned by DripLove and protected by 
                  intellectual property laws. Users retain ownership of their uploaded content but grant DripLove a license to use it 
                  within the platform.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-800 mb-2">8. Limitation of Liability</h4>
                <p>
                  DripLove provides the service "as is" and cannot guarantee specific outcomes from using the platform. We are not liable 
                  for any direct, indirect, or consequential damages arising from your use of the service.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-800 mb-2">9. Changes to Terms</h4>
                <p>
                  DripLove may update these terms from time to time. Users will be notified of significant changes, and continued use of 
                  the service constitutes acceptance of the updated terms.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-800 mb-2">10. Contact Information</h4>
                <p>
                  For questions about these terms or to report issues, please contact us at support@driplove.com or through our 
                  in-app support feature.
                </p>
              </section>
            </div>
          </div>

          {/* Acceptance Checkbox */}
          <div className="bg-gray-50 rounded-lg p-4 border-2 border-dashed border-gray-300">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms-acceptance"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                className="mt-1"
              />
              <label
                htmlFor="terms-acceptance"
                className="text-sm text-gray-700 cursor-pointer leading-relaxed"
              >
                {t('termsAcceptance.agreementText')}
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleAccept}
              disabled={loading || !termsAccepted}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('termsAcceptance.processing') : t('termsAcceptance.accept')}
            </Button>
            
            <p className="text-xs text-gray-500 text-center">
              {t('termsAcceptance.acknowledgment')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TermsAcceptance;

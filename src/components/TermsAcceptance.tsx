import React, { useState } from 'react';
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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAccept = async () => {
    if (!termsAccepted) {
      toast({
        title: "Agreement Required",
        description: "Please read and accept the terms and conditions to continue.",
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
        title: "Welcome to DripLove!",
        description: "Thank you for accepting our terms. You can now start connecting with amazing people!",
      });

      onAccept();
    } catch (error: any) {
      console.error('Terms acceptance error:', error);
      toast({
        title: "Error",
        description: "Failed to save your agreement. Please try again.",
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
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full">
              <Heart className="w-10 h-10 text-white" />
            </div>
          </div>
                    <CardTitle className="text-3xl font-bold text-center text-purple-700 mb-2">
            Welcome to DripLove!
          </CardTitle>
          <CardDescription className="text-gray-600 text-lg">
            Before you begin your journey, please review and accept our terms and conditions
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* App Features Highlight */}
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <Star className="w-5 h-5 mr-2 text-pink-500" />
              What awaits you on DripLove
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-3">
                <Users className="w-6 h-6 text-purple-500" />
                <span className="text-sm text-gray-700">Connect with amazing people</span>
              </div>
              <div className="flex items-center space-x-3">
                <MessageCircle className="w-6 h-6 text-pink-500" />
                <span className="text-sm text-gray-700">Chat and build connections</span>
              </div>
              <div className="flex items-center space-x-3">
                <Shield className="w-6 h-6 text-indigo-500" />
                <span className="text-sm text-gray-700">Safe and secure platform</span>
              </div>
            </div>
          </div>

          {/* Terms and Conditions Content */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 max-h-96 overflow-y-auto">
                        <h3 className="text-xl font-semibold text-purple-700 mb-3">
              What awaits you on DripLove
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
                I have read and understand the Terms and Conditions above. I agree to comply with all terms and acknowledge that 
                violation of these terms may result in account suspension or termination. I am at least 18 years old and legally 
                able to enter into this agreement.
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleAccept}
              disabled={loading || !termsAccepted}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Accept Terms & Continue to DripLove'}
            </Button>
            
            <p className="text-xs text-gray-500 text-center">
              By clicking "Accept Terms & Continue", you acknowledge that you have read, understood, and agree to be bound by these terms and conditions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TermsAcceptance;

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Heart, Shield, Users, FileText, ExternalLink } from 'lucide-react';
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
    <div className="terms-container min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 p-4 flex items-center justify-center">
      <Card className="w-full max-w-2xl mx-auto bg-white shadow-xl border-0 rounded-2xl">
        <CardHeader className="text-center pb-4 pt-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full flex items-center justify-center mb-4">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-800 mb-2">
            Welcome to DripLove! 💕
          </CardTitle>
          <CardDescription className="text-gray-600">
            Before we start, let's keep things safe and fun for everyone
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-6 pb-8">
          {/* Key Points */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-pink-50 rounded-xl">
              <div className="w-8 h-8 bg-pink-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Heart className="w-4 h-4 text-pink-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 text-sm">Be Respectful</h4>
                <p className="text-xs text-gray-600 mt-1">Treat everyone with kindness and respect</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-xl">
              <div className="w-8 h-8 bg-purple-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 text-sm">Stay Safe</h4>
                <p className="text-xs text-gray-600 mt-1">Meet in public places and protect your privacy</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl">
              <div className="w-8 h-8 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 text-sm">Be Authentic</h4>
                <p className="text-xs text-gray-600 mt-1">Use real photos and honest information</p>
              </div>
            </div>
          </div>

          {/* Document Links */}
          <div className="flex gap-2 justify-center flex-wrap">
            <a
              href="/terms-of-service"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-pink-100 hover:bg-pink-200 text-pink-700 rounded-full text-sm font-medium transition-colors border border-pink-200"
            >
              <FileText className="w-4 h-4" />
              Terms of Service
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-full text-sm font-medium transition-colors border border-purple-200"
            >
              <Shield className="w-4 h-4" />
              Privacy Policy
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Acceptance Checkbox */}
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl p-4 border border-pink-200">
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
                I agree to the Terms of Service and Privacy Policy, and I'm 18 years or older
              </label>
            </div>
          </div>

          {/* Action Button */}
          <Button
            onClick={handleAccept}
            disabled={loading || !termsAccepted}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? "Processing..." : "Let's Go! 🚀"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default TermsAcceptance;

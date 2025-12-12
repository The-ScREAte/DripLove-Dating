import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Heart, Shield, Users, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import TermsOfService from './TermsOfService';
import PrivacyPolicy from './PrivacyPolicy';

interface TermsAcceptanceProps {
  user: any;
  onAccept: () => void;
}

const TermsAcceptance = ({ user, onAccept }: TermsAcceptanceProps) => {
  const { t } = useTranslation();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
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
    <div className="terms-container min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 p-3 flex items-center justify-center">
      <Card className="w-full max-w-md mx-auto bg-white shadow-xl border-0 rounded-xl">
        <CardHeader className="text-center pb-2 pt-4">
          <div className="mx-auto w-12 h-12 mb-2">
            <img 
              src="/driplove-logo.webp"
              loading="lazy"
              decoding="async" 
              alt="DripLove" 
              className="w-full h-full object-contain"
            />
          </div>
          <CardTitle className="text-base font-bold text-gray-900 mb-0.5">
            Welcome to DripLove! 💕
          </CardTitle>
          <CardDescription className="text-xs text-gray-700">
            Let's keep things safe and fun for everyone
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-2.5 px-4 pb-4">
          {/* Key Points */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 p-1.5 bg-pink-50 rounded-lg">
              <div className="w-5 h-5 bg-pink-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Heart className="w-2.5 h-2.5 text-pink-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 text-xs">Be Respectful</h4>
                <p className="text-[10px] text-gray-600">Treat everyone with kindness</p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-1.5 bg-purple-50 rounded-lg">
              <div className="w-5 h-5 bg-purple-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Shield className="w-2.5 h-2.5 text-purple-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 text-xs">Stay Safe</h4>
                <p className="text-[10px] text-gray-600">Meet in public, protect your privacy</p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-1.5 bg-blue-50 rounded-lg">
              <div className="w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Users className="w-2.5 h-2.5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 text-xs">Be Authentic</h4>
                <p className="text-[10px] text-gray-600">Use real photos and honest info</p>
              </div>
            </div>
          </div>

          {/* Document Links */}
          <div className="flex gap-1.5 justify-center flex-wrap">
            <button
              onClick={() => setShowTerms(true)}
              className="inline-flex items-center gap-1 px-2 py-1 bg-pink-100 hover:bg-pink-200 text-pink-700 rounded-full text-[10px] font-medium transition-colors border border-pink-200"
            >
              <FileText className="w-2.5 h-2.5" />
              Terms
              <ExternalLink className="w-2 h-2" />
            </button>
            <button
              onClick={() => setShowPrivacy(true)}
              className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-full text-[10px] font-medium transition-colors border border-purple-200"
            >
              <Shield className="w-2.5 h-2.5" />
              Privacy
              <ExternalLink className="w-2 h-2" />
            </button>
          </div>

          {/* Acceptance Checkbox */}
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-2 border border-pink-200">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="terms-acceptance"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                className="mt-0.5 rounded-full h-3.5 w-3.5"
              />
              <label
                htmlFor="terms-acceptance"
                className="text-xs text-gray-900 cursor-pointer leading-tight"
              >
                I agree to the Terms & Privacy Policy, and I'm 18+
              </label>
            </div>
          </div>

          {/* Action Button */}
          <Button
            onClick={handleAccept}
            disabled={loading || !termsAccepted}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold py-2 text-sm rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {loading ? "Processing..." : "Let's Go! 🚀"}
          </Button>
        </CardContent>
      </Card>

      {/* Terms of Service Dialog */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogTitle className="sr-only">Terms of Service</DialogTitle>
          <ScrollArea className="h-[80vh] pr-4">
            <div className="pb-6">
              <TermsOfService onBack={() => setShowTerms(false)} />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy Dialog */}
      <Dialog open={showPrivacy} onOpenChange={setShowPrivacy}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogTitle className="sr-only">Privacy Policy</DialogTitle>
          <ScrollArea className="h-[80vh] pr-4">
            <div className="pb-6">
              <PrivacyPolicy onBack={() => setShowPrivacy(false)} />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TermsAcceptance;

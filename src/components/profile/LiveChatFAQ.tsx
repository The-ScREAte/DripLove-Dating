import React, { useState } from 'react';
import { MessageCircle, X, ChevronRight, ArrowLeft, User, CreditCard, Globe, Settings, Shield, Heart, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { useEnhancedSubscription } from '@/hooks/useEnhancedSubscription';

interface FAQItem {
  id: string;
  question: string;
  answer: string | ((pricing: any, isPremium: boolean) => string);
  icon: React.ReactNode;
  category: 'profile' | 'subscription' | 'features' | 'account';
}

const faqItems: FAQItem[] = [
  // Profile
  {
    id: 'edit-profile',
    question: 'How do I edit my profile?',
    answer: 'Edit your profile with accurate information so others know who they\'re chatting with.\n\nGo to Profile → Tap Edit at the top → Scroll down and open each tab (Photos, Bio, Interests, Preferences, Personal Info) → Make your changes → Save.\n\nIf changes don\'t appear immediately, close the app completely and reopen it.',
    icon: <User className="w-4 h-4" />,
    category: 'profile',
  },
  {
    id: 'change-photos',
    question: 'How do I change my photos?',
    answer: 'Go to your profile and tap Edit. Tap on any photo slot to add, replace, or remove photos. Your first photo is your main profile picture. Use clear, recent photos that accurately represent you.',
    icon: <User className="w-4 h-4" />,
    category: 'profile',
  },
  
  // Subscription & Pricing
  {
    id: 'premium-cost',
    question: 'How much is Premium?',
    answer: (pricing, isPremium) => isPremium 
      ? 'You already have Premium! Enjoy unlimited swipes, see who likes you, and more.'
      : `Premium is ${pricing.displayPrice}. Unlock unlimited swipes, see who likes you, and more exclusive features.`,
    icon: <Crown className="w-4 h-4" />,
    category: 'subscription',
  },
  {
    id: 'premium-features',
    question: 'What does Premium include?',
    answer: 'Premium includes: Unlimited daily swipes, See everyone who liked you, Unlimited reverse dislikes (undo passes), Priority in discover feed, Access to explore all countries, Ad-free experience, and Priority support. After subscribing, close the app completely and reopen it if changes don\'t appear immediately.',
    icon: <Crown className="w-4 h-4" />,
    category: 'subscription',
  },
  {
    id: 'payment-error',
    question: 'I have a payment error. What should I do?',
    answer: 'Contact us at driploveinfo@gmail.com. Include your registered email, a screenshot of the error, payment method used, and transaction details if available. We respond within 24 hours and guarantee your issue will be resolved.',
    icon: <CreditCard className="w-4 h-4" />,
    category: 'subscription',
  },
  {
    id: 'cancel-subscription',
    question: 'How do I cancel my subscription?',
    answer: 'Go to Profile → Account Actions → Cancel Subscription. Your premium features will remain active until the end of your billing period.',
    icon: <CreditCard className="w-4 h-4" />,
    category: 'subscription',
  },
  
  // Features
  {
    id: 'more-countries',
    question: 'How do I explore more countries?',
    answer: (pricing, isPremium) => isPremium
      ? 'As a Premium member, go to Profile → Preference → Edit. You can select up to 3 additional countries in addition to your own country (4 total).'
      : `Upgrade to Premium (${pricing.displayPrice}) to unlock access to all countries. Free users can only match within their registered country.`,
    icon: <Globe className="w-4 h-4" />,
    category: 'features',
  },
  {
    id: 'see-likes',
    question: 'Who liked me?',
    answer: (pricing, isPremium) => isPremium
      ? 'Access the Likes tab from the bottom navigation to see all users who have liked your profile with full details.'
      : `Free users can see the location of people who liked you, but full profile access requires Premium membership (${pricing.displayPrice}). Upgrade to unlock complete visibility of everyone who likes you.`,
    icon: <Heart className="w-4 h-4" />,
    category: 'features',
  },
  {
    id: 'daily-swipes',
    question: 'How many swipes do I get?',
    answer: (pricing, isPremium) => isPremium
      ? 'As a Premium member, you have unlimited swipes every day!'
      : `Free users get 20 swipes per day that reset at midnight. Upgrade to Premium (${pricing.displayPrice}) for unlimited swipes.`,
    icon: <Heart className="w-4 h-4" />,
    category: 'features',
  },
  {
    id: 'report-user',
    question: 'How do I report someone?',
    answer: 'If you encounter inconvenient or unsafe behavior, go to their profile and tap the Report button. You can also block users directly and report chats. We investigate all reports and will remove users from DripLove if necessary. DripLove has a large pool of people - you will always find new matches.',
    icon: <Shield className="w-4 h-4" />,
    category: 'features',
  },
  
  // Account
  {
    id: 'change-password',
    question: 'How do I change my password?',
    answer: 'If you signed up with email, go to Profile → Account Settings. For Google or Apple sign-in users, password is managed through those services.',
    icon: <Shield className="w-4 h-4" />,
    category: 'account',
  },
  {
    id: 'delete-account',
    question: 'How do I delete my account?',
    answer: 'Go to Profile → Account Actions → Delete Account. You will need to verify your identity. This action is permanent and removes all your data.',
    icon: <Settings className="w-4 h-4" />,
    category: 'account',
  },
  {
    id: 'advertising',
    question: 'How can I advertise on DripLove?',
    answer: 'We provide advertising opportunities for companies and individuals with location-based targeting. Contact us at driploveinfo@gmail.com for detailed information about advertising packages and pricing.',
    icon: <MessageCircle className="w-4 h-4" />,
    category: 'account',
  },
  {
    id: 'contact-support',
    question: 'How do I contact support?',
    answer: 'Email us at driploveinfo@gmail.com. We respond within 24 hours and guarantee your issue will be resolved. Include your registered email for faster assistance.',
    icon: <MessageCircle className="w-4 h-4" />,
    category: 'account',
  },
];

const categories = [
  { id: 'all', label: 'All Questions', icon: <MessageCircle className="w-4 h-4" /> },
  { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
  { id: 'subscription', label: 'Pricing & Plans', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'features', label: 'Features', icon: <Heart className="w-4 h-4" /> },
  { id: 'account', label: 'Account', icon: <Settings className="w-4 h-4" /> },
];

const LiveChatFAQ: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFAQ, setSelectedFAQ] = useState<FAQItem | null>(null);
  const pricing = usePricingConfig(); // No userId needed for FAQ - uses cached/default
  const { isPremium } = useEnhancedSubscription();

  const filteredFAQs = selectedCategory === 'all' 
    ? faqItems 
    : faqItems.filter(item => item.category === selectedCategory);

  const getAnswer = (item: FAQItem) => {
    if (typeof item.answer === 'function') {
      return item.answer(pricing, isPremium);
    }
    return item.answer;
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedFAQ(null);
    setSelectedCategory('all');
  };

  const handleBack = () => {
    if (selectedFAQ) {
      setSelectedFAQ(null);
    } else {
      setSelectedCategory('all');
    }
  };

  return (
    <>
      {/* Chat Button */}
      <div className="bg-black p-4 rounded-lg border border-pink-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-semibold text-white">Need Help?</h4>
              <p className="text-sm text-white/60">Get instant answers</p>
            </div>
          </div>
          <Button 
            onClick={() => setIsOpen(true)}
            className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          >
            Chat Now
          </Button>
        </div>
      </div>

      {/* Chat Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-black border border-pink-500/30 w-full sm:w-96 h-[80vh] sm:h-[600px] sm:rounded-2xl rounded-t-2xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-pink-500 to-purple-500 p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {(selectedFAQ || selectedCategory !== 'all') && (
                  <button onClick={handleBack} className="text-white/80 hover:text-white">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div>
                  <h3 className="text-white font-semibold">
                    {selectedFAQ ? 'Answer' : selectedCategory !== 'all' ? categories.find(c => c.id === selectedCategory)?.label : 'Help Center'}
                  </h3>
                  <p className="text-white/80 text-sm">
                    {selectedFAQ ? 'Here to help' : 'Find answers instantly'}
                  </p>
                </div>
              </div>
              <button onClick={handleClose} className="text-white/80 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedFAQ ? (
                // Answer View
                <div className="space-y-4">
                  <div className="bg-neutral-900 border border-pink-500/20 rounded-2xl rounded-tl-sm p-4">
                    <p className="font-medium text-white">{selectedFAQ.question}</p>
                  </div>
                  <div className="bg-gradient-to-r from-pink-500 to-purple-500 rounded-2xl rounded-tr-sm p-4 text-white ml-8">
                    <p className="leading-relaxed">{getAnswer(selectedFAQ)}</p>
                  </div>

                  {/* Quick Actions */}
                  <div className="pt-4 space-y-2">
                    <p className="text-sm text-white/60 text-center">Was this helpful?</p>
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedFAQ(null)}
                        className="text-pink-400 border-pink-500/30 hover:bg-pink-500/10"
                      >
                        Ask another question
                      </Button>
                    </div>
                  </div>
                </div>
              ) : selectedCategory === 'all' ? (
                // Category Selection
                <div className="space-y-2">
                  <p className="text-sm text-white/60 mb-4">What can I help you with today?</p>
                  {categories.filter(c => c.id !== 'all').map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className="w-full flex items-center justify-between p-4 bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors border border-pink-500/10"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center text-pink-400">
                          {category.icon}
                        </div>
                        <span className="font-medium text-white">{category.label}</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/40" />
                    </button>
                  ))}
                </div>
              ) : (
                // FAQ List
                <div className="space-y-2">
                  {filteredFAQs.map((faq) => (
                    <button
                      key={faq.id}
                      onClick={() => setSelectedFAQ(faq)}
                      className="w-full flex items-center justify-between p-4 bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors text-left border border-pink-500/10"
                    >
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="w-8 h-8 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center text-pink-400 flex-shrink-0">
                          {faq.icon}
                        </div>
                        <span className="text-white text-sm">{faq.question}</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/40 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-pink-500/20 p-4">
              <p className="text-xs text-white/60 text-center">
                Still need help? Email us at{' '}
                <a href="mailto:driploveinfo@gmail.com" className="text-pink-600 font-medium">
                  driploveinfo@gmail.com
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LiveChatFAQ;

import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Send, X, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface LiveChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LiveChat: React.FC<LiveChatProps> = ({ open, onOpenChange }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm here to help you with any questions about DripLove. How can I assist you today?",
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const quickReplies = [
    { text: "Premium Features", value: "premium" },
    { text: "Edit Profile", value: "edit" },
    { text: "Who Liked Me", value: "likes" },
    { text: "Payment Issues", value: "payment-error" },
    { text: "Report User", value: "report" },
    { text: "Advertising", value: "ads" },
  ];

  const getAutoResponse = (userMessage: string): string => {
    const msg = userMessage.toLowerCase();

    // Speak to agent/person
    if (msg.includes('agent') || msg.includes('speak to') || msg.includes('talk to') || 
        msg.includes('real person') || msg.includes('human') || msg.includes('representative') || 
        msg.includes('live person') || msg.includes('actual person')) {
      return "SPEAK TO SUPPORT\n\nI'd be happy to connect you with our support team.\n\nContact: driploveinfo@gmail.com\nResponse time: Within 24 hours\n\nPlease include:\n• Your registered email\n• Screenshot (if applicable)\n• Detailed description of your issue\n\nOur team will personally assist you and guarantee your issue will be resolved.\n\nIs there anything I can help you with in the meantime?";
    }

    // Edit profile
    if (msg.includes('edit profile') || msg.includes('update profile') || msg.includes('change profile') || msg.includes('edit') || msg.includes('profile')) {
      return "EDITING YOUR PROFILE\n\nEdit your profile with accurate information so others know who they're chatting with.\n\nSTEPS:\n1. Go to your Profile page\n2. Tap Edit at the top of the page\n3. Scroll down and open each tab:\n   • Photos - Add/update your pictures\n   • Bio - Describe yourself\n   • Interests - Select your hobbies\n   • Preferences - Set your match criteria\n   • Personal Info - Update your details\n4. Make your changes in each section\n5. Save all changes\n\nIMPORTANT:\nIf your profile updates don't appear immediately, close the app completely and reopen it to reflect changes.";
    }

    // Change photos
    if (msg.includes('change photo') || msg.includes('add photo') || msg.includes('replace photo') || msg.includes('remove photo')) {
      return "MANAGING YOUR PHOTOS\n\nTo update your photos:\n\n1. Go to your profile and tap Edit\n2. Tap on any photo slot to add, replace, or remove photos\n3. Your first photo serves as your main profile picture\n\nTip: Use clear, recent photos that accurately represent you for the best results.";
    }

    // Payment error
    if (msg.includes('payment error') || msg.includes('payment fail') || msg.includes('payment issue') || msg.includes('payment problem') || msg.includes('billing error')) {
      return "PAYMENT ISSUES\n\nIf you're experiencing payment errors:\n\nContact: driploveinfo@gmail.com\n\nPlease include:\n• Your registered email\n• Screenshot of the error\n• Payment method used\n• Transaction details (if available)\n\nResponse time: Within 24 hours\n\nWe guarantee your issue will be resolved. Our support team is here to help you.";
    }

    // Premium cost / pricing
    if (msg.includes('price') || msg.includes('cost') || msg.includes('how much') || msg.includes('payment')) {
      return "PREMIUM PRICING\n\nTo view current pricing and plans:\nProfile → Upgrade to Premium\n\nAccepted payment methods:\n• Credit/Debit Cards\n• Apple Pay\n• Google Pay\n\nAll plans include a 7-day money-back guarantee.\n\nFor payment issues, contact driploveinfo@gmail.com";
    }

    // Premium features / what premium includes
    if (msg.includes('premium') || msg.includes('upgrade') || msg.includes('subscription') || msg.includes('what does premium')) {
      return "DRIPLOVE PREMIUM FEATURES\n\n• Unlimited daily swipes\n• See everyone who liked you\n• Unlimited reverse dislikes (undo passes)\n• Priority placement in discover feed\n• Explore matches in all countries\n• Ad-free experience\n• Priority customer support\n\nTo upgrade: Profile → Upgrade to Premium\n\nNote: After subscribing, if changes don't appear immediately, close the app completely and reopen it to activate premium features.";
    }

    // Cancel subscription
    if (msg.includes('cancel') || msg.includes('unsubscribe') || msg.includes('stop subscription')) {
      return "CANCEL SUBSCRIPTION\n\nTo cancel your subscription:\n\n1. Go to Profile → Account Actions\n2. Tap Cancel Subscription\n3. Confirm cancellation\n\nYour premium features will remain active until the end of your current billing period.";
    }

    // Explore more countries
    if (msg.includes('more countries') || msg.includes('other countries') || msg.includes('explore countries') || msg.includes('change country') || msg.includes('location')) {
      return "EXPLORING OTHER COUNTRIES\n\nPREMIUM MEMBERS:\n1. Go to Profile\n2. Scroll to Preference\n3. Tap Edit at the top of the screen\n4. Select your desired countries\n\nYou can select up to 3 additional countries in addition to your own country (4 total).\n\nFREE USERS:\nMatching is limited to your registered country. Upgrade to Premium to access all countries.";
    }

    // See who liked me
    if (msg.includes('who liked') || msg.includes('see likes') || msg.includes('my likes') || msg.includes('who like me')) {
      return "WHO LIKED ME\n\nPREMIUM MEMBERS:\nAccess the Likes tab from the bottom navigation to see all users who have liked your profile with full details.\n\nFREE USERS:\nYou can see the location of people who liked you, but full profile access requires Premium membership.\n\nUpgrade to Premium to unlock complete visibility of everyone who likes you.";
    }

    // Daily swipes
    if (msg.includes('swipe') || msg.includes('daily limit') || msg.includes('how many')) {
      return "DAILY SWIPES\n\nFREE USERS:\n20 swipes per day (resets at midnight)\n\nPREMIUM MEMBERS:\nUnlimited swipes\n\nUpgrade to Premium for unlimited daily swipes and increased matching opportunities.";
    }

    // Reporting users / safety
    if (msg.includes('report') || msg.includes('unsafe') || msg.includes('uncomfortable') || msg.includes('block')) {
      return "REPORTING USERS\n\nIf you encounter inconvenient or unsafe behavior:\n\n1. Go to their profile\n2. Tap the Report button\n3. Select the reason for reporting\n4. Submit your report\n\nYou can also:\n• Block users directly from their profile\n• Report chats that make you uncomfortable\n\nWe investigate all reports and will remove users from DripLove if necessary. Help us make DripLove a safe place for everyone.\n\nRemember: DripLove has a large pool of people. You will always find new matches.";
    }

    // Advertising
    if (msg.includes('advertis') || msg.includes('promote') || msg.includes('business') || msg.includes('marketing')) {
      return "ADVERTISING ON DRIPLOVE\n\nWe provide advertising opportunities for companies and individuals.\n\nBENEFITS:\n• Location-based targeting\n• Reach users in specific regions\n• Customized ad placement\n• Targeted audience demographics\n\nINTERESTED?\nContact us: driploveinfo@gmail.com\n\nOur team will provide you with detailed information about advertising packages and pricing tailored to your needs.";
    }

    // Change password
    if (msg.includes('change password') || msg.includes('reset password') || msg.includes('update password')) {
      return "CHANGING YOUR PASSWORD\n\nEMAIL SIGN-UP USERS:\nGo to Profile → Account Settings\n\nGOOGLE OR APPLE SIGN-IN USERS:\nPassword is managed through your Google or Apple account settings.\n\nTo reset your password, use the 'Forgot Password' option on the login screen.";
    }

    // Delete account
    if (msg.includes('delete account') || msg.includes('remove account') || msg.includes('close account')) {
      return "DELETE ACCOUNT\n\nTo delete your account:\n\n1. Go to Profile → Account Actions\n2. Tap Delete Account\n3. Verify your identity\n\nIMPORTANT: This action is permanent and removes all your data. This cannot be undone.";
    }

    // Features
    if (msg.includes('feature') || msg.includes('can i') || msg.includes('what can')) {
      return "DRIPLOVE FEATURES\n\nFREE ACCOUNT:\n• Create profile with photos\n• Swipe and discover matches (20/day)\n• Chat with matches\n• Video & voice calls\n• Face verification\n• See locations of people who liked you\n\nPREMIUM ACCOUNT:\n• All free features\n• Unlimited swipes\n• See everyone who liked you (full profiles)\n• Explore all countries\n• Reverse dislikes\n• Priority in feed\n• Ad-free experience\n• Priority support";
    }

    // Match/Dating help
    if (msg.includes('match') || msg.includes('no match') || msg.includes('not working') || msg.includes('get more matches')) {
      return "TIPS FOR BETTER MATCHES\n\n• Use clear, recent photos that represent you accurately\n• Write a genuine and unique bio\n• Be active and swipe regularly\n• Send personalized messages\n• Complete all profile sections\n• Keep your profile information up to date\n• Consider Premium for increased visibility\n\nRemember to close and reopen the app if profile updates don't appear immediately.";
    }

    // Safety/Privacy
    if (msg.includes('safe') || msg.includes('privacy') || msg.includes('security')) {
      return "SAFETY & SECURITY\n\n• Face verification is required\n• All data is encrypted\n• Report and block suspicious users\n• Never share personal information prematurely\n• Reports are reviewed within 24 hours\n\nTo report a user: Tap their profile → Report User\n\nHelp us maintain a safe community for everyone.";
    }

    // Account issues / login
    if (msg.includes('account') || msg.includes('login') || msg.includes('password') || msg.includes('forgot')) {
      return "ACCOUNT HELP\n\nFORGOT PASSWORD:\n• Tap 'Forgot Password' on login screen\n• Check your email for reset link\n\nLOGIN ISSUES:\n• Clear app cache\n• Update to latest version\n• Check internet connection\n• Try alternative login method\n• Close and reopen the app\n\nFor further assistance: driploveinfo@gmail.com";
    }

    // Contact support
    if (msg.includes('human') || msg.includes('support') || msg.includes('email') || msg.includes('contact')) {
      return "CONTACT SUPPORT\n\nEmail: driploveinfo@gmail.com\nResponse time: Within 24 hours\n\nPlease include:\n• Your registered email\n• Screenshot (if applicable)\n• Detailed description of the issue\n\nWe guarantee your issue will be resolved. How else can I assist you?";
    }

    // Greetings
    if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
      return "Hello! I can help you with:\n\n• Premium features & pricing\n• Profile editing\n• Country exploration\n• Who liked me\n• Reporting users\n• Payment issues\n• Advertising opportunities\n• Match optimization\n• Safety & privacy\n• Account management\n\nWhat would you like to know?";
    }

    // Thanks
    if (msg.includes('thank') || msg.includes('thanks')) {
      return "You're welcome! Is there anything else I can help you with?";
    }

    // Default response
    return "I can assist you with:\n\n• Premium features & pricing\n• Profile & photo management\n• Country exploration\n• Who liked me (free vs premium)\n• Reporting users & safety\n• Payment issues\n• Advertising opportunities\n• Daily swipe limits\n• Password & account issues\n• Account deletion\n• Match optimization\n• Contact support\n\nPlease select a topic or ask your question.";
  };

  const handleSendMessage = (messageText?: string) => {
    const textToSend = messageText || inputValue.trim();
    if (!textToSend) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      text: textToSend,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    // Simulate typing
    setIsTyping(true);

    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: getAutoResponse(textToSend),
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botResponse]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000); // Random delay 1-2 seconds
  };

  const handleQuickReply = (value: string) => {
    const quickReplyMap: Record<string, string> = {
      premium: "What's Premium?",
      pricing: "How much does it cost?",
      edit: "How do I edit my profile?",
      countries: "How do I explore more countries?",
      likes: "Who liked me?",
      swipes: "How many swipes do I get?",
      "payment-error": "I have a payment error",
      report: "How do I report a user?",
      ads: "Tell me about advertising",
    };

    handleSendMessage(quickReplyMap[value] || value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-t-lg">
          <DialogDescription className="sr-only">
            Chat with support to get help with DripLove features and account management
          </DialogDescription>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-pink-500" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg">Support Chat</DialogTitle>
                <div className="text-xs text-white/90 flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>Online</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-white hover:text-white/80 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  message.sender === 'user'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {message.sender === 'bot' && (
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-3 h-3 text-purple-500" />
                    <span className="text-xs font-semibold text-purple-600">DripBot</span>
                  </div>
                )}
                <div className="text-sm whitespace-pre-line">{message.text}</div>
                <span className="text-xs opacity-70 mt-1 block">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-purple-500" />
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Replies */}
        {messages.length < 4 && (
          <div className="px-4 py-2 bg-white border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-2">Quick replies:</p>
            <div className="flex flex-wrap gap-2">
              {quickReplies.map((reply) => (
                <button
                  key={reply.value}
                  onClick={() => handleQuickReply(reply.value)}
                  className="px-3 py-1.5 text-xs bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors"
                >
                  {reply.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 bg-white border-t border-gray-200 rounded-b-lg">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your message..."
              className="flex-1"
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim()}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LiveChat;

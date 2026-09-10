import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Send, X, Sparkles, Heart, Shield, Crown, HelpCircle, Star } from 'lucide-react';
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
      text: "Hi there! 👋 Welcome to DripLove Support!\n\nI'm DripBot, your personal assistant. I'm here to help you with anything you need - from understanding premium features to troubleshooting issues.\n\nHow can I make your DripLove experience better today?",
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
    { text: "💎 Premium", value: "premium", icon: Crown },
    { text: "✏️ Edit Profile", value: "edit", icon: HelpCircle },
    { text: "❤️ Who Liked Me", value: "likes", icon: Heart },
    { text: "💳 Payment Help", value: "payment-error", icon: HelpCircle },
    { text: "🛡️ Report User", value: "report", icon: Shield },
    { text: "📢 Advertising", value: "ads", icon: Star },
  ];

  const getAutoResponse = (userMessage: string): string => {
    const msg = userMessage.toLowerCase();

    // Speak to agent/person
    if (msg.includes('agent') || msg.includes('speak to') || msg.includes('talk to') || 
        msg.includes('real person') || msg.includes('human') || msg.includes('representative') || 
        msg.includes('live person') || msg.includes('actual person') || msg.includes('customer service')) {
      return "🎧 CONNECT WITH OUR TEAM\n\nI'd be happy to connect you with a real person!\n\n📧 Email: driploveinfo@gmail.com\n⏰ Response: Within 24 hours\n\n📝 Please include:\n• Your registered email address\n• Screenshot (if applicable)\n• Detailed description of your concern\n\nOur dedicated support team personally reviews every message and guarantees a resolution.\n\nIn the meantime, is there anything else I can help you with?";
    }

    // Video/Voice calls
    if (msg.includes('video call') || msg.includes('voice call') || msg.includes('call feature') || msg.includes('video chat')) {
      return "📹 VIDEO & VOICE CALLS\n\nDripLove offers built-in calling features for matched users!\n\n✅ INCLUDED:\n• HD Video calls\n• Crystal-clear voice calls\n• In-app calling (no phone number needed)\n• End-to-end privacy\n\n📱 HOW TO USE:\n1. Open a chat with your match\n2. Tap the video or phone icon at the top\n3. Start your call!\n\n💡 Note: Both users must have matched and can access calls within the chat.";
    }

    // Face verification
    if (msg.includes('face verif') || msg.includes('verify face') || msg.includes('verification') || msg.includes('selfie')) {
      return "🔐 FACE VERIFICATION\n\nFace verification helps keep DripLove safe and authentic!\n\n✅ BENEFITS:\n• Verified badge on your profile\n• Higher trust from potential matches\n• Safer community for everyone\n\n📱 HOW TO VERIFY:\n1. Go to your Profile\n2. Tap the verification option\n3. Take a selfie following the on-screen guide\n4. Our system verifies you instantly\n\n🔒 Your selfie is processed securely and not stored publicly.";
    }

    // Edit profile
    if (msg.includes('edit profile') || msg.includes('update profile') || msg.includes('change profile') || msg.includes('profile')) {
      return "✏️ EDITING YOUR PROFILE\n\nMake your profile shine and attract better matches!\n\n📱 STEPS:\n1. Go to your Profile page\n2. Tap the Edit button at the top\n3. Update each section:\n   • 📸 Photos - Add your best pics\n   • 📝 Bio - Share your story\n   • 🎯 Interests - Show your passions\n   • ⚙️ Preferences - Set your criteria\n   • 👤 Personal Info - Update details\n4. Save all changes\n\n💡 PRO TIP: If changes don't appear immediately, close and reopen the app to refresh your profile.";
    }

    // Change photos
    if (msg.includes('change photo') || msg.includes('add photo') || msg.includes('replace photo') || msg.includes('remove photo') || msg.includes('upload photo') || msg.includes('picture')) {
      return "📸 MANAGING YOUR PHOTOS\n\nGreat photos = more matches!\n\n📱 TO UPDATE:\n1. Go to Profile → Edit\n2. Tap any photo slot to add, replace, or remove\n3. Your first photo is your main profile picture\n\n💡 PHOTO TIPS:\n• Use clear, well-lit photos\n• Show your face clearly in at least one photo\n• Add variety - hobbies, travel, with friends\n• Avoid heavy filters\n• Recent photos work best";
    }

    // Payment error
    if (msg.includes('payment error') || msg.includes('payment fail') || msg.includes('payment issue') || msg.includes('payment problem') || msg.includes('billing error') || msg.includes('card declined') || msg.includes('transaction fail') || msg.includes('payment not going') || msg.includes('payment isn\'t going') || msg.includes('can\'t pay') || msg.includes('cant pay') || msg.includes('payment help') || msg.includes('how to pay') || msg.includes('payment method') || msg.includes('add payment')) {
      return "💳 PAYMENT SUPPORT\n\nSorry you're having payment trouble - let's sort it out.\n\n🍎 iOS: billed through Apple Pay. Add or update a card under Settings → Wallet & Apple Pay.\n\n🤖 Android: billed through Google Play. Add or update a card under the Play Store → Payments & subscriptions.\n\n⚠️ NOT GOING THROUGH?\n• Double-check your card details\n• Make sure you have sufficient funds\n• Confirm the Play Store/App Store itself isn't showing its own error\n\n📧 Still stuck? driploveinfo@gmail.com with your registered email, a screenshot, and when it happened. We reply within 24 hours.";
    }

    // Premium cost / pricing
    if (msg.includes('price') || msg.includes('cost') || msg.includes('how much') || msg.includes('pricing')) {
      return "💰 PREMIUM PRICING\n\nSee the current price for your account (and whether you qualify for a free trial) at:\n👉 Profile → Upgrade to Premium\n\nBilled monthly through Apple Pay (iOS) or Google Play (Android), cancel anytime - you keep premium until the period you paid for ends.\n\n📧 Payment issues: driploveinfo@gmail.com";
    }

    // Premium features / what premium includes
    if (msg.includes('premium') || msg.includes('upgrade') || msg.includes('subscription') || msg.includes('what does premium') || msg.includes('membership')) {
      return "💎 DRIPLOVE PREMIUM\n\n✨ WHAT YOU GET:\n• ♾️ Unlimited daily swipes\n• ❤️ See everyone who liked you\n• ↩️ Unlimited reverse (undo passes)\n• 🌍 Up to 4 extra countries to match in\n• 🔕 Fewer ads\n• 🎧 Priority support\n\n🎁 New here? If you're eligible, the Premium page will show a free trial before you're charged.\n\n👉 Upgrade: Profile → Upgrade to Premium";
    }

    // Cancel subscription
    if (msg.includes('cancel') || msg.includes('unsubscribe') || msg.includes('stop subscription') || msg.includes('end subscription')) {
      return "❌ CANCEL SUBSCRIPTION\n\nWe're sad to see you go, but here's how:\n\n📱 STEPS:\n1. Go to Profile\n2. Open Account Actions\n3. Tap 'Cancel Subscription'\n4. Confirm cancellation\n\n📝 IMPORTANT:\n• Premium features remain active until your billing period ends\n• You won't be charged again\n• You can resubscribe anytime\n\n💭 Changed your mind? We'd love to know how we can improve! Email us at driploveinfo@gmail.com";
    }

    // Explore more countries
    if (msg.includes('more countries') || msg.includes('other countries') || msg.includes('explore countries') || msg.includes('change country') || msg.includes('location') || msg.includes('international')) {
      return "🌍 EXPLORE OTHER COUNTRIES\n\n🆓 FREE: matching is limited to your own registered country.\n\n💎 PREMIUM: unlock up to 4 extra countries to match in.\n\n📱 TO SET THEM:\nProfile → Edit → Preferences → Countries\n\n👉 Upgrade: Profile → Upgrade to Premium";
    }

    // See who liked me
    if (msg.includes('who liked') || msg.includes('see likes') || msg.includes('my likes') || msg.includes('who like me') || msg.includes('people who liked')) {
      return "❤️ WHO LIKED ME\n\n🆓 FREE: you can see that people liked you, but not their full profile.\n\n💎 PREMIUM: see everyone who liked you on the Liked tab and match instantly with one tap.\n\n👉 Upgrade: Profile → Upgrade to Premium";
    }

    // Daily swipes
    if (msg.includes('swipe') || msg.includes('daily limit') || msg.includes('how many') || msg.includes('swipes left') || msg.includes('out of swipes')) {
      return "👆 DAILY SWIPES\n\n🆓 FREE: about 15-20 swipes per day, resetting daily.\n\n💎 PREMIUM: unlimited swipes, no waiting.\n\n👉 Upgrade: Profile → Upgrade to Premium";
    }

    // Reporting users / safety
    if (msg.includes('report') || msg.includes('unsafe') || msg.includes('uncomfortable') || msg.includes('harassment') || msg.includes('inappropriate') || msg.includes('fake profile') || msg.includes('scam')) {
      return "🛡️ REPORTING & SAFETY\n\nYour safety is our top priority!\n\n📱 TO REPORT:\n1. Go to the user's profile\n2. Tap the Report button\n3. Select the reason\n4. Add details if needed\n5. Submit\n\n🚫 YOU CAN ALSO:\n• Block users directly from their profile\n• Report inappropriate messages in chat\n• Unmatch instantly\n\n⚡ We investigate all reports within 24 hours and take action to keep DripLove safe.\n\n💪 Together, we build a respectful community!";
    }

    // Block user
    if (msg.includes('block')) {
      return "🚫 BLOCKING USERS\n\n📱 TO BLOCK SOMEONE:\n1. Go to their profile\n2. Tap the Block button\n3. Confirm your choice\n\n✅ WHAT HAPPENS:\n• They can't see your profile\n• They can't message you\n• You won't see them in discover\n• Your existing chat is hidden\n\n💡 Blocked users are NOT notified. You can unblock from Settings if needed.";
    }

    // Advertising
    if (msg.includes('advertis') || msg.includes('promote') || msg.includes('business') || msg.includes('marketing') || msg.includes('sponsor')) {
      return "📢 ADVERTISING ON DRIPLOVE\n\nReach thousands of engaged users!\n\n🎯 BENEFITS:\n• Location-based targeting\n• Demographic targeting\n• High engagement rates\n• Brand-safe environment\n• Customized campaigns\n\n📊 OUR AUDIENCE:\n• Young professionals\n• Active daily users\n• High purchasing intent\n\n📧 INTERESTED?\nEmail: driploveinfo@gmail.com\n\nWe'll create a custom advertising package tailored to your goals!";
    }

    // Change password
    if (msg.includes('change password') || msg.includes('reset password') || msg.includes('update password') || msg.includes('forgot password') || msg.includes('new password')) {
      return "🔐 PASSWORD HELP\n\n📧 EMAIL SIGN-UP USERS:\n• Go to Profile → Account Settings\n• Select 'Change Password'\n\n🔑 FORGOT PASSWORD?\n• Tap 'Forgot Password' on login screen\n• Check your email for reset link\n• Create a new secure password\n\n🍎 GOOGLE/APPLE SIGN-IN:\nYour password is managed through your Google or Apple account settings.\n\n💡 TIP: Use a strong, unique password for better security!";
    }

    // Delete account
    if (msg.includes('delete account') || msg.includes('remove account') || msg.includes('close account') || msg.includes('deactivate')) {
      return "⚠️ DELETE ACCOUNT\n\n📱 TO DELETE:\n1. Go to Profile\n2. Open Account Actions\n3. Tap 'Delete Account'\n4. Verify your identity\n5. Confirm deletion\n\n🚨 WARNING:\n• This action is PERMANENT\n• All your data will be removed\n• Your matches and chats will be deleted\n• This cannot be undone\n\n💭 Taking a break instead? Consider just logging out - your profile stays safe!";
    }

    // Features
    if (msg.includes('feature') || msg.includes('can i') || msg.includes('what can') || msg.includes('how does') || msg.includes('app work')) {
      return "📱 DRIPLOVE FEATURES\n\n🆓 FREE:\n• Build your profile\n• ~15-20 swipes/day\n• Match, chat, video/voice calls\n• Face verification\n\n💎 PREMIUM adds:\n• Unlimited swipes\n• See everyone who liked you\n• Reverse passes (undo)\n• Up to 4 extra countries\n• Fewer ads, priority support\n\n👉 Upgrade: Profile → Upgrade to Premium";
    }

    // Match/Dating help
    if (msg.includes('match') || msg.includes('no match') || msg.includes('not working') || msg.includes('get more matches') || msg.includes('tips') || msg.includes('advice')) {
      return "💕 GET MORE MATCHES\n\n✨ TOP TIPS:\n\n📸 PHOTOS:\n• Use clear, recent photos\n• Show your face in main photo\n• Add variety (hobbies, travel, lifestyle)\n• Smile - it works!\n\n📝 PROFILE:\n• Write a genuine, unique bio\n• Complete all sections\n• Share your interests\n• Be specific, not generic\n\n🎯 ACTIVITY:\n• Be active and swipe regularly\n• Respond to messages promptly\n• Send personalized openers\n\n💎 Consider Premium for increased visibility and unlimited opportunities!";
    }

    // Safety/Privacy
    if (msg.includes('safe') || msg.includes('privacy') || msg.includes('security') || msg.includes('data') || msg.includes('information')) {
      return "🔒 SAFETY & PRIVACY\n\n✅ YOUR SECURITY:\n• Face verification required\n• End-to-end encrypted chats\n• Report & block features\n• 24/7 moderation team\n\n🛡️ YOUR PRIVACY:\n• Your data is encrypted\n• We never share personal info\n• Control what's visible on profile\n• Delete account anytime\n\n📱 SAFETY TIPS:\n• Never share personal/financial info\n• Video call before meeting\n• Meet in public places first\n• Tell a friend about dates\n\n📧 Questions? driploveinfo@gmail.com";
    }

    // Account issues / login
    if (msg.includes('account') || msg.includes('login') || msg.includes('sign in') || msg.includes('cant log') || msg.includes("can't log")) {
      return "🔑 ACCOUNT HELP\n\n🔄 LOGIN ISSUES:\n• Check your internet connection\n• Update to the latest app version\n• Clear app cache\n• Try logging in with the same method you signed up\n\n📧 FORGOT PASSWORD:\n• Tap 'Forgot Password' on login\n• Check email for reset link\n\n🍎 GOOGLE/APPLE ISSUES:\n• Make sure you're using the same account\n• Check your Google/Apple account status\n\n📧 Still stuck? Email: driploveinfo@gmail.com with your registered email address.";
    }

    // Notifications
    if (msg.includes('notif') || msg.includes('push') || msg.includes('alert')) {
      return "🔔 NOTIFICATIONS\n\n📱 TO ENABLE:\n1. Go to your phone Settings\n2. Find DripLove in Apps\n3. Enable Notifications\n4. Allow all notification types\n\n✅ YOU'LL BE NOTIFIED FOR:\n• New matches\n• New messages\n• People who liked you\n• Special offers\n\n🔕 TO CUSTOMIZE:\nAdjust notification preferences in app Settings.\n\n💡 TIP: Keep notifications ON to never miss a potential match!";
    }

    // Unmatch
    if (msg.includes('unmatch') || msg.includes('remove match') || msg.includes('delete match')) {
      return "💔 UNMATCH\n\n📱 TO UNMATCH:\n1. Open the chat with the person\n2. Tap the menu icon (three dots)\n3. Select 'Unmatch'\n4. Confirm\n\n✅ WHAT HAPPENS:\n• The conversation is deleted\n• They can't message you\n• You're removed from each other's matches\n\n💡 Note: This action cannot be undone. Consider blocking if you feel unsafe.";
    }

    // Contact support
    if (msg.includes('support') || msg.includes('email') || msg.includes('contact') || msg.includes('help')) {
      return "📧 CONTACT SUPPORT\n\n🎧 Email: driploveinfo@gmail.com\n⏰ Response: Within 24 hours\n\n📝 FOR FASTER HELP, INCLUDE:\n• Your registered email\n• Screenshots (if applicable)\n• Detailed description\n• Your device type (iPhone/Android)\n\n✅ WE GUARANTEE:\n• Personal response (not automated!)\n• Issue resolution\n• Follow-up if needed\n\n💬 I'm also here to help! What's on your mind?";
    }

    // Greetings
    if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey') || msg.includes('good morning') || msg.includes('good afternoon') || msg.includes('good evening')) {
      return "Hey there! 👋 Great to chat with you!\n\nI can help you with:\n\n💎 Premium features & pricing\n✏️ Profile tips & editing\n🌍 Exploring other countries\n❤️ Who liked you\n🛡️ Reporting & safety\n💳 Payment issues\n📢 Advertising\n🔐 Account & password\n\nWhat would you like to know? Just ask or tap a quick reply below!";
    }

    // Thanks
    if (msg.includes('thank') || msg.includes('thanks') || msg.includes('appreciate') || msg.includes('helpful')) {
      return "You're very welcome! 😊\n\nIt was my pleasure helping you. If you have any other questions in the future, I'm always here!\n\n💕 Wishing you great connections on DripLove!\n\nIs there anything else I can assist with?";
    }

    // Goodbye
    if (msg.includes('bye') || msg.includes('goodbye') || msg.includes('see you') || msg.includes('take care')) {
      return "Goodbye! 👋\n\nThank you for chatting with DripBot. Have a wonderful time on DripLove!\n\n💕 May you find meaningful connections!\n\nCome back anytime you need help!";
    }

    // App not working
    if (msg.includes('not working') || msg.includes('bug') || msg.includes('crash') || msg.includes('error') || msg.includes('broken') || msg.includes('stuck')) {
      return "🔧 TROUBLESHOOTING\n\n📱 QUICK FIXES:\n1. Close and reopen the app completely\n2. Check your internet connection\n3. Update to the latest version\n4. Clear app cache\n5. Restart your phone\n\n📲 TO UPDATE:\n• iOS: App Store → Updates\n• Android: Play Store → Updates\n\n🔄 Still having issues?\nTry uninstalling and reinstalling the app.\n\n📧 Persistent problems? Email: driploveinfo@gmail.com with:\n• Your device type\n• App version\n• Description of the issue\n• Screenshot if possible";
    }

    // Super Like or special features
    if (msg.includes('super') || msg.includes('boost') || msg.includes('spotlight')) {
      return "⭐ SPECIAL FEATURES\n\n💎 PREMIUM PERKS:\n• Priority placement in discover feed\n• Your profile shown to more people\n• Stand out from the crowd\n• Increased visibility\n\n🚀 TO GET NOTICED:\n• Upgrade to Premium\n• Complete your profile 100%\n• Add quality photos\n• Be active daily\n\n👉 Upgrade: Profile → Upgrade to Premium";
    }

    // Age/Preferences
    if (msg.includes('age') || msg.includes('prefer') || msg.includes('filter') || msg.includes('distance')) {
      return "⚙️ PREFERENCES\n\n📱 TO UPDATE:\n1. Go to Profile\n2. Tap Edit at the top\n3. Find 'Preferences' section\n4. Adjust your settings:\n   • Age range\n   • Distance\n   • Gender preference\n   • Countries (Premium)\n5. Save changes\n\n💡 TIP: Wider preferences = more potential matches!\n\nClose and reopen the app if changes don't appear immediately.";
    }

    // Default response - more helpful and engaging
    return "Thanks for your message! 💬\n\nI'm here to help with:\n\n💎 Premium features & pricing\n✏️ Profile editing & photos\n🌍 Country exploration\n❤️ Who liked you\n🛡️ Reporting & safety\n💳 Payment issues\n📢 Advertising opportunities\n🔐 Account & password\n📹 Video/voice calls\n🔔 Notifications\n\n📝 Just type your question or tap a quick reply!\n\n🎧 Need a human? Email: driploveinfo@gmail.com";
  };

  const handleSendMessage = (messageText?: string) => {
    const textToSend = messageText || inputValue.trim();
    if (!textToSend) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: textToSend,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    setIsTyping(true);

    // Variable delay for more natural feeling
    const typingDelay = 800 + Math.random() * 1200;

    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: getAutoResponse(textToSend),
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botResponse]);
      setIsTyping(false);
    }, typingDelay);
  };

  const handleQuickReply = (value: string) => {
    const quickReplyMap: Record<string, string> = {
      premium: "What are premium features?",
      pricing: "How much does premium cost?",
      edit: "How do I edit my profile?",
      countries: "How can I explore more countries?",
      likes: "Who liked my profile?",
      swipes: "How many swipes do I get per day?",
      "payment-error": "I'm having payment issues",
      report: "How do I report someone?",
      ads: "Tell me about advertising options",
    };

    handleSendMessage(quickReplyMap[value] || value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] h-[650px] flex flex-col p-0 gap-0 bg-black border border-pink-500/50 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white rounded-t-lg shrink-0">
          <DialogDescription className="sr-only">
            Chat with DripBot to get help with DripLove features and account management
          </DialogDescription>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg font-bold">DripBot Support</DialogTitle>
                <div className="text-xs text-white/90 flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>Always online • Instant replies</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                  message.sender === 'user'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                    : 'bg-neutral-900 border border-pink-500/20 text-gray-100'
                }`}
              >
                {message.sender === 'bot' && (
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-neutral-700">
                    <div className="w-6 h-6 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-xs font-semibold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">DripBot</span>
                  </div>
                )}
                <div className="text-sm whitespace-pre-line leading-relaxed">{message.text}</div>
                <span className="text-xs opacity-60 mt-2 block text-right">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-neutral-900 border border-pink-500/20 rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Replies */}
        {messages.length < 4 && (
          <div className="px-4 py-3 bg-black border-t border-pink-500/20 shrink-0">
            <p className="text-xs text-gray-400 mb-2 font-medium">💡 Quick topics:</p>
            <div className="flex flex-wrap gap-2">
              {quickReplies.map((reply) => (
                <button
                  key={reply.value}
                  onClick={() => handleQuickReply(reply.value)}
                  className="px-3 py-1.5 text-xs bg-neutral-900 text-pink-300 rounded-full hover:bg-neutral-800 transition-all border border-pink-500/30 font-medium"
                >
                  {reply.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 bg-black border-t border-pink-500/20 rounded-b-lg shrink-0">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1 bg-neutral-900 border-pink-500/30 text-white placeholder:text-gray-500 focus:border-purple-400 focus:ring-purple-400"
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim() || isTyping}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-4"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Powered by DripLove • Need a human? Email driploveinfo@gmail.com
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LiveChat;

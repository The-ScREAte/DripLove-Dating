// Use shared IAP actions
import { buyMonthly, restorePurchases } from '../iap';

import { useImageEdgeColor } from '@/hooks/useImageEdgeColor';
function DominantColorImageBg({ imageUrl, children }) {
  const { edgeColor } = useImageEdgeColor(imageUrl);
  
  // Generate bright gradient colors matching the reference image (purple to pink)
  const brightGradients = [
    'bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500',
    'bg-gradient-to-br from-purple-700 via-purple-600 to-pink-600', 
    'bg-gradient-to-br from-indigo-600 via-purple-500 to-pink-500',
    'bg-gradient-to-br from-purple-800 via-purple-600 to-pink-400',
    'bg-gradient-to-br from-violet-600 via-purple-500 to-pink-500',
    'bg-gradient-to-br from-purple-600 via-fuchsia-500 to-pink-500',
    'bg-gradient-to-br from-indigo-700 via-purple-600 to-pink-600',
    'bg-gradient-to-br from-purple-700 via-fuchsia-600 to-pink-500'
  ];
  
  // Generate consistent gradient based on edge color
  const getGradientFromColor = (color) => {
    if (!color || color === '#000000') {
      return brightGradients[0]; // Default bright gradient
    }
    
    // Convert hex to number for consistent selection
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const index = num % brightGradients.length;
    return brightGradients[index];
  };
  
  const selectedGradient = getGradientFromColor(edgeColor);
  
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {/* Bright gradient background for better contrast */}
      <div
        className={`absolute inset-0 ${selectedGradient}`}
        style={{ zIndex: 0 }}
        aria-hidden="true"
      />
      {/* Blurred image overlays the gradient for a soft effect - made very subtle for small screens */}
      {imageUrl && (
        <img
          src={imageUrl}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-5"
          style={{
            filter: 'blur(60px) brightness(1.1)',
            zIndex: 1,
            objectFit: 'cover',
            width: '100%',
            height: '100%',
            transform: 'scale(1.1)'
          }}
          draggable={false}
        />
      )}
      {/* Dark overlay for better text readability */}
      <div 
        className="absolute inset-0 bg-black/20"
        style={{ zIndex: 2 }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 z-10">
        {children}
      </div>
    </div>
  );
}
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2, Quote, Coffee, Search } from 'lucide-react';
const adinkraSymbols = [
  // 30 Adinkra symbols (SVGs are illustrative, not all unique for brevity)
  { name: 'Aya', meaning: 'The fern. Symbol of endurance and resourcefulness.', svg: (<svg width="24" height="24"><ellipse cx="12" cy="12" rx="10" ry="6" fill="#A5D6A7" stroke="#388E3C" strokeWidth="2" /><path d="M12 6v12M9 9l6 6M15 9l-6 6" stroke="#388E3C" strokeWidth="2" /></svg>) },
  { name: 'Nkyinkyim', meaning: 'Twisting. Symbol of initiative, dynamism, and versatility.', svg: (<svg width="24" height="24"><path d="M6 18c6-12 12 0 12-12" stroke="#E53935" strokeWidth="2" fill="none"/><circle cx="6" cy="18" r="1.5" fill="#F9A825" /><circle cx="18" cy="6" r="1.5" fill="#43A047" /></svg>) },
  { name: 'Eban', meaning: 'Fence. Symbol of love, safety, and security.', svg: (<svg width="24" height="24"><rect x="4" y="4" width="16" height="16" rx="4" fill="#FFFDE7" stroke="#E53935" strokeWidth="2" /><path d="M7 4v16M12 4v16M17 4v16" stroke="#43A047" strokeWidth="2" /></svg>) },
  { name: 'Fihankra', meaning: 'House/compound. Symbol of security and safety.', svg: (<svg width="24" height="24"><rect x="6" y="10" width="12" height="8" fill="#E3F2FD" stroke="#1E88E5" strokeWidth="2" /><polygon points="12,4 6,10 18,10" fill="#F9A825" stroke="#E53935" strokeWidth="2"/></svg>) },
  { name: 'Gye Nyame', meaning: 'Except for God. Symbol of the supremacy of God.', svg: (<svg width="24" height="24"><circle cx="12" cy="12" r="11" stroke="#F9A825" strokeWidth="2" fill="#FFFDE7" /><path d="M12 5c-1.5 1.5-1.5 4.5 0 6s1.5 4.5 0 6" stroke="#E53935" strokeWidth="2" fill="none"/><path d="M12 19c1.5-1.5 1.5-4.5 0-6s-1.5-4.5 0-6" stroke="#43A047" strokeWidth="2" fill="none"/><circle cx="12" cy="12" r="1.5" fill="#1E88E5" /></svg>) },
  { name: 'Sankofa', meaning: 'Go back and get it. Symbol of learning from the past.', svg: (<svg width="24" height="24"><circle cx="12" cy="12" r="11" stroke="#43A047" strokeWidth="2" fill="#E8F5E9" /><path d="M16 12c0-2.2-1.8-4-4-4s-4 1.8-4 4 1.8 4 4 4c1.5 0 3-1.2 3-3" stroke="#E53935" strokeWidth="2" fill="none"/><path d="M12 15l3-3-3-3" stroke="#F9A825" strokeWidth="2" fill="none"/></svg>) },
  { name: 'Duafe', meaning: 'Wooden comb. Symbol of beauty, cleanliness, feminine qualities.', svg: (<svg width="24" height="24"><rect x="3" y="6" width="18" height="12" rx="6" fill="#FFF3E0" stroke="#E53935" strokeWidth="2" /><rect x="9" y="3" width="6" height="6" rx="3" fill="#F9A825" stroke="#43A047" strokeWidth="2" /><rect x="7" y="15" width="1.5" height="4" fill="#1E88E5" /><rect x="11" y="15" width="1.5" height="4" fill="#1E88E5" /><rect x="15" y="15" width="1.5" height="4" fill="#1E88E5" /></svg>) },
  { name: 'Fawohodie', meaning: 'Independence. Symbol of freedom, emancipation, independence.', svg: (<svg width="24" height="24"><rect x="6" y="6" width="12" height="12" rx="6" fill="#E3F2FD" stroke="#1E88E5" strokeWidth="2" /><path d="M12 6v12M6 12h12" stroke="#E53935" strokeWidth="2" /><circle cx="12" cy="12" r="2" fill="#F9A825" /></svg>) },
  { name: 'Akoma', meaning: 'The heart. Symbol of patience and tolerance.', svg: (<svg width="24" height="24"><path d="M12 21s-6-4.5-6-9a6 6 0 0 1 12 0c0 4.5-6 9-6 9z" fill="#E53935" stroke="#F9A825" strokeWidth="2" /><circle cx="9" cy="10.5" r="1.5" fill="#FFFDE7" /><circle cx="15" cy="10.5" r="1.5" fill="#FFFDE7" /></svg>) },
  { name: 'Akoben', meaning: 'War horn. Symbol of vigilance and wariness.', svg: (<svg width="24" height="24"><ellipse cx="12" cy="12" rx="14" ry="8" fill="#a5d6a7" stroke="#388e3c" strokeWidth="2"/><path d="M16 8v16M12 12l8 8M20 12l-8 8" stroke="#388e3c" strokeWidth="2"/></svg>) },
  { name: 'Adinkrahene', meaning: 'Chief of the adinkra symbols. Symbol of greatness, charisma, and leadership.', svg: (<svg width="24" height="24"><circle cx="12" cy="12" r="14" fill="#f9a825" stroke="#e53935" strokeWidth="2"/><circle cx="12" cy="12" r="8" fill="#43a047"/></svg>) },
  { name: 'Bese Saka', meaning: 'Sack of cola nuts. Symbol of affluence, power, abundance, unity.', svg: (<svg width="24" height="24"><ellipse cx="16" cy="20" rx="10" ry="6" fill="#e3f2fd" stroke="#1e88e5" strokeWidth="2"/><ellipse cx="16" cy="12" rx="6" ry="4" fill="#f9a825" stroke="#e53935" strokeWidth="2"/></svg>) },
  { name: 'Dame-Dame', meaning: 'Checkerboard. Symbol of intelligence and ingenuity.', svg: (<svg width="24" height="24"><rect x="4" y="4" width="24" height="24" fill="#fffde7" stroke="#e53935" strokeWidth="2"/><rect x="4" y="4" width="12" height="12" fill="#43a047"/><rect x="16" y="16" width="12" height="12" fill="#f9a825"/></svg>) },
  { name: 'Fihankra', meaning: 'House/compound. Symbol of security and safety.', svg: (<svg width="24" height="24"><rect x="8" y="14" width="16" height="10" fill="#e3f2fd" stroke="#1e88e5" strokeWidth="2"/><polygon points="16,6 8,14 24,14" fill="#f9a825" stroke="#e53935" strokeWidth="2"/></svg>) },
  { name: 'Dwennimmen', meaning: 'Ram’s horns. Symbol of humility together with strength.', svg: (<svg width="24" height="24"><circle cx="12" cy="12" r="15" fill="#fff3e0" stroke="#e53935" strokeWidth="2"/><path d="M10 20c-4-4 4-12 8-8" stroke="#43a047" strokeWidth="2" fill="none"/><path d="M22 20c4-4-4-12-8-8" stroke="#43a047" strokeWidth="2" fill="none"/></svg>) },
  { name: 'Nyame Dua', meaning: 'Tree of God. Symbol of God’s presence and protection.', svg: (<svg width="24" height="24"><rect x="14" y="18" width="4" height="10" fill="#43a047"/><circle cx="16" cy="14" r="8" fill="#f9a825" stroke="#e53935" strokeWidth="2"/></svg>) },
  { name: 'Boa Me Na Me Mmoa Wo', meaning: 'Help me and let me help you. Symbol of cooperation and interdependence.', svg: (<svg width="24" height="24"><rect x="8" y="8" width="16" height="16" rx="8" fill="#e3f2fd" stroke="#1e88e5" strokeWidth="2"/><path d="M16 8v16M8 16h16" stroke="#e53935" strokeWidth="2"/></svg>) },
  { name: 'Nkyinkyim', meaning: 'Twisting. Symbol of initiative, dynamism, and versatility.', svg: (<svg width="24" height="24"><path d="M8 24c8-16 16 0 16-16" stroke="#e53935" strokeWidth="3" fill="none"/><circle cx="8" cy="24" r="2" fill="#f9a825"/><circle cx="24" cy="8" r="2" fill="#43a047"/></svg>) },
  { name: 'Eban', meaning: 'Fence. Symbol of love, safety, and security.', svg: (<svg width="24" height="24"><rect x="6" y="6" width="20" height="20" rx="6" fill="#fffde7" stroke="#e53935" strokeWidth="2"/><path d="M10 6v20M16 6v20M22 6v20" stroke="#43a047" strokeWidth="2"/></svg>) },
  { name: 'Akoben', meaning: 'War horn. Symbol of vigilance and wariness.', svg: (<svg width="24" height="24"><ellipse cx="12" cy="12" rx="14" ry="8" fill="#a5d6a7" stroke="#388e3c" strokeWidth="2"/><path d="M16 8v16M12 12l8 8M20 12l-8 8" stroke="#388e3c" strokeWidth="2"/></svg>) },
  { name: 'Adinkrahene', meaning: 'Chief of the adinkra symbols. Symbol of greatness, charisma, and leadership.', svg: (<svg width="24" height="24"><circle cx="12" cy="12" r="14" fill="#f9a825" stroke="#e53935" strokeWidth="2"/><circle cx="12" cy="12" r="8" fill="#43a047"/></svg>) },
  { name: 'Bese Saka', meaning: 'Sack of cola nuts. Symbol of affluence, power, abundance, unity.', svg: (<svg width="24" height="24"><ellipse cx="16" cy="20" rx="10" ry="6" fill="#e3f2fd" stroke="#1e88e5" strokeWidth="2"/><ellipse cx="16" cy="12" rx="6" ry="4" fill="#f9a825" stroke="#e53935" strokeWidth="2"/></svg>) },
  { name: 'Dame-Dame', meaning: 'Checkerboard. Symbol of intelligence and ingenuity.', svg: (<svg width="24" height="24"><rect x="4" y="4" width="24" height="24" fill="#fffde7" stroke="#e53935" strokeWidth="2"/><rect x="4" y="4" width="12" height="12" fill="#43a047"/><rect x="16" y="16" width="12" height="12" fill="#f9a825"/></svg>) },
  { name: 'Fihankra', meaning: 'House/compound. Symbol of security and safety.', svg: (<svg width="24" height="24"><rect x="8" y="14" width="16" height="10" fill="#e3f2fd" stroke="#1e88e5" strokeWidth="2"/><polygon points="16,6 8,14 24,14" fill="#f9a825" stroke="#e53935" strokeWidth="2"/></svg>) },
  { name: 'Dwennimmen', meaning: 'Ram’s horns. Symbol of humility together with strength.', svg: (<svg width="24" height="24"><circle cx="12" cy="12" r="15" fill="#fff3e0" stroke="#e53935" strokeWidth="2"/><path d="M10 20c-4-4 4-12 8-8" stroke="#43a047" strokeWidth="2" fill="none"/><path d="M22 20c4-4-4-12-8-8" stroke="#43a047" strokeWidth="2" fill="none"/></svg>) },
  { name: 'Nyame Dua', meaning: 'Tree of God. Symbol of God’s presence and protection.', svg: (<svg width="24" height="24"><rect x="14" y="18" width="4" height="10" fill="#43a047"/><circle cx="16" cy="14" r="8" fill="#f9a825" stroke="#e53935" strokeWidth="2"/></svg>) },
  { name: 'Boa Me Na Me Mmoa Wo', meaning: 'Help me and let me help you. Symbol of cooperation and interdependence.', svg: (<svg width="24" height="24"><rect x="8" y="8" width="16" height="16" rx="8" fill="#e3f2fd" stroke="#1e88e5" strokeWidth="2"/><path d="M16 8v16M8 16h16" stroke="#e53935" strokeWidth="2"/></svg>) },
  { name: 'Nkyinkyim', meaning: 'Twisting. Symbol of initiative, dynamism, and versatility.', svg: (<svg width="24" height="24"><path d="M8 24c8-16 16 0 16-16" stroke="#e53935" strokeWidth="3" fill="none"/><circle cx="8" cy="24" r="2" fill="#f9a825"/><circle cx="24" cy="8" r="2" fill="#43a047"/></svg>) },
  { name: 'Eban', meaning: 'Fence. Symbol of love, safety, and security.', svg: (<svg width="24" height="24"><rect x="6" y="6" width="20" height="20" rx="6" fill="#fffde7" stroke="#e53935" strokeWidth="2"/><path d="M10 6v20M16 6v20M22 6v20" stroke="#43a047" strokeWidth="2"/></svg>) },
  { name: 'Akoben', meaning: 'War horn. Symbol of vigilance and wariness.', svg: (<svg width="24" height="24"><ellipse cx="12" cy="12" rx="14" ry="8" fill="#a5d6a7" stroke="#388e3c" strokeWidth="2"/><path d="M16 8v16M12 12l8 8M20 12l-8 8" stroke="#388e3c" strokeWidth="2"/></svg>) },
  { name: 'Adinkrahene', meaning: 'Chief of the adinkra symbols. Symbol of greatness, charisma, and leadership.', svg: (<svg width="24" height="24"><circle cx="12" cy="12" r="14" fill="#f9a825" stroke="#e53935" strokeWidth="2"/><circle cx="12" cy="12" r="8" fill="#43a047"/></svg>) },
  { name: 'Bese Saka', meaning: 'Sack of cola nuts. Symbol of affluence, power, abundance, unity.', svg: (<svg width="24" height="24"><ellipse cx="16" cy="20" rx="10" ry="6" fill="#e3f2fd" stroke="#1e88e5" strokeWidth="2"/><ellipse cx="16" cy="12" rx="6" ry="4" fill="#f9a825" stroke="#e53935" strokeWidth="2"/></svg>) },
  { name: 'Dame-Dame', meaning: 'Checkerboard. Symbol of intelligence and ingenuity.', svg: (<svg width="24" height="24"><rect x="4" y="4" width="24" height="24" fill="#fffde7" stroke="#e53935" strokeWidth="2"/><rect x="4" y="4" width="12" height="12" fill="#43a047"/><rect x="16" y="16" width="12" height="12" fill="#f9a825"/></svg>) },
  { name: 'Fihankra', meaning: 'House/compound. Symbol of security and safety.', svg: (<svg width="24" height="24"><rect x="8" y="14" width="16" height="10" fill="#e3f2fd" stroke="#1e88e5" strokeWidth="2"/><polygon points="16,6 8,14 24,14" fill="#f9a825" stroke="#e53935" strokeWidth="2"/></svg>) },
];

const ROTATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
interface AdinkraBarProps {
  onSymbolClick: (index: number) => void;
}

const AdinkraBar: React.FC<AdinkraBarProps> = ({ onSymbolClick }) => {
  const SYMBOLS_PER_SET = 4;
  const [setIndex, setSetIndex] = useState(() => Math.floor(Math.random() * Math.ceil(adinkraSymbols.length / SYMBOLS_PER_SET)));
  useEffect(() => {
    const interval = setInterval(() => {
      let next;
      do {
        next = Math.floor(Math.random() * Math.ceil(adinkraSymbols.length / SYMBOLS_PER_SET));
      } while (next === setIndex && Math.ceil(adinkraSymbols.length / SYMBOLS_PER_SET) > 1);
      setSetIndex(next);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [setIndex]);
  const start = setIndex * SYMBOLS_PER_SET;
  const visibleSymbols = adinkraSymbols.slice(start, start + SYMBOLS_PER_SET);
  return (
    <div
      className="w-full flex justify-center items-center gap-3 py-1 relative select-none"
      style={{
        backgroundImage: `url('data:image/svg+xml;utf8,<svg width=\"240\" height=\"36\" viewBox=\"0 0 240 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"240\" height=\"36\" fill=\"%23007bdb\"/><g><rect x=\"0\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"24\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"48\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"72\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"96\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"120\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"144\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"168\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"192\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"216\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/></g><g><polygon points=\"24,0 36,18 24,36 48,36 36,18 48,0\" fill=\"%23e63946\"/><polygon points=\"72,0 84,18 72,36 96,36 84,18 96,0\" fill=\"%2300b159\"/><polygon points=\"120,0 132,18 120,36 144,36 132,18 144,0\" fill=\"%23e63946\"/><polygon points=\"168,0 180,18 168,36 192,36 180,18 192,0\" fill=\"%2300b159\"/></g><g><rect x=\"0\" y=\"0\" width=\"240\" height=\"6\" fill=\"%23fff\" fill-opacity=\"0.15\"/><rect x=\"0\" y=\"30\" width=\"240\" height=\"6\" fill=\"%23fff\" fill-opacity=\"0.15\"/></g><g><rect x=\"23\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"47\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"71\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"95\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"119\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"143\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"167\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"191\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"215\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/></g></svg>')`,
        backgroundRepeat: 'repeat',
        backgroundSize: '240px 36px',
      }}
    >
      {visibleSymbols.map((symbol, idx) => (
        <button
          key={symbol.name}
          className="focus:outline-none bg-white rounded-full shadow hover:scale-110 transition-all duration-300 border border-yellow-300 hover:border-yellow-400 hover:shadow-lg cursor-pointer"
          style={{ width: 32, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => onSymbolClick(start + idx)}
          tabIndex={0}
          aria-label={`Click to see meaning of ${symbol.name} symbol`}
          title={`Click to learn about ${symbol.name}`}
        >
          {symbol.svg}
        </button>
      ))}
    </div>
  );
};
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, Crown, Calendar, MapPin, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Briefcase, GraduationCap, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useImagePreloader } from '@/hooks/useImagePreloader';
import { calculateDistance } from '@/constants/locationData';
import { debounce, optimizeImageUrl, createPagination, userDataCache } from '@/utils/performanceOptimizer';
import { locationService } from '@/services/locationService';
import { calculateProfileCompletion, getTodaySwipeCount, checkSwipeRestrictions } from '@/utils/profileCompletion';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';
import MatchCard from './discover/MatchCard';
import SwipeButtons from './discover/SwipeButtons';
import ProfileCompletionModal from './ProfileCompletionModal';
import SwipeCounter from './SwipeCounter';
import { CurrentUser, PotentialMatch } from '@/types';

// Helper function to calculate age from date of birth
const calculateAge = (dateOfBirth: string): number => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

interface DiscoverPageProps {
  currentUser: CurrentUser;
  onNavigateToChat?: (userId: string) => void;
  isPremium?: boolean;
}

interface PassedUser {
  user_id: string;
  passed_at: Date;
}

const DiscoverPage = ({ currentUser, onNavigateToChat, isPremium }: DiscoverPageProps) => {
  // IAP: Track if buy is enabled
  const [canBuy, setCanBuy] = useState(false);
  useEffect(() => {
    function onProductUpdated() {
      // @ts-ignore
      const p = window.CdvPurchase?.store?.get('com.driplove.dating.premium.monthlysub');
      setCanBuy(!!p && !!p.getOffer());
    }
    // @ts-ignore
    const store = window.CdvPurchase?.store;
    if (store && store.when) {
      store.when().productUpdated(onProductUpdated);
    }
    onProductUpdated();
    // No off/unsubscribe in plugin
  }, []);
  // ...existing code...

  // Example: Add Buy/Restore buttons to your UI (place where appropriate)
  // <button onClick={buyMonthly} disabled={!canBuy}>Buy Premium</button>
  // <button onClick={restorePurchases}>Restore Purchases</button>
  const [potentialMatches, setPotentialMatches] = useState<PotentialMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [passedUsers, setPassedUsers] = useState<PassedUser[]>([]);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const [isOutOfSwipes, setIsOutOfSwipes] = useState(false);
  const [showMatchAnimation, setShowMatchAnimation] = useState(false);
  const [matchedUser, setMatchedUser] = useState<PotentialMatch | null>(null);
  // New: Store images by userId for instant access
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  const [preloadedImages, setPreloadedImages] = useState<{ [key: string]: HTMLImageElement[] }>({});
  // Store distances from location service
  const [userDistances, setUserDistances] = useState<{ [key: string]: number }>({});
  const [reverseUsageToday, setReverseUsageToday] = useState(0);
  const [profileCompletion, setProfileCompletion] = useState(0);
  const [profileMissingFields, setProfileMissingFields] = useState<string[]>([]);
  const [userProfileImages, setUserProfileImages] = useState<any[]>([]);
  const [showProfileCompletionModal, setShowProfileCompletionModal] = useState(false);
  
  // Card shuffling system
  const [currentCardType, setCurrentCardType] = useState<'photo' | 'about' | 'funfact' | 'questions'>('photo');
  const [cardOrder, setCardOrder] = useState<('photo' | 'about' | 'funfact' | 'questions')[]>([]);
  const [todaySwipeCount, setTodaySwipeCount] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  
  // Adinkra tooltip state
  const [tooltipIdx, setTooltipIdx] = useState<number | null>(null);
  
  // Interests display state
  const [showAllInterests, setShowAllInterests] = useState(false);
  
  // Dynamic content height management
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  
  const { toast } = useToast();
  const { subscription, checkUsageLimit, refetchSubscription } = useSubscription(currentUser?.id);
  const { preloadImages, getOptimizedUrl, isImageLoaded } = useImagePreloader({
    maxConcurrent: 3,
    quality: 85,
    width: 800
  });

  // Calculate reverse availability and usage
  const canReverse = isPremium ? true : passedUsers.length > 0;
  const reversesLeft = isPremium ? undefined : Math.max(0, 2 - reverseUsageToday);

  // --- BEGIN: Swipe Guide Popup State ---
  const [showSwipeGuide, setShowSwipeGuide] = useState(false);
  useEffect(() => {
    // Only show for new users (e.g., if localStorage flag not set)
    if (!currentUser?.id) return;
    const guideFlag = localStorage.getItem('driplove_swipe_guide_shown');
    if (!guideFlag) {
      setShowSwipeGuide(true);
      const timer = setTimeout(() => {
        setShowSwipeGuide(false);
        localStorage.setItem('driplove_swipe_guide_shown', 'true');
      }, 20000); // 20 seconds
      return () => clearTimeout(timer);
    }
  }, [currentUser?.id]);
  // --- END: Swipe Guide Popup State ---

  // Check for premium activation from payment success (run once on mount)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('premium') === 'activated') {
      refetchSubscription();
      toast({
        title: 'Welcome to Premium!',
        description: 'Your premium features are now active. Enjoy unlimited access!',
        duration: 5000,
      });
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []); // Empty dependency array - only run once on mount

  // Fetch current reverse usage for today
  // Fetch user profile and calculate completion on mount
  useEffect(() => {
    const fetchUserProfileCompletion = async () => {
      if (!currentUser?.id) return;

      try {
        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        if (profileError) {
      // ...removed log...
          return;
        }

        // Fetch user images
        const { data: images, error: imagesError } = await supabase
          .from('user_images')
          .select('image_url, is_approved, moderation_status')
          .eq('user_id', currentUser.id);

        if (imagesError) {
      // ...removed log...
        }

        const userImages = images || [];
        setUserProfileImages(userImages);

        // Calculate profile completion
        const completionResult = calculateProfileCompletion(profile, userImages);
        setProfileCompletion(completionResult.completion);
        setProfileMissingFields(completionResult.missingFields);

        // Get today's swipe count
        const swipeCount = await getTodaySwipeCount(currentUser.id);
        setTodaySwipeCount(swipeCount);
      } catch (error) {
  // ...removed log...
      }
    };

    fetchUserProfileCompletion();
  }, [currentUser?.id]);

  const fetchReverseUsage = useCallback(async () => {
    if (!currentUser?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('user_usage')
        .select('reverse_dislikes_used')
        .eq('user_id', currentUser.id)
        .eq('date', new Date().toISOString().split('T')[0])
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
  // ...removed log...
        return;
      }

      setReverseUsageToday(data?.reverse_dislikes_used || 0);
    } catch (error) {
  // ...removed log...
    }
  }, [currentUser?.id]);
  const [lastShuffleTime, setLastShuffleTime] = useState<number>(0);
  // Removed swipe gesture state

  // Memoize expensive calculations
  const getGenderFilter = useCallback((userPreference: string) => {
    if (userPreference === 'male') {
      return ['male'];
    } else if (userPreference === 'female') {
      return ['female'];
    } else if (userPreference === 'everyone' || userPreference === 'both') {
      return ['male', 'female', 'other'];
    }
    return ['male', 'female', 'other']; // default to all
  }, []);

  const allowedGenders = useMemo(() => 
    getGenderFilter(currentUser?.preference || 'everyone'), 
    [currentUser?.preference, getGenderFilter]
  );

  const calculateAge = useCallback((dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }, []);

  const shouldReshuffle = useCallback(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000; // 10 minutes in milliseconds
    return now - lastShuffleTime > tenMinutes;
  }, [lastShuffleTime]);

  const fetchPotentialMatches = useCallback(async () => {
    if (!currentUser?.id) return;
  
    try {
      setIsLoading(true);
      
      // Check cache first for better performance
      const cacheKey = `potential_matches_${currentUser.id}`;
      const cachedData = userDataCache.get(cacheKey);
      if (cachedData) {
        setPotentialMatches(cachedData);
        setIsLoading(false);
        return;
      }
      
      // Parallel queries for better performance
      const [
        { data: likedUsers },
        { data: blockedUsers },
        { data: recentPasses }
      ] = await Promise.all([
        supabase
          .from('likes')
          .select('liked_id')
          .eq('liker_id', currentUser.id),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`),
        supabase
          .from('passes')
          .select('passed_id, passed_at')
          .match({ passer_id: currentUser.id })
          .gte('passed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Reduced from 2 days to 1 day
      ]);

      const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
      const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
      const hiddenPassedIds = recentPasses?.map(p => p.passed_id) || [];
      const excludedIds = [...likedUserIds, ...blockedUserIds, ...hiddenPassedIds, currentUser.id];
      
      // Get location-based matches using the locationService
      const userMaxDistance = currentUser.max_distance || currentUser.distance_preference || 50;
  // ...removed log...

      const locationMatches = await locationService.getLocationBasedMatches(currentUser.id, userMaxDistance);
      
  // ...removed log...
      
      // Store distances for each user
      const distanceMap: { [key: string]: number } = {};
      locationMatches.forEach(match => {
        distanceMap[match.profile_id] = match.distance_km;
      });
      setUserDistances(distanceMap);
      
      // Extract profile IDs from location matches for filtering
      const locationProfileIds = locationMatches.map(match => match.profile_id);
  // ...removed log...
      
      // Fetch full profile data for location matches
      let filteredProfiles: any[] = [];
      if (locationProfileIds.length > 0) {
  // ...removed log...
  // ...removed log...
        
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized')
          .in('id', locationProfileIds)
          .not('id', 'in', `(${excludedIds.join(',')})`)
          .in('gender', allowedGenders)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .limit(50);

  // ...removed log...
        
        if (error) throw error;
        filteredProfiles = profiles || [];
      } else {
  // ...removed log...
        // Fallback: get profiles from same country if no location matches
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized')
          .not('id', 'in', `(${excludedIds.join(',')})`)
          .in('gender', allowedGenders)
          .eq('account_status', 'active')
          .eq('is_admin', false)
          .eq('country', currentUser.country || 'Ghana')
          .limit(50);

  // ...removed log...
        
        if (error) throw error;
        filteredProfiles = profiles || [];
      }

      // Apply age filtering based on user preferences
      const userMinAge = currentUser.min_age || 18;
      const userMaxAge = currentUser.max_age || 99;
      
  // ...removed log...
      
      const beforeAgeFilter = filteredProfiles.length;
      filteredProfiles = filteredProfiles.filter(profile => {
        if (!profile.date_of_birth) return false; // Exclude profiles without birth date
        
        const age = calculateAge(profile.date_of_birth);
        return age >= userMinAge && age <= userMaxAge;
      });

  // ...removed log...
      
      // Add empty images array to match interface

      // Final safeguard: filter out current user's profile if present
      const profilesWithImages = filteredProfiles
        .filter(profile => profile.id !== currentUser.id)
        .map(profile => ({
          ...profile,
          images: [] // Will be loaded separately
        }));

      const shuffled = profilesWithImages.sort(() => 0.5 - Math.random());

      // Load last profile ID and time from localStorage
      const savedId = localStorage.getItem('driplove_last_profile_id');
      const savedTime = parseInt(localStorage.getItem('driplove_last_profile_time') || '0');
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const isSavedValid = savedId && Date.now() - savedTime < twentyFourHours;

      let indexToShow = 0;
      if (isSavedValid) {
        const savedIndex = shuffled.findIndex(p => p.id === savedId);
        if (savedIndex !== -1) {
          indexToShow = savedIndex;
        }
      }

      setPotentialMatches(shuffled);
      setCurrentIndex(indexToShow);
      setLastShuffleTime(Date.now());

  // Preload images for the first 2 profiles only for faster initial loading (non-blocking)
      if (shuffled.length > 0) {
        // Use setTimeout to make image preloading non-blocking for faster UI
        setTimeout(() => {
          preloadNextProfileImages(shuffled, {}, 0);
        }, 100);
      }
    } catch (error) {
  // ...removed log...
      toast({
        title: 'Error',
        description: 'Failed to load potential matches. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, allowedGenders, toast]);


  // Enhanced image preloading with actual image objects
  const preloadUserImages = useCallback(async (imageUrls: string[], userId: string) => {
    if (preloadedImages[userId]?.length > 0) return; // Already preloaded
    
    const imagePromises = imageUrls.map((url) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        // Add optimized image URL with compression
        img.src = url.includes('supabase') ? `${url}?width=800&quality=85&format=webp` : url;
      });
    });

    try {
      const loadedImages = await Promise.all(imagePromises);
      setPreloadedImages(prev => ({
        ...prev,
        [userId]: loadedImages
      }));
    } catch (error) {
  // ...removed log...
    }
  }, [preloadedImages]);

  // Preload images for the next N profiles for smoother UX
  const loadFullImages = useCallback(async (profileId: string) => {
    if (userImages[profileId]?.length > 0) return; // Already loaded
    
    try {
      // Only load approved images for discover page
      const { data: images, error } = await supabase
        .from('user_images')
        .select('image_url, is_approved')
        .eq('user_id', profileId)
        .eq('is_approved', true)
        .order('image_order', { ascending: true });

      if (error) throw error;

      if (images?.length) {
        const imageUrls = images.map(img => img.image_url);
        setUserImages(prev => ({
          ...prev,
          [profileId]: imageUrls
        }));
        
        // Immediately start preloading the actual images using both methods
        await preloadUserImages(imageUrls, profileId);
        preloadImages(imageUrls); // Also use the hook for optimization
      }
    } catch (error) {
  // ...removed log...
    }
  }, [userImages, preloadImages]);

  // Optimized preloading strategy - load 6 profiles ahead for smooth swiping
  const preloadNextProfileImages = useCallback(async (matches: PotentialMatch[], alreadyLoaded: { [key: string]: string[] }, startIdx: number) => {
    // Increased to 6 profiles for smooth swiping experience
    const PRELOAD_COUNT = 6;
    const toPreload = matches.slice(startIdx, startIdx + PRELOAD_COUNT)
      .filter(match => !alreadyLoaded[match.id] || alreadyLoaded[match.id]?.length === 0);
    
    // Process profiles in parallel for faster loading
    const loadPromises = toPreload.map(async (match, index) => {
      // Stagger the loading slightly to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, index * 25));
      return loadFullImages(match.id);
    });
    
    await Promise.all(loadPromises);
  }, [loadFullImages]);

  // Main effect to fetch data - only run when user ID changes and we don't have data
  useEffect(() => {
    if (currentUser?.id && (potentialMatches.length === 0 || isLoading)) {
      fetchPotentialMatches();
      fetchReverseUsage();
    }
  }, [currentUser?.id]); // Only depend on user ID, not the functions

  // Save current match state
  useEffect(() => {
    if (potentialMatches.length > 0) {
      localStorage.setItem('driplove_last_profile_id', potentialMatches[currentIndex]?.id || '');
      localStorage.setItem('driplove_last_profile_time', Date.now().toString());
    }
  }, [currentIndex, potentialMatches]);

  // Effect that only runs when switching profiles (currentIndex changes)
  useEffect(() => {
    setImageIndex(0);
    setShowMoreInfo(false); // Reset expanded state when switching profiles
    
    // Generate card order for the current match
    const currentMatch = potentialMatches[currentIndex];
    if (currentMatch) {
      const generateCardOrder = () => {
        const availableCards: ('photo' | 'about' | 'funfact' | 'questions')[] = ['photo'];
        
        // Add about card if bio exists
        if (currentMatch.bio) availableCards.push('about');
        
        // Add fun fact card if it exists
        if (currentMatch.fun_fact) availableCards.push('funfact');
        
        // Add questions card if relevant fields exist
        if (currentMatch.perfect_first_date || currentMatch.last_googled) {
          availableCards.push('questions');
        }
        
        // Shuffle the non-photo cards
        const nonPhotoCards = availableCards.slice(1);
        for (let i = nonPhotoCards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [nonPhotoCards[i], nonPhotoCards[j]] = [nonPhotoCards[j], nonPhotoCards[i]];
        }
        
        // Return photo first, then shuffled other cards
        return ['photo', ...nonPhotoCards] as ('photo' | 'about' | 'funfact' | 'questions')[];
      };
      
      const newOrder = generateCardOrder();
      setCardOrder(newOrder);
      setCurrentCardType('photo'); // Always start with photo
    }
  }, [currentIndex, potentialMatches]); // Removed userImages, preloadNextProfileImages, loadFullImages

  // Separate effect for image loading that doesn't reset showMoreInfo
  useEffect(() => {
    const currentMatch = potentialMatches[currentIndex];
    
    // Load images for current match if not already loaded
    if (currentMatch && !userImages[currentMatch.id]) {
      loadFullImages(currentMatch.id);
    }
    // Aggressive preloading: preload images for the next 6 profiles every 2 swipes for smooth experience
    const shouldPreloadMore = currentIndex % 2 === 0; // Every 2 swipes for frequent preloading
    if (shouldPreloadMore) {
      preloadNextProfileImages(potentialMatches, userImages, currentIndex + 1);
    }
  }, [currentIndex, potentialMatches, userImages, preloadNextProfileImages, loadFullImages]);

  // Dynamic content height measurement
  useEffect(() => {
    const measureContentHeight = () => {
      if (contentRef.current && showMoreInfo) {
        // Wait a bit for content to render, then measure
        setTimeout(() => {
          if (contentRef.current) {
            const scrollHeight = contentRef.current.scrollHeight;
            const clientHeight = contentRef.current.clientHeight;
            
            // Calculate padding needed to make all content scrollable
            // If content is longer than container, add padding to ensure scroll access
            const paddingNeeded = scrollHeight > clientHeight 
              ? Math.max(60, scrollHeight - clientHeight + 40) // Extra padding for long content
              : 60; // Minimal padding for short content
            
            setContentHeight(paddingNeeded);
          }
        }, 100);
      } else {
        // Reset when collapsed
        setContentHeight(60);
      }
    };

    measureContentHeight();
    
    // Also measure when window resizes
    window.addEventListener('resize', measureContentHeight);
    return () => window.removeEventListener('resize', measureContentHeight);
  }, [showMoreInfo, currentIndex, potentialMatches]);

  // Removed swipe gesture handlers

  const handleCardAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent action if dragging occurred
  // Swipe gesture state removed; always allow click navigation

    // Get click position relative to the container
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const containerWidth = rect.width;
    const isLeftSide = clickX < containerWidth / 2;

    if (currentCardType === 'photo') {
      // Handle image navigation for photo cards
      if (!currentMatch) return;

      if (currentMatchImages.length > 1) {
        if (isLeftSide) {
          // Go to previous image
          setImageIndex(prevIndex => prevIndex > 0 ? prevIndex - 1 : currentMatchImages.length - 1);
        } else {
          // Go to next image or next card type
          if (imageIndex < currentMatchImages.length - 1) {
            setImageIndex(prevIndex => prevIndex + 1);
          } else {
            // Move to next card type if available
            const currentCardIndex = cardOrder.indexOf(currentCardType);
            if (currentCardIndex < cardOrder.length - 1) {
              setCurrentCardType(cardOrder[currentCardIndex + 1]);
              setImageIndex(0);
            } else {
              setImageIndex(0); // Loop back to first image
            }
          }
        }
      } else {
        // Single-image case: navigate between card types
        const currentCardIndex = cardOrder.indexOf(currentCardType);
        if (isLeftSide) {
          if (currentCardIndex > 0) {
            const prevCardType = cardOrder[currentCardIndex - 1];
            setCurrentCardType(prevCardType);
            if (prevCardType === 'photo') setImageIndex(0);
          }
        } else {
          if (currentCardIndex < cardOrder.length - 1) {
            setCurrentCardType(cardOrder[currentCardIndex + 1]);
            setImageIndex(0);
          } else {
            // Loop back to photo
            setCurrentCardType('photo');
            setImageIndex(0);
          }
        }
      }
    } else {
      // Handle navigation for other card types
      const currentCardIndex = cardOrder.indexOf(currentCardType);
      
      if (isLeftSide) {
        // Go to previous card type
        if (currentCardIndex > 0) {
          const prevCardType = cardOrder[currentCardIndex - 1];
          setCurrentCardType(prevCardType);
          if (prevCardType === 'photo') {
            setImageIndex(currentMatchImages.length - 1); // Go to last image
          }
        }
      } else {
        // Go to next card type or loop back
        if (currentCardIndex < cardOrder.length - 1) {
          setCurrentCardType(cardOrder[currentCardIndex + 1]);
        } else {
          setCurrentCardType('photo');
          setImageIndex(0);
        }
      }
    }
  };

  // Function to load more matches when running low - optimized for 5 at a time
  const loadMoreMatches = useCallback(async () => {
    if (!currentUser?.id || isLoading || isLoadingMore) return;
    
    try {
      setIsLoadingMore(true);
      
      // Get additional profiles (exclude current ones)
      const currentIds = potentialMatches.map(match => match.id);
      const excludedIds = [...currentIds, currentUser.id];
      
      // Get recently interacted users to exclude
      const [
        { data: likedUsers },
        { data: blockedUsers },
        { data: recentPasses }
      ] = await Promise.all([
        supabase
          .from('likes')
          .select('liked_id')
          .eq('liker_id', currentUser.id),
        supabase
          .from('blocks')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`),
        supabase
          .from('passes')
          .select('passed_id, passed_at')
          .match({ passer_id: currentUser.id })
          .gte('passed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ]);

      const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
      const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
      const hiddenPassedIds = recentPasses?.map(p => p.passed_id) || [];
      excludedIds.push(...likedUserIds, ...blockedUserIds, ...hiddenPassedIds);
      
      const { data: newProfiles, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized')
        .not('id', 'in', `(${excludedIds.join(',')})`)
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .limit(8); // Load 8 profiles at a time for better performance and smoother experience

      if (error) throw error;

      // Apply same filtering logic as original fetch with distance caching
      let filteredProfiles = newProfiles || [];
      const userMaxDistance = currentUser.max_distance || currentUser.distance_preference || 50;
      
      if (currentUser.latitude && currentUser.longitude) {
        // Create distance cache for new profiles too
        const profileDistances = new Map();
        
        filteredProfiles = filteredProfiles.filter(profile => {
          if (!profile.latitude || !profile.longitude) {
            return profile.country === currentUser.country;
          }
          
          let distance = profileDistances.get(profile.id);
          if (!distance) {
            distance = calculateDistance(
              currentUser.latitude,
              currentUser.longitude,
              profile.latitude,
              profile.longitude
            );
            profileDistances.set(profile.id, distance);
          }
          
          return distance <= (userMaxDistance * 2); // Reduced from 3x to 2x for performance
        });
      }

      // Apply age filtering
      const userMinAge = currentUser.min_age || 18;
      const userMaxAge = currentUser.max_age || 99;
      filteredProfiles = filteredProfiles.filter(profile => {
        if (!profile.date_of_birth) return false;
        const age = calculateAge(profile.date_of_birth);
        return age >= userMinAge && age <= userMaxAge;
      });

      const profilesWithImages = filteredProfiles.map(profile => ({
        ...profile,
        images: []
      }));

      const shuffled = profilesWithImages.sort(() => 0.5 - Math.random());
      
      // Add new profiles to the end of existing ones
      setPotentialMatches(prev => [...prev, ...shuffled]);
      
      // Preload images for the new profiles
      if (shuffled.length > 0) {
        await preloadNextProfileImages(shuffled, userImages, 0);
      }
    } catch (error) {
  // ...removed log...
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentUser, allowedGenders, potentialMatches, calculateAge, calculateDistance, isLoading, isLoadingMore, userImages, preloadNextProfileImages, loadFullImages]);

  // Auto-load more matches when getting low (3 profiles left) for seamless experience
  useEffect(() => {
    if (potentialMatches.length - currentIndex <= 3 && !isLoadingMore && !isLoading) {
      loadMoreMatches();
    }
  }, [currentIndex, potentialMatches.length, loadMoreMatches, isLoadingMore, isLoading]);

  // Background loading - preload next batch more frequently for smooth swiping
  useEffect(() => {
    if (currentIndex > 0 && currentIndex % 2 === 0 && !isLoadingMore && !isLoading) {
      loadMoreMatches();
    }
  }, [currentIndex, loadMoreMatches, isLoadingMore, isLoading]);
  // Function to check if a profile is verified (90%+ completion with photos and basic info)
  const calculateProfileVerification = useCallback((profile: PotentialMatch) => {
    if (!profile) return false;

    // Check if profile has at least 3 images (similar to ProfilePage logic)
    const profileImages = userImages[profile.id] || [];
    const hasEnoughPhotos = profileImages.length >= 3;

    // Check basic info completion (fields available in PotentialMatch)
    const hasBasicInfo = !!(
      profile.first_name?.trim() &&
      profile.last_name?.trim() &&
      profile.bio?.trim() &&
      profile.date_of_birth
    );

    // Check other available completion criteria
    const hasLocation = !!(profile.city?.trim() && profile.country?.trim());
    const hasWork = !!(profile.occupation?.trim() && profile.education_level);
    const hasInterests = (profile.interests || []).length >= 3;

    // Simplified completion check - count completed sections out of 5 key areas
    let completedSections = 0;
    const totalSections = 5;

    if (hasEnoughPhotos) completedSections += 1; // Photos
    if (hasBasicInfo) completedSections += 1; // Basic info 
    if (hasLocation) completedSections += 1; // Location
    if (hasWork) completedSections += 1; // Work & Education
    if (hasInterests) completedSections += 1; // Interests

    const completionPercentage = Math.round((completedSections / totalSections) * 100);

    // Return verified if 80%+ (4/5 sections) AND has photos + basic info
    return completionPercentage >= 80 && hasEnoughPhotos && hasBasicInfo;
  }, [userImages]);

  // Optimistic UI: move to next card instantly, then process like in background
  const handleLike = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // FIRST: Update database swipe count (for both free and premium users)
    let usageResult;
    if (!isPremium) {
      usageResult = await checkUsageLimit('swipe');
      if (!usageResult.success) {
        setIsOutOfSwipes(true);
        toast({
          title: 'Daily Limit Reached',
          description: usageResult.message + ' Upgrade to Premium for unlimited swipes.',
          variant: 'destructive'
        });
        return;
      }
    } else {
      // For premium users, we still need to track swipes for profile completion restrictions
      try {
        await supabase.rpc('update_user_usage', {
          user_id_param: currentUser.id,
          usage_type: 'swipe',
          increment_by: 1
        });
      } catch (error) {
  // ...removed log...
      }
    }

    // Update today's swipe count for UI
    setTodaySwipeCount(prev => prev + 1);

    // SECOND: Check profile completion restrictions AFTER updating database
    const restrictionCheck = await checkSwipeRestrictions(
      currentUser.id,
      profileCompletion,
      isPremium
    );

    if (!restrictionCheck.canSwipe) {
      if (restrictionCheck.reason === 'Profile completion required') {
        setShowProfileCompletionModal(true);
        toast({
          title: '✨ Complete Your Profile!',
          description: 'Help others see the real you so you can connect with genuine people who share your interests! Go to your profile and update your profile to more than 75% to continue swiping.',
          variant: 'default',
        });
        return;
      } else if (restrictionCheck.reason === 'Daily limit reached') {
        setIsOutOfSwipes(true);
        toast({
          title: 'Daily Limit Reached',
          description: 'You\'ve reached your daily swipe limit. Come back tomorrow or upgrade to Premium!',
          variant: 'destructive'
        });
        return;
      }
    }

    moveToNext(); // Move UI only after all checks pass

    try {
      // First check if like already exists to prevent duplicate key error
      const { data: existingLike, error: checkError } = await supabase
        .from('likes')
        .select('id')
        .match({ liker_id: currentUser.id, liked_id: currentMatch.id })
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      // Only insert if like doesn't already exist
      if (!existingLike) {
        const { error: insertError } = await supabase
          .from('likes')
          .insert({ liker_id: currentUser.id, liked_id: currentMatch.id });

        if (insertError) {
          // Handle specific duplicate key error gracefully
          if (insertError.code === '23505') {
            // Like already exists, skipping insert
          } else {
            throw insertError;
          }
        }
      }

      // Check for mutual like
      const { data: mutualLike, error: mutualError } = await supabase
        .from('likes')
        .select('*')
        .match({ liker_id: currentMatch.id, liked_id: currentUser.id })
        .maybeSingle();

      if (mutualError) {
  // ...removed log...
      }

      if (mutualLike) {
        setMatchedUser(currentMatch);
        setShowMatchAnimation(true);
      }
    } catch (error) {
  // ...removed log...
      toast({
        title: 'Error',
        description: 'Failed to like user. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Optimistic UI: move to next card instantly, then process pass in background
  const handlePass = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // FIRST: Update database swipe count (for both free and premium users)
    if (!isPremium) {
      const usageResult = await checkUsageLimit('swipe');
      if (!usageResult.success) {
        setIsOutOfSwipes(true);
        toast({
          title: 'Daily Limit Reached',
          description: usageResult.message + ' Upgrade to Premium for unlimited swipes.',
          variant: 'destructive'
        });
        return;
      }
    } else {
      // For premium users, we still need to track swipes for profile completion restrictions
      try {
        await supabase.rpc('update_user_usage', {
          user_id_param: currentUser.id,
          usage_type: 'swipe',
          increment_by: 1
        });
      } catch (error) {
  // ...removed log...
      }
    }

    // Update today's swipe count for UI
    setTodaySwipeCount(prev => prev + 1);

    // SECOND: Check profile completion restrictions AFTER updating database
    const restrictionCheck = await checkSwipeRestrictions(
      currentUser.id,
      profileCompletion,
      isPremium
    );

    if (!restrictionCheck.canSwipe) {
      if (restrictionCheck.reason === 'Profile completion required') {
        setShowProfileCompletionModal(true);
        toast({
          title: '✨ Complete Your Profile!',
          description: 'Help others see the real you so you can connect with genuine people who share your interests!',
          variant: 'default',
        });
        return;
      } else if (restrictionCheck.reason === 'Daily limit reached') {
        setIsOutOfSwipes(true);
        toast({
          title: 'Daily Limit Reached',
          description: 'You\'ve reached your daily swipe limit. Come back tomorrow or upgrade to Premium!',
          variant: 'destructive'
        });
        return;
      }
    }

    // Add to passed users list for potential reverse
    setPassedUsers(prev => [{
      user_id: currentMatch.id,
      passed_at: new Date()
    }, ...prev.slice(0, 9)]); // Keep only last 10 passed users

    moveToNext(); // Move UI only after all checks pass

    try {
      // Check if pass already exists to prevent duplicate key error
      const { data: existingPass, error: checkError } = await supabase
        .from('passes')
        .select('id')
        .match({ passer_id: currentUser.id, passed_id: currentMatch.id })
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      // Only insert if pass doesn't already exist
      if (!existingPass) {
        const { error: insertError } = await supabase.from('passes').insert({
          passer_id: currentUser.id,
          passed_id: currentMatch.id
        });

        if (insertError) {
          // Handle specific duplicate key error gracefully
          if (insertError.code === '23505') {
            // Pass already exists, skipping insert
          } else {
            throw insertError;
          }
        }
      }
    } catch (err) {
  // ...removed log...
      toast({
        title: 'Error',
        description: 'Could not skip this profile.',
        variant: 'destructive'
      });
    }
  };

  const handleReverse = async () => {
    if (passedUsers.length === 0) return;

    // Check reverse dislike limit for free users
    if (!isPremium) {
      const usageResult = await checkUsageLimit('reverse_dislike');
      if (!usageResult.success) {
        toast({
          title: 'Daily Limit Reached',
          description: usageResult.message + ' Upgrade to Premium for unlimited reverse dislikes.',
          variant: 'destructive'
        });
        return;
      }
    }

    const lastPassedUser = passedUsers[0];
    
    try {
      // Actually delete the pass record from the database
      const { error: deleteError } = await supabase
        .from('passes')
        .delete()
        .match({ 
          passer_id: currentUser.id, 
          passed_id: lastPassedUser.user_id 
        });

      if (deleteError) {
  // ...removed log...
        toast({
          title: 'Error',
          description: 'Could not reverse the dislike. Please try again.',
          variant: 'destructive'
        });
        return;
      }

      // Find the passed user data and bring them back to the front
      const passedUserData = potentialMatches.find(match => match.id === lastPassedUser.user_id);
      
      if (passedUserData) {
        // Insert the user at the current index so they appear as the next card
        const newMatches = [...potentialMatches];
        newMatches.splice(currentIndex, 0, passedUserData);
        setPotentialMatches(newMatches);
      } else {
        // If not in current matches, try to fetch their profile data
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized')
          .eq('id', lastPassedUser.user_id)
          .eq('account_status', 'active')
          .single();

        if (!profileError && profileData) {
          // Add the user back with empty images array (will be loaded when needed)
          const userWithImages = { ...profileData, images: [] };
          const newMatches = [...potentialMatches];
          newMatches.splice(currentIndex, 0, userWithImages);
          setPotentialMatches(newMatches);
        }
      }

      // Remove from passed users list
      setPassedUsers(prev => prev.slice(1));

      // Update reverse usage count if not premium
      if (!isPremium) {
        setReverseUsageToday(prev => prev + 1);
      }

      toast({
        title: 'Undo Successful',
        description: 'Your last dislike has been reversed.',
        variant: 'default'
      });

    } catch (error) {
  // ...removed log...
      toast({
        title: 'Error',
        description: 'Could not reverse the dislike. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const moveToNext = () => {
    if (currentIndex < potentialMatches.length - 1) {
      setCurrentIndex(currentIndex + 1);
      
      // Load more matches when we're getting close to the end (within 5 profiles)
      if (currentIndex >= potentialMatches.length - 5) {
        loadMoreMatches();
      }
    } else {
      fetchPotentialMatches();
      setCurrentIndex(0);
    }
  };

  const handleStartChat = (userId: string) => {
    setShowMatchAnimation(false);
    if (onNavigateToChat) {
      onNavigateToChat(userId);
    }
  };

  const handleCloseMatch = () => {
    setShowMatchAnimation(false);
    setMatchedUser(null);
  };

  if (showMatchAnimation && matchedUser) {
    return (
      <MatchAnimation
        currentUserName={currentUser?.first_name || 'You'}
        matchedUserName={`${matchedUser.first_name} ${matchedUser.last_name}`}
        matchedUserImage={matchedUser.images?.[0]}
        matchedUserId={matchedUser.id}
        onClose={handleCloseMatch}
        onStartChat={handleStartChat}
      />
    );
  }

  if (showPremiumUpgrade) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="w-full max-w-lg">
          <PremiumUpgrade currentUser={currentUser} onClose={() => setShowPremiumUpgrade(false)} />
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={() => setShowPremiumUpgrade(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (isOutOfSwipes) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold mb-2">You're out of swipes for today!</h2>
            <p className="text-gray-600 mb-4">
              {isPremium 
                ? "Refreshing your matches..." 
                : "Free users get 12 swipes per day. Come back tomorrow or upgrade to Premium for unlimited swipes!"
              }
            </p>
            <div className="space-y-3">
            {!isPremium && (
              <Button 
                onClick={() => setShowPremiumUpgrade(true)} 
                className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold"
              >
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to Premium
              </Button>
            )}
              <Button 
                onClick={() => {
                  setIsOutOfSwipes(false);
                  fetchPotentialMatches();
                }} 
                variant="outline" 
                className="w-full"
              >
                Check Again Tomorrow
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentMatch = potentialMatches[currentIndex];
  // Use preloaded images for current and next card
  const currentMatchImages = currentMatch ? (userImages[currentMatch.id] || []) : [];
  const nextMatch = potentialMatches[currentIndex + 1];
  const nextMatchImages = nextMatch ? (userImages[nextMatch.id] || []) : [];

  if (!currentMatch) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold mb-2">No more profiles</h2>
            <p className="text-gray-600 mb-4">
              You've seen all available profiles. Check back later for new matches!
            </p>

            <Button onClick={fetchPotentialMatches} className="w-full">
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Removed swipe overlay opacity and transform logic
  const cardTransform = '';



  return (
    <div className="h-full w-full fixed left-0 overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800"
         style={{ 
           top: '0px',
           height: '100vh',
           touchAction: 'pan-x pan-y',
           userSelect: 'none',
           WebkitUserSelect: 'none',
           WebkitTouchCallout: 'none'
         }}>
      
      {/* Adinkra Bar at the top */}
      <div className="relative z-10">
        <AdinkraBar onSymbolClick={setTooltipIdx} />
      </div>

      {/* --- Swipe Guide Popup for New Users --- */}
      {showSwipeGuide && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.12)', cursor: 'pointer' }}
          onClick={() => {
            setShowSwipeGuide(false);
            localStorage.setItem('driplove_swipe_guide_shown', 'true');
          }}
        >
          <style>{`
            @keyframes fingerSwipeLeft {
              0% { transform: translateX(0) scale(1); opacity: 1; }
              25% { transform: translateX(-40px) scale(1.1); opacity: 0.9; }
              50% { transform: translateX(-20px) scale(1); opacity: 1; }
              75% { transform: translateX(0) scale(0.95); opacity: 0.8; }
              100% { transform: translateX(0) scale(1); opacity: 1; }
            }
            @keyframes fingerSwipeRight {
              0% { transform: translateX(0) scale(1); opacity: 1; }
              25% { transform: translateX(40px) scale(1.1); opacity: 0.9; }
              50% { transform: translateX(20px) scale(1); opacity: 1; }
              75% { transform: translateX(0) scale(0.95); opacity: 0.8; }
              100% { transform: translateX(0) scale(1); opacity: 1; }
            }
            @keyframes pulseGlow {
              0% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.4); }
              70% { box-shadow: 0 0 0 10px rgba(236, 72, 153, 0); }
              100% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0); }
            }
            .finger-left {
              animation: fingerSwipeLeft 2s ease-in-out infinite;
              font-size: 2.5rem;
              display: block;
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
            }
            .finger-right {
              animation: fingerSwipeRight 2s ease-in-out infinite;
              font-size: 2.5rem;
              display: block;
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
            }
            .swipe-card {
              animation: pulseGlow 2s infinite;
            }
          `}</style>
          <div className="swipe-card bg-gradient-to-br from-white to-pink-50 rounded-3xl px-8 py-8 flex flex-col items-center shadow-2xl border border-pink-100" style={{ maxWidth: 360, opacity: 0.97 }}>
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">💕 Start Swiping! 💕</h3>
            <div className="flex flex-row gap-12 mb-4">
              {/* Swipe Left */}
              <div className="flex flex-col items-center">
                <div className="bg-red-50 rounded-full p-3 mb-2 border-2 border-red-200">
                  <span className="finger-left" role="img" aria-label="finger left">👆</span>
                </div>
                <div className="text-xl mb-1" style={{ color: '#ef4444' }}>← ← ←</div>
                <span className="text-sm font-semibold text-red-600">Nope</span>
                <span className="text-xs text-gray-500 mt-1">Swipe Left</span>
              </div>
              {/* Swipe Right */}
              <div className="flex flex-col items-center">
                <div className="bg-green-50 rounded-full p-3 mb-2 border-2 border-green-200">
                  <span className="finger-right" role="img" aria-label="finger right">👆</span>
                </div>
                <div className="text-xl mb-1" style={{ color: '#10b981' }}>→ → →</div>
                <span className="text-sm font-semibold text-green-600">Like</span>
                <span className="text-xs text-gray-500 mt-1">Swipe Right</span>
              </div>
            </div>
            <p className="text-xs text-gray-600 text-center mt-2">Tap anywhere to close</p>
          </div>
        </div>
      )}

      {/* Listen Intro Button - Outside match card area */}
      <div className="absolute top-20 right-2 z-50">
        <button 
          className="bg-gradient-to-br from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white rounded-full p-4 shadow-xl transition-all duration-200 hover:scale-110 active:scale-95 border-2 border-white/30"
          onClick={() => {
            // Add voice intro functionality here
            console.log('Play voice intro for:', currentMatch.first_name);
          }}
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2c-1.66 0-3 1.34-3 3v6c0 1.66 1.34 3 3 3s3-1.34 3-3V5c0-1.66-1.34-3-3-3zM17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>
      </div>

      {/* Main Profile Card Area */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 pt-2 relative" style={{ height: 'calc(100vh - 160px)', marginBottom: '90px' }}>
  {/* Next Profile Card - Behind Current Card - Removed as requested */}

        {/* Profile Info Above Card - Outside the card container */}
        <div className="w-full max-w-sm mx-auto mb-4 z-20">
          <div className="bg-transparent px-4 py-4">
            {/* Name, Age, Distance */}
            <div className="text-center mb-3">
              <h2 
                className="text-2xl font-bold text-white mb-1"
                style={{
                  textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.3)',
                  WebkitTextStroke: '0.5px rgba(255,255,255,0.1)'
                }}
              >
                {currentMatch.first_name}, {calculateAge(currentMatch.date_of_birth)}
              </h2>
              <span 
                className="text-white/95 text-sm font-medium"
                style={{
                  textShadow: '0 2px 6px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.5)'
                }}
              >
                {userDistances[currentMatch.id] 
                  ? `${Math.round(userDistances[currentMatch.id])}km away`
                  : `${currentMatch.city || 'Location not set'}`}
              </span>
            </div>
            
            {/* Interests */}
            {currentMatch.interests?.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {currentMatch.interests.slice(0, 3).map((interest, index) => (
                  <span 
                    key={index}
                    className="px-3 py-1.5 bg-white/25 backdrop-blur-sm text-white rounded-full text-sm font-semibold border border-white/20"
                    style={{
                      textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                    }}
                  >
                    {interest}
                  </span>
                ))}
                {currentMatch.interests.length > 3 && (
                  <button 
                    onClick={() => setShowAllInterests(true)}
                    className="px-3 py-1.5 bg-white/25 backdrop-blur-sm text-white rounded-full text-sm font-semibold border border-white/20 hover:bg-white/35 transition-all duration-200 cursor-pointer"
                    style={{
                      textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                    }}
                  >
                    +{currentMatch.interests.length - 3}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Current Profile Card */}
        <div
          className={`relative w-full max-w-[22rem] mx-auto bg-white rounded-3xl shadow-2xl z-10 transition-all duration-300 ${
            showMoreInfo ? 'overflow-visible' : 'overflow-hidden'
          }`}
          style={{
            minHeight: '420px',
            maxHeight: '420px'
          }}
        >
          {/* Swipe gesture overlays and state fully removed */}

          {/* Profile Card Container - Dynamic Content */}
          <div 
            className="relative h-[420px] select-none overflow-hidden rounded-t-3xl"
            // Swipe gesture handlers fully removed
            onClick={handleCardAreaClick}
            style={{ cursor: 'pointer' }}
          >
            {/* Card Content Based on Current Card Type */}
            {currentCardType === 'photo' ? (
              <>
                {/* Photo Card */}
                {currentMatchImages.length > 0 ? (
                  <>
                    {imageLoading && (
                      <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
                      </div>
                    )}
                    <img
                      src={getOptimizedUrl(currentMatchImages[imageIndex])}
                      alt={`${currentMatch.first_name} ${currentMatch.last_name}`}
                      className="w-full h-full object-cover"
                      draggable={false}
                      onLoadStart={() => setImageLoading(true)}
                      onLoad={() => setImageLoading(false)}
                      onError={() => setImageLoading(false)}
                      style={{
                        touchAction: 'manipulation',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none'
                      }}
                    />
                  </>
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <span className="text-6xl font-bold text-white drop-shadow-lg">
                      {currentMatch.first_name?.[0]}{currentMatch.last_name?.[0]}
                    </span>
                  </div>
                )}
              </>
            ) : currentCardType === 'about' ? (
              <>
                {/* About Card */}
                <DominantColorImageBg imageUrl={currentMatchImages[0]}>
                  <div className="absolute inset-0 flex flex-col justify-center items-center p-6 text-white">
                    <div className="text-center space-y-4 max-w-xs">
                      <h3 className="text-2xl font-bold mb-4">About {currentMatch.first_name}</h3>
                      {currentMatch.bio && (
                        <p className="text-lg leading-relaxed font-medium text-white/95 drop-shadow-lg">
                          {currentMatch.bio}
                        </p>
                      )}
                      {currentMatch.occupation && (
                        <div className="mt-4">
                          <p className="text-sm font-semibold text-white/90 drop-shadow">
                            {currentMatch.occupation}
                          </p>
                        </div>
                      )}
                      {currentMatch.education_level && (
                        <div>
                          <p className="text-sm text-white/80 drop-shadow">
                            {currentMatch.education_level}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </DominantColorImageBg>
              </>
            ) : currentCardType === 'funfact' ? (
              <>
                {/* Fun Fact Card */}
                <DominantColorImageBg imageUrl={currentMatchImages[0]}>
                  <div className="absolute inset-0 flex flex-col justify-center items-center p-6 text-white">
                    <div className="text-center space-y-4 max-w-xs">
                      <h3 className="text-2xl font-bold mb-4">Fun Fact</h3>
                      {currentMatch.fun_fact && (
                        <p className="text-lg leading-relaxed font-medium text-white/95 drop-shadow-lg">
                          {currentMatch.fun_fact}
                        </p>
                      )}
                    </div>
                  </div>
                </DominantColorImageBg>
              </>
            ) : currentCardType === 'questions' ? (
              <>
                {/* Questions Card */}
                <DominantColorImageBg imageUrl={currentMatchImages[0]}>
                  <div className="absolute inset-0 flex flex-col justify-center items-center p-6 text-white">
                    <div className="text-center space-y-6 max-w-xs">
                      <h3 className="text-2xl font-bold mb-4">Get to Know Me</h3>
                      {currentMatch.perfect_first_date && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-white/90 drop-shadow">
                            Perfect First Date:
                          </p>
                          <p className="text-lg leading-relaxed font-medium text-white/95 drop-shadow-lg">
                            {currentMatch.perfect_first_date}
                          </p>
                        </div>
                      )}
                      {currentMatch.last_googled && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-white/90 drop-shadow">
                            Last Googled:
                          </p>
                          <p className="text-lg leading-relaxed font-medium text-white/95 drop-shadow-lg">
                            {currentMatch.last_googled}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </DominantColorImageBg>
              </>
            ) : null}

            {/* Card indicators */}
            <div className="absolute top-4 left-4 right-4 flex gap-1">
              {currentCardType === 'photo' && currentMatchImages.length > 1 ? (
                // Photo indicators for image navigation
                currentMatchImages.map((_, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                      idx === imageIndex ? 'bg-white' : 'bg-white/40'
                    }`}
                  />
                ))
              ) : (
                // Card type indicators
                cardOrder.map((cardType, idx) => {
                  const isActive = cardType === currentCardType;
                  return (
                    <div
                      key={cardType}
                      className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                        isActive ? 'bg-white' : 'bg-white/40'
                      }`}
                    />
                  );
                })
              )}
            </div>

            {/* Navigation hint arrows */}
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <ChevronLeft className="w-6 h-6 text-white/60 drop-shadow-lg" />
            </div>
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <ChevronRight className="w-6 h-6 text-white/60 drop-shadow-lg" />
            </div>

            {/* Navigation areas */}
            <>
              {/* Left navigation area */}
              <div 
                className="absolute left-0 top-0 w-1/2 h-full z-20 flex items-center justify-start pl-2 cursor-pointer active:bg-black/5"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  if (currentCardType === 'photo' && currentMatchImages.length > 1) {
                    // Navigate through images
                    setImageIndex(prevIndex => 
                      prevIndex > 0 ? prevIndex - 1 : currentMatchImages.length - 1
                    );
                  } else {
                    // Navigate to previous card type
                    const currentCardIndex = cardOrder.indexOf(currentCardType);
                    if (currentCardIndex > 0) {
                      const prevCardType = cardOrder[currentCardIndex - 1];
                      setCurrentCardType(prevCardType);
                      if (prevCardType === 'photo') {
                        setImageIndex(currentMatchImages.length - 1);
                      }
                    }
                  }
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                style={{ backgroundColor: 'transparent' }}
              >
                <div className="bg-black/30 backdrop-blur-sm rounded-full p-1.5 opacity-0 hover:opacity-100 active:opacity-100 transition-all duration-200">
                  <ChevronLeft className="w-5 h-5 text-white drop-shadow-lg" />
                </div>
              </div>

              {/* Show More button anchored bottom-left inside the card */}
              {(currentMatch.bio || currentMatch.occupation || currentMatch.education_level || (currentMatch.interests && currentMatch.interests.length > 0)) && (
                <button 
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowMoreInfo(true); }}
                  className="absolute left-3 bottom-3 z-30 px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-full text-xs font-medium shadow-lg border border-white/20"
                >
                  More Info
                </button>
              )}

              {/* Right navigation area */}
              <div 
                className="absolute right-0 top-0 w-1/2 h-full z-20 flex items-center justify-end pr-2 cursor-pointer active:bg-black/5"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  if (currentCardType === 'photo') {
                    if (currentMatchImages.length > 1 && imageIndex < currentMatchImages.length - 1) {
                      // Navigate to next image
                      setImageIndex(prevIndex => prevIndex + 1);
                    } else {
                      // Navigate to next card type
                      const currentCardIndex = cardOrder.indexOf(currentCardType);
                      if (currentCardIndex < cardOrder.length - 1) {
                        setCurrentCardType(cardOrder[currentCardIndex + 1]);
                        setImageIndex(0);
                      } else {
                        // Loop back to first image of photos
                        setImageIndex(0);
                      }
                    }
                  } else {
                    // Navigate to next card type
                    const currentCardIndex = cardOrder.indexOf(currentCardType);
                    if (currentCardIndex < cardOrder.length - 1) {
                      setCurrentCardType(cardOrder[currentCardIndex + 1]);
                    } else {
                      setCurrentCardType('photo');
                      setImageIndex(0);
                    }
                  }
                }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); }}
                style={{ backgroundColor: 'transparent' }}
              >
                <div className="bg-black/30 backdrop-blur-sm rounded-full p-1.5 opacity-0 hover:opacity-100 active:opacity-100 transition-all duration-200">
                  <ChevronRight className="w-5 h-5 text-white drop-shadow-lg" />
                </div>
              </div>
            </>



            {/* Gradient overlay for better text readability */}
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          </div>

          {/* Profile Info - Minimized removed to eliminate bottom white space */}
            
            {/* Expandable Details - overlay that covers the match card with close (X) above */}
            {showMoreInfo && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40 bg-black/30"
                  onClick={() => setShowMoreInfo(false)}
                />
                {/* Panel sized to the card area */}
                <div
                  className="fixed left-1/2 z-50 w-full max-w-sm px-4 animate-fade-in"
                  style={{ transform: 'translateX(-50%)', top: '230px' }}
                >
                  <div className="relative">
                    {/* Close button removed – backdrop handles closing on outside click */}
                    <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-2xl overflow-y-auto max-h-[60vh]">
                      <div className="px-4 py-3 space-y-3">
                    {currentMatch.bio && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1 text-sm">About</h4>
                        <p className="text-gray-600 text-xs leading-relaxed">{currentMatch.bio}</p>
                      </div>
                    )}
                    {(currentMatch.occupation || currentMatch.education_level) && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {currentMatch.occupation && (
                          <div>
                            <h5 className="font-medium text-gray-900">Work</h5>
                            <p className="text-gray-600">{currentMatch.occupation}</p>
                          </div>
                        )}
                        {currentMatch.education_level && (
                          <div>
                            <h5 className="font-medium text-gray-900">Education</h5>
                            <p className="text-gray-600">{currentMatch.education_level}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Show all interests in expanded view */}
                    {currentMatch.interests?.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1.5 text-sm">Interests</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {currentMatch.interests.map((interest, index) => (
                            <span
                              key={index}
                              className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs"
                            >
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Additional profile information */}
                    {(currentMatch.drinking || currentMatch.smoking || currentMatch.exercise_level) && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2 text-sm">Lifestyle</h4>
                        <div className="space-y-2">
                          {currentMatch.drinking && (
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Drinking</span>
                              <span className="text-gray-900 capitalize">{currentMatch.drinking}</span>
                            </div>
                          )}
                          {currentMatch.smoking && (
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Smoking</span>
                              <span className="text-gray-900 capitalize">{currentMatch.smoking}</span>
                            </div>
                          )}
                          {currentMatch.exercise_level && (
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Exercise</span>
                              <span className="text-gray-900 capitalize">{currentMatch.exercise_level}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
        </div>
      </div>

      {/* Bottom Adinkra Bar with Action Buttons */}
      <div className="absolute left-0 right-0 z-20 bg-gradient-to-t from-black/30 to-transparent pb-2 pt-4" style={{ bottom: '70px' }}>
        {/* Adinkra Pattern Background */}
        <div
          className="w-full flex justify-center items-center relative"
          style={{
            backgroundImage: `url('data:image/svg+xml;utf8,<svg width="240" height="50" viewBox="0 0 240 50" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="50" fill="%23007bdb"/><g><rect x="0" y="0" width="24" height="50" fill="%23ffc72c"/><rect x="24" y="0" width="24" height="50" fill="%23007bdb"/><rect x="48" y="0" width="24" height="50" fill="%23ffc72c"/><rect x="72" y="0" width="24" height="50" fill="%23007bdb"/><rect x="96" y="0" width="24" height="50" fill="%23ffc72c"/><rect x="120" y="0" width="24" height="50" fill="%23007bdb"/><rect x="144" y="0" width="24" height="50" fill="%23ffc72c"/><rect x="168" y="0" width="24" height="50" fill="%23007bdb"/><rect x="192" y="0" width="24" height="50" fill="%23ffc72c"/><rect x="216" y="0" width="24" height="50" fill="%23007bdb"/></g><g><polygon points="24,0 36,25 24,50 48,50 36,25 48,0" fill="%23e63946"/><polygon points="72,0 84,25 72,50 96,50 84,25 96,0" fill="%2300b159"/><polygon points="120,0 132,25 120,50 144,50 132,25 144,0" fill="%23e63946"/><polygon points="168,0 180,25 168,50 192,50 180,25 192,0" fill="%2300b159"/></g><g><rect x="0" y="0" width="240" height="8" fill="%23fff" fill-opacity="0.15"/><rect x="0" y="42" width="240" height="8" fill="%23fff" fill-opacity="0.15"/></g><g><rect x="23" y="0" width="2" height="50" fill="%23fff"/><rect x="47" y="0" width="2" height="50" fill="%23fff"/><rect x="71" y="0" width="2" height="50" fill="%23fff"/><rect x="95" y="0" width="2" height="50" fill="%23fff"/><rect x="119" y="0" width="2" height="50" fill="%23fff"/><rect x="143" y="0" width="2" height="50" fill="%23fff"/><rect x="167" y="0" width="2" height="50" fill="%23fff"/><rect x="191" y="0" width="2" height="50" fill="%23fff"/><rect x="215" y="0" width="2" height="50" fill="%23fff"/></g></svg>')`,
            backgroundRepeat: 'repeat',
            backgroundSize: '240px 50px',
            minHeight: '50px',
          }}
        >
          {/* Action Buttons Container */}
          <div className="flex items-center justify-center gap-4 px-6 py-2 bg-black/20 rounded-full backdrop-blur-sm">
            {/* Pass Button (Left) */}
            <button
              onClick={handlePass}
              className="w-12 h-12 bg-red-500/30 hover:bg-red-500/50 border-2 border-red-400 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform backdrop-blur-sm"
            >
              <X className="w-4 h-4 text-red-100" />
            </button>

            {/* Reverse Button (Center) */}
            <div className="relative">
              <button
                onClick={handleReverse}
                disabled={!canReverse}
                className="w-12 h-12 bg-yellow-500/30 hover:bg-yellow-500/50 disabled:opacity-30 border-2 border-yellow-400 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform backdrop-blur-sm"
              >
                <Undo2 className="w-4 h-4 text-yellow-100" />
              </button>
              {!isPremium && reversesLeft !== undefined && reversesLeft > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 text-black text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg">
                  {reversesLeft}
                </div>
              )}
            </div>

            {/* Like Button (Heart-Shaped with Logo) */}
            <div className="relative">
              <button
                onClick={handleLike}
                className="relative w-16 h-16 hover:scale-105 transition-transform shadow-lg border-2 border-yellow-400 flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #fef7cd 100%)',
                  borderRadius: '50%',
                  position: 'relative',
                  overflow: 'hidden',
                  padding: 0
                }}
              >
                <img 
                  src="/driplove-logo.png" 
                  alt="DripLove" 
                  className="w-10 h-10 object-contain z-10"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
        
        {/* Next profile image - same size as main card for smooth transition */}
        <div 
          className="absolute w-full max-w-[22rem] mx-auto bg-white rounded-3xl shadow-xl overflow-hidden z-0" 
          style={{ 
            borderRadius: '1.5rem',
            left: '50%',
            top: '0px',
            transform: 'translateX(-50%) translateY(8px) scale(0.98)',
            opacity: 0.7
          }}
        >
          <div className="absolute inset-0 h-[420px]">
            <img
              src="https://tgjsyyihabsovironesw.supabase.co/storage/v1/object/public/user-photos/07a638dd-2563-4649-9c75-a7451bab2bab/1756874666423-d6nr53q3awt.jpg?width=800&quality=85&format=webp"
              alt="Sandra's photo"
              className="w-full h-full object-cover rounded-3xl"
              draggable="false"
              loading="eager"
              style={{ borderRadius: '1.5rem' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none"></div>
          </div>
        </div>
        {/* Next match hidden for small screen display */}
// Helper component to extract and apply dominant color as background

        {/* ...existing code... */}
        <div
          className="h-full w-full relative z-10 flex flex-col"
          style={{
            boxShadow: '0 4px 16px 0 rgba(0,0,0,0.10)',
            opacity: 1
          }}
        >
      {/* Image area - flexible height that fills remaining space */}
          <div
            className="flex-1 cursor-pointer select-none relative transition-all duration-300 overflow-hidden"
            style={{
        // Fill available height reliably
        height: '100%'
            }}
            // All swipe gesture handlers removed
            onClick={handleCardAreaClick}
          >
            {/* ...existing code... */}
            {/* Swipe overlays and gesture state fully removed */}
            {/* ...existing code... */}
            <MatchCard
              match={currentMatch}
              imageIndex={imageIndex}
              showMoreInfo={showMoreInfo}
              isPremium={isPremium}
              userImages={currentMatchImages}
              currentUserLatitude={currentUser.latitude}
              currentUserLongitude={currentUser.longitude}
              onImageClick={() => handleCardAreaClick({} as React.MouseEvent<HTMLDivElement>)}
              onToggleInfo={() => setShowMoreInfo(!showMoreInfo)}
              calculateAge={calculateAge}
              calculateDistance={calculateDistance}
              isVerified={calculateProfileVerification(currentMatch)}
              getOptimizedUrl={getOptimizedUrl}
              preCalculatedDistance={userDistances[currentMatch.id]}
              isDetailsAreaOnly={true}
            />
          </div>
          {/* Info section - fixed compact height under the image */}
          <div className={`bg-white border-t border-gray-400 transition-all duration-300 flex-shrink-0 h-[64px] overflow-hidden`}>
            <div 
              ref={contentRef}
              className={`w-full p-1 overflow-hidden pb-2`} 
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                scrollBehavior: 'smooth',
                paddingBottom: '0.5rem'
              }}
            >
            <MatchCard
              match={currentMatch}
              imageIndex={imageIndex}
              showMoreInfo={showMoreInfo}
              isPremium={isPremium}
              userImages={currentMatchImages}
              currentUserLatitude={currentUser.latitude}
              currentUserLongitude={currentUser.longitude}
              onImageClick={() => handleCardAreaClick({} as React.MouseEvent<HTMLDivElement>)}
              onToggleInfo={() => setShowMoreInfo(!showMoreInfo)}
              calculateAge={calculateAge}
              calculateDistance={calculateDistance}
              isVerified={calculateProfileVerification(currentMatch)}
              getOptimizedUrl={getOptimizedUrl}
              preCalculatedDistance={userDistances[currentMatch.id]}
              isDetailsAreaOnly={true}
            />
            </div>
          </div>
        </div>

        {/* Adinkra Symbol Tooltip */}
        {tooltipIdx !== null && (
          <div
            className="fixed left-1/2 z-[10000] px-4 py-3 rounded-lg shadow-xl bg-white border border-gray-300 text-xs text-gray-800 animate-fade-in flex flex-col items-center"
            style={{ 
              transform: 'translateX(-50%)', 
              top: '30%',
              marginTop: '-50px',
              minWidth: 200, 
              maxWidth: 280 
            }}
            onClick={() => setTooltipIdx(null)}
          >
            <strong className="text-base mb-1">{adinkraSymbols[tooltipIdx].name}</strong>
            <div className="mt-1 text-center">{adinkraSymbols[tooltipIdx].meaning}</div>
            <div className="text-[10px] text-gray-400 mt-2">(Click to close)</div>
            {/* Arrow pointing up to the symbol */}
            <div 
              className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-white border-l border-t border-gray-300 rotate-45"
            ></div>
          </div>
        )}

        {/* All Interests Modal */}
        {showAllInterests && currentMatch?.interests && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAllInterests(false)}
          >
            <div
              className="bg-white rounded-2xl p-6 m-4 max-w-md w-full max-h-[70vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800">
                  {currentMatch.first_name}'s Interests
                </h3>
                <button
                  onClick={() => setShowAllInterests(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {currentMatch.interests.map((interest, index) => (
                  <span
                    key={index}
                    className="px-4 py-2 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-full text-sm font-semibold shadow-md"
                  >
                    {interest}
                  </span>
                ))}
              </div>
              
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-500">
                  {currentMatch.interests.length} interest{currentMatch.interests.length !== 1 ? 's' : ''} total
                </p>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default DiscoverPage;

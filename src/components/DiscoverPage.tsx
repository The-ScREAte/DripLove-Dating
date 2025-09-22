// Use shared IAP actions
import { buyMonthly, restorePurchases } from '../iap';

import { useImageEdgeColor } from '@/hooks/useImageEdgeColor';
function DominantColorImageBg({ imageUrl, children }) {
  const { edgeColor } = useImageEdgeColor(imageUrl);
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {/* Solid color overlay fills all space */}
      <div
        className="absolute inset-0"
        style={{ background: edgeColor, zIndex: 0 }}
        aria-hidden="true"
      />
      {/* Blurred image overlays the color for a soft effect */}
      {imageUrl && (
        <img
          src={imageUrl}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: 'blur(48px) brightness(1.08)',
            zIndex: 1,
            objectFit: 'cover',
            width: '100%',
            height: '100%',
            transform: 'scale(1.25)'
          }}
          draggable={false}
        />
      )}
      <div className="absolute inset-0 z-10">
        {children}
      </div>
    </div>
  );
}
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// --- AdinkraBar component and symbols ---
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
const AdinkraBar: React.FC = () => {
  const SYMBOLS_PER_SET = 4;
  const [tooltipIdx, setTooltipIdx] = useState<number | null>(null);
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
      className="w-full flex justify-center items-center gap-3 py-0.2 relative select-none"
      style={{
        backgroundImage: `url('data:image/svg+xml;utf8,<svg width=\"240\" height=\"36\" viewBox=\"0 0 240 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"240\" height=\"36\" fill=\"%23007bdb\"/><g><rect x=\"0\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"24\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"48\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"72\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"96\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"120\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"144\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"168\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"192\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"216\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/></g><g><polygon points=\"24,0 36,18 24,36 48,36 36,18 48,0\" fill=\"%23e63946\"/><polygon points=\"72,0 84,18 72,36 96,36 84,18 96,0\" fill=\"%2300b159\"/><polygon points=\"120,0 132,18 120,36 144,36 132,18 144,0\" fill=\"%23e63946\"/><polygon points=\"168,0 180,18 168,36 192,36 180,18 192,0\" fill=\"%2300b159\"/></g><g><rect x=\"0\" y=\"0\" width=\"240\" height=\"6\" fill=\"%23fff\" fill-opacity=\"0.15\"/><rect x=\"0\" y=\"30\" width=\"240\" height=\"6\" fill=\"%23fff\" fill-opacity=\"0.15\"/></g><g><rect x=\"23\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"47\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"71\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"95\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"119\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"143\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"167\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"191\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"215\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/></g></svg>')`,
        backgroundRepeat: 'repeat',
        backgroundSize: '240px 36px',
      }}
    >
      {visibleSymbols.map((symbol, idx) => (
        <button
          key={symbol.name}
          className="focus:outline-none bg-white rounded-full shadow hover:scale-110 transition-transform border border-yellow-300"
          style={{ width: 32, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setTooltipIdx(start + idx)}
          tabIndex={0}
          aria-label={symbol.name + ' symbol'}
        >
          {symbol.svg}
        </button>
      ))}
      {tooltipIdx !== null && (
        <div
          className="fixed left-1/2 top-1/2 z-50 px-4 py-3 rounded-lg shadow-lg bg-white border border-gray-300 text-xs text-gray-800 animate-fade-in flex flex-col items-center"
          style={{ transform: 'translate(-50%, -50%)', minWidth: 180, maxWidth: 260 }}
          onClick={() => setTooltipIdx(null)}
        >
          <strong className="text-base mb-1">{adinkraSymbols[tooltipIdx].name}</strong>
          <div className="mt-1 text-center">{adinkraSymbols[tooltipIdx].meaning}</div>
          <div className="text-[10px] text-gray-400 mt-2">(Click to close)</div>
        </div>
      )}
    </div>
  );
};
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X, Crown, Calendar, MapPin, ChevronDown, ChevronUp, Briefcase, GraduationCap, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useImagePreloader } from '@/hooks/useImagePreloader';
import { calculateDistance } from '@/constants/locationData';
import { checkAndTriggerRefill } from '@/utils/performanceOptimizer';
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

// Global cache for discover page data - persists across component mounts
const discoverCache = new Map<string, { 
  potentialMatches: PotentialMatch[], 
  userImages: { [key: string]: string[] },
  userDistances: { [key: string]: number },
  currentIndex: number,
  timestamp: number 
}>();
const DISCOVER_CACHE_DURATION = 60000; // 1 minute

// Make cache globally accessible for preloading
if (typeof window !== 'undefined') {
  (window as any).discoverCache = discoverCache;
}

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
  const [todaySwipeCount, setTodaySwipeCount] = useState(0);
  
  // Dynamic content height management
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const backgroundFetchingRef = useRef(false);
  
  const { toast } = useToast();
  const { subscription, checkUsageLimit, refetchSubscription } = useSubscription(currentUser?.id);
  const { preloadImages, getOptimizedUrl, isImageLoaded } = useImagePreloader({
    maxConcurrent: 8, // Reduced for better performance with more users
    quality: 50, // Ultra-low quality for maximum speed
    width: 280 // Much smaller for instant loading
  });

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
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [exitingCard, setExitingCard] = useState(false);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);

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

  // Background fetching function
  const fetchPotentialMatchesInBackground = useCallback(async () => {
    if (!currentUser?.id || backgroundFetchingRef.current) return;
    backgroundFetchingRef.current = true;

    try {
      const result = await fetchPotentialMatchesData(currentUser.id);
      if (result) {
        const { matches, images, distances, index } = result;
        
        // Update cache
        discoverCache.set(currentUser.id, {
          potentialMatches: matches,
          userImages: images,
          userDistances: distances,
          currentIndex: index,
          timestamp: Date.now()
        });

        // Update state with fresh data
        setPotentialMatches(matches);
        setUserImages(images);
        setUserDistances(distances);
        setCurrentIndex(index);
      }
    } catch (error) {
      // Silently handle background fetch errors
    } finally {
      backgroundFetchingRef.current = false;
    }
  }, [currentUser?.id]);

  // Shared data fetching logic
  const fetchPotentialMatchesData = useCallback(async (userId: string) => {
    // Parallel queries for better performance
    const [
      { data: likedUsers },
      { data: blockedUsers },
      { data: recentPasses }
    ] = await Promise.all([
      supabase
        .from('likes')
        .select('liked_id')
        .eq('liker_id', userId),
      supabase
        .from('blocks')
        .select('blocked_id, blocker_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
      supabase
        .from('passes')
        .select('passed_id, passed_at')
        .match({ passer_id: userId })
        .gte('passed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ]);

    const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
    const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
    const hiddenPassedIds = recentPasses?.map(p => p.passed_id) || [];
    const excludedIds = [...likedUserIds, ...blockedUserIds, ...hiddenPassedIds, userId];
    
    // Get user data for location and preferences
    const { data: currentUserData } = await supabase
      .from('profiles')
      .select('max_distance, distance_preference, country, min_age, max_age, preference')
      .eq('id', userId)
      .single();

    const userMaxDistance = currentUserData?.max_distance || currentUserData?.distance_preference || 50;
    const allowedGenders = currentUserData?.preference === 'men' ? ['male'] : 
                          currentUserData?.preference === 'women' ? ['female'] : 
                          ['male', 'female', 'other'];

    // Get location-based matches
    const locationMatches = await locationService.getLocationBasedMatches(userId, userMaxDistance);
    
    const distanceMap: { [key: string]: number } = {};
    locationMatches.forEach(match => {
      distanceMap[match.profile_id] = match.distance_km;
    });
    
    const locationProfileIds = locationMatches.map(match => match.profile_id);
    
    // Fetch full profile data
    let filteredProfiles: any[] = [];
    if (locationProfileIds.length > 0) {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized')
        .in('id', locationProfileIds)
        .not('id', 'in', `(${excludedIds.join(',')})`)
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .limit(35);

      if (error) throw error;
      filteredProfiles = profiles || [];
    } else {
      // Fallback: get profiles from same country
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized')
        .not('id', 'in', `(${excludedIds.join(',')})`)
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .eq('country', currentUserData?.country || 'Ghana')
        .limit(25);

      if (error) throw error;
      filteredProfiles = profiles || [];
    }

    // Apply age filtering
    const userMinAge = currentUserData?.min_age || 18;
    const userMaxAge = currentUserData?.max_age || 99;
    
    filteredProfiles = filteredProfiles.filter(profile => {
      if (!profile.date_of_birth) return false;
      const age = calculateAge(profile.date_of_birth);
      return age >= userMinAge && age <= userMaxAge;
    });

    // Add empty images array and shuffle
    const profilesWithImages = filteredProfiles
      .filter(profile => profile.id !== userId)
      .map(profile => ({
        ...profile,
        images: []
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

    // Load first few profile images
    const imageMap: { [key: string]: string[] } = {};
    if (shuffled.length > 0) {
      const firstProfile = shuffled.slice(0, 1); // Only load 1 profile initially
      for (const profile of firstProfile) {
        try {
          const { data: images } = await supabase
            .from('user_images')
            .select('user_id, image_url, image_order')
            .eq('user_id', profile.id)
            .eq('is_approved', true)
            .order('image_order', { ascending: true })
            .limit(2); // Only load 2 images per profile initially

          if (images?.length) {
            imageMap[profile.id] = images.map(img => img.image_url);
          }
        } catch (error) {
          // Silently handle individual image loading errors
        }
      }
    }

    return {
      matches: shuffled,
      images: imageMap,
      distances: distanceMap,
      index: indexToShow
    };
  }, []);

  const fetchPotentialMatches = useCallback(async () => {
    if (!currentUser?.id) return;
  
    try {
      // Background loading - don't block UI
      setIsLoading(true);

      const result = await fetchPotentialMatchesData(currentUser.id);
      if (result) {
        const { matches, images, distances, index } = result;
        
        // Update cache
        discoverCache.set(currentUser.id, {
          potentialMatches: matches,
          userImages: images,
          userDistances: distances,
          currentIndex: index,
          timestamp: Date.now()
        });

        setPotentialMatches(matches);
        setUserImages(images);
        setUserDistances(distances);
        setCurrentIndex(index);
        setLastShuffleTime(Date.now());

        // Immediately load images for current profile and preload next ones
        if (matches.length > 0) {
          const currentProfile = matches[index];
          if (currentProfile && !images[currentProfile.id]) {
            loadFullImages(currentProfile.id);
          }
          
          // Preload next profiles immediately and aggressively
          preloadNextProfileImages(matches, images, index + 1);
          
          // Only preload current profile for maximum performance
          if (matches.length > 0) {
            const currentProfile = matches[index];
            if (currentProfile && !images[currentProfile.id]) {
              loadFullImages(currentProfile.id);
            }
          }
        }

        // Start continuous loading immediately after initial load
        setTimeout(() => {
          loadMoreMatches(); // Load first batch of additional profiles
          
          // Set up continuous loading every 30 seconds to reduce server load
          const continuousLoadingInterval = setInterval(() => {
            const remainingProfiles = potentialMatches.length - currentIndex;
            if (remainingProfiles < 10 && !isLoadingMore) { // Reduced buffer
              loadMoreMatches();
            }
          }, 30000); // Reduced frequency for better performance
          
          // Store interval reference for cleanup
          if (typeof window !== 'undefined') {
            (window as any).continuousLoadingInterval = continuousLoadingInterval;
          }
        }, 2000); // Start 2 seconds after initial load
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
        
        // Load only first image immediately for speed
        if (imageUrls.length > 0) {
          preloadImages([imageUrls[0]]); // Only preload first image
        }
      }
    } catch (error) {
  // ...removed log...
    }
  }, [userImages, preloadImages]);

  // Ultra-optimized preloading strategy - minimal images for maximum speed
  const preloadNextProfileImages = useCallback(async (matches: PotentialMatch[], alreadyLoaded: { [key: string]: string[] }, startIdx: number) => {
    // Drastically reduced preload count for maximum concurrent users
    const PRELOAD_COUNT = 2; // Only 2 profiles ahead - ultra-aggressive optimization
    
    const toPreload = matches.slice(startIdx, startIdx + PRELOAD_COUNT)
      .filter(match => !alreadyLoaded[match.id] || alreadyLoaded[match.id]?.length === 0);
    
    // Load profiles in background with longer delays to reduce server load
    toPreload.forEach((match, index) => {
      setTimeout(() => {
        loadFullImages(match.id);
      }, index * 200); // Longer delays to reduce concurrent requests
    });
  }, [loadFullImages]);

  // Main effect to fetch data - check cache first but don't block render
  useEffect(() => {
    if (!currentUser?.id) return;

    // Use setTimeout to avoid blocking the initial render
    setTimeout(() => {
      // Check if we have fresh cached data first
      const cached = discoverCache.get(currentUser.id);
      if (cached && Date.now() - cached.timestamp < DISCOVER_CACHE_DURATION) {
        setPotentialMatches(cached.potentialMatches);
        setUserImages(cached.userImages);
        setUserDistances(cached.userDistances);
        setCurrentIndex(cached.currentIndex);
        setIsLoading(false);
        // Still fetch in background to get latest data
        setTimeout(() => fetchPotentialMatchesInBackground(), 100);
      } else if (potentialMatches.length === 0) {
        // No cache or stale cache, fetch immediately
        fetchPotentialMatches();
      }
    }, 0);
    
    fetchReverseUsage();
  }, [currentUser?.id]); // Only depend on user ID, not the functions

  // Save current match state
  useEffect(() => {
    if (potentialMatches.length > 0) {
      localStorage.setItem('driplove_last_profile_id', potentialMatches[currentIndex]?.id || '');
      localStorage.setItem('driplove_last_profile_time', Date.now().toString());
    }
  }, [currentIndex, potentialMatches]);

  // Cleanup continuous loading interval on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && (window as any).continuousLoadingInterval) {
        clearInterval((window as any).continuousLoadingInterval);
        (window as any).continuousLoadingInterval = null;
      }
    };
  }, []);

  useEffect(() => {
    setImageIndex(0);
    
    // Load images for current match immediately
    const currentMatch = potentialMatches[currentIndex];
    if (currentMatch) {
      // Load current profile images immediately (even if already loaded)
      loadFullImages(currentMatch.id);
      
      // Only load next 1 profile for maximum performance
      const nextMatch = potentialMatches[currentIndex + 1];
      if (nextMatch) {
        loadFullImages(nextMatch.id);
      }
    }
    
    // Ultra-aggressive preloading: preload many profiles ahead
    preloadNextProfileImages(potentialMatches, userImages, currentIndex + 1);
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

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setStartX(touch.clientX);
    setStartY(touch.clientY);
    setCurrentX(touch.clientX);
    setCurrentY(touch.clientY);
    setIsDragging(true);
    setSwipeDirection(null);
    setSwipeDistance(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setCurrentX(touch.clientX);
    setCurrentY(touch.clientY);
    
    const deltaX = touch.clientX - startX;
    const deltaY = Math.abs(touch.clientY - startY);
    
    // Only show swipe feedback if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > deltaY) {
      setSwipeDistance(Math.abs(deltaX));
      setSwipeDirection(deltaX > 0 ? 'right' : 'left');
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
  
    const deltaX = currentX - startX;
    const deltaY = Math.abs(currentY - startY);
    const screenWidth = window.innerWidth;
    const minSwipeDistance = screenWidth * 0.25; // Reduced from 0.4 to 0.25 for faster swipes
  
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      // Reset swipe state immediately for next card
      setStartX(0);
      setStartY(0);
      setCurrentX(0);
      setCurrentY(0);
      setSwipeDirection(null);
      setSwipeDistance(0);
      
      // Immediate swipe action without delays
      if (deltaX > 0) {
        handleLike();
      } else {
        handlePass();
      }
    } else {
      // Reset values if swipe wasn't far enough
      setStartX(0);
      setStartY(0);
      setCurrentX(0);
      setCurrentY(0);
      setSwipeDirection(null);
      setSwipeDistance(0);
    }
  };

  // Mouse event handlers for swipe on desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    setStartX(e.clientX);
    setStartY(e.clientY);
    setCurrentX(e.clientX);
    setCurrentY(e.clientY);
    setIsDragging(true);
    setSwipeDirection(null);
    setSwipeDistance(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCurrentX(e.clientX);
    setCurrentY(e.clientY);
    
    const deltaX = e.clientX - startX;
    const deltaY = Math.abs(e.clientY - startY);
    
    // Only show swipe feedback if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > deltaY) {
      setSwipeDistance(Math.abs(deltaX));
      setSwipeDirection(deltaX > 0 ? 'right' : 'left');
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    const deltaX = currentX - startX;
    const deltaY = Math.abs(e.clientY - startY);
    const minSwipeDistance = 50; // Reduced from 80 to 50 for faster mouse swipes

    // Only trigger swipe if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      // Reset swipe state immediately for next card
      setStartX(0);
      setStartY(0);
      setCurrentX(0);
      setCurrentY(0);
      setSwipeDirection(null);
      setSwipeDistance(0);
      
      // Immediate swipe action without delays
      if (deltaX > 0) {
        // Swipe right - like
        handleLike();
      } else {
        // Swipe left - dislike
        handlePass();
      }
    } else {
      // Reset values if swipe wasn't far enough
      setStartX(0);
      setStartY(0);
      setCurrentX(0);
      setCurrentY(0);
      setSwipeDirection(null);
      setSwipeDistance(0);
    }
  };

  const handleImageAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent swipe action if dragging occurred
    if (Math.abs(currentX - startX) > 10) return;

    // This function is now mainly used for compatibility
    // The actual image/slide navigation is handled within MatchCard
  };

  // Function to load more matches when running low - optimized for 5 at a time
  const loadMoreMatches = useCallback(async () => {
    if (!currentUser?.id || isLoadingMore) return;
    
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
        .limit(25); // Load 25 profiles at a time for continuous buffer

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
  }, [currentUser, allowedGenders, potentialMatches, calculateAge, calculateDistance, isLoadingMore, userImages, preloadNextProfileImages, loadFullImages]);

  // Auto-load more matches when getting low (5 profiles left) - reduced for performance
  useEffect(() => {
    if (potentialMatches.length - currentIndex <= 5 && !isLoadingMore) {
      setTimeout(() => loadMoreMatches(), 2000); // Add delay to reduce server load
    }
  }, [currentIndex, potentialMatches.length, loadMoreMatches, isLoadingMore]);

  // Background loading - preload next batch every swipe for instant experience
  useEffect(() => {
    if (currentIndex > 0 && !isLoadingMore) {
      loadMoreMatches(); // Load more profiles on every swipe for instant access
    }
  }, [currentIndex, loadMoreMatches, isLoadingMore]);
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

      // Always move to next profile immediately for instant feel
      moveToNext();
      
      if (mutualLike) {
        // It's a match! Show animation on top of the new profile
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
      
      // Progressive Refill System Integration
      const newIndex = currentIndex + 1;
      checkAndTriggerRefill(currentUser.id, newIndex);
      
      // Backup: Legacy loading system (less aggressive now)
      const remainingProfiles = potentialMatches.length - newIndex;
      if (remainingProfiles <= 3) { // Much smaller buffer since progressive system handles most loading
        setTimeout(() => loadMoreMatches(), 1000); // Longer delay
      }
      
    } else {
      fetchPotentialMatches();
      setCurrentIndex(0);
    }

    // Update cache in background without blocking UI
    setTimeout(() => {
      if (currentUser?.id) {
        const cached = discoverCache.get(currentUser.id);
        if (cached) {
          discoverCache.set(currentUser.id, {
            ...cached,
            currentIndex: currentIndex + 1,
            timestamp: Date.now()
          });
        }
      }
    }, 0);
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
    // Profile already moved when like was processed
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

  // Removed loading indicator - everything loads in background

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
    // Only show no profiles message when we actually have no profiles
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

  // Calculate swipe overlay opacity and transform
  const swipeOpacity = Math.min(swipeDistance / 100, 0.8);
  
  // Simple card transform for smooth dragging only
  const cardTransform = isDragging ? `translateX(${currentX - startX}px) rotate(${(currentX - startX) * 0.1}deg)` : '';



  return (
    <div className="h-full w-full fixed left-0 overflow-hidden"
         style={{ 
           top: '25px', // Move up to top
           height: 'calc(100vh - 60px)', // Adjust height to account for header
           touchAction: 'pan-x pan-y',
           userSelect: 'none',
           WebkitUserSelect: 'none',
           WebkitTouchCallout: 'none'
         }}>
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
      {/* Main Image Area - Card stack */}
  <div className="flex-1 relative overflow-hidden" style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 0 }}>
        {/* ...existing code... */}
        {nextMatch && (
          <DominantColorImageBg
            imageUrl={nextMatchImages[0] ? getOptimizedUrl(nextMatchImages[0]) : undefined}
          >
            {/* ...existing code for overlays, etc... */}
            {nextMatchImages.length > 0 ? (
              <img
                src={getOptimizedUrl(nextMatchImages[0])}
                alt={`${nextMatch.first_name}'s photo`}
                className="w-full h-full object-contain rounded-2xl md:rounded-3xl"
                style={{ borderRadius: '1.25rem', position: 'relative', zIndex: 1 }}
                draggable={false}
                loading="eager"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
                <span className="text-6xl font-bold text-gray-700">
                  {nextMatch.first_name?.[0]}{nextMatch.last_name?.[0]}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
          </DominantColorImageBg>

// Helper component to extract and apply dominant color as background

// Helper component to extract and apply dominant color as background
        )}
// Helper component to extract and apply dominant color as background

        {/* ...existing code... */}
        <div
          className="h-full w-full relative z-10 flex flex-col"
          style={{
            transform: cardTransform,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out', // Faster snap-back
            boxShadow: isDragging ? '0 8px 32px 0 rgba(0,0,0,0.25)' : '0 4px 16px 0 rgba(0,0,0,0.10)'
          }}
        >
          {/* Image area - flexible height that fills remaining space */}
          <div
            className="flex-1 cursor-pointer select-none relative transition-all duration-300 overflow-hidden"
            style={{
              minHeight: showMoreInfo ? 'calc(100vh - 402px)' : 'calc(100vh - 302px)' // Adjusted for new expanded height
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleImageAreaClick}
          >
            {/* ...existing code... */}
            {isDragging && swipeDirection && (
              <>
                {/* Like Overlay - Right Swipe */}
                {swipeDirection === 'right' && (
                  <div 
                    className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                    style={{ 
                      background: `linear-gradient(135deg, rgba(34, 197, 94, ${swipeOpacity * 0.7}), rgba(74, 222, 128, ${swipeOpacity * 0.5}))`,
                      transition: 'none'
                    }}
                  >
                    <div 
                      className="bg-green-500/90 backdrop-blur-sm rounded-full p-6 shadow-2xl transform"
                      style={{ 
                        scale: Math.min(0.8 + (swipeOpacity * 0.4), 1.2),
                        transition: 'none'
                      }}
                    >
                      <Heart 
                        className="w-12 h-12 text-white fill-current" 
                        style={{ 
                          filter: `drop-shadow(0 4px 8px rgba(0,0,0,0.3))`,
                          transform: `rotate(${swipeDistance * 0.1}deg)`
                        }}
                      />
                    </div>
                    <div 
                      className="absolute bottom-32 bg-green-500/95 backdrop-blur-sm px-8 py-3 rounded-full shadow-xl"
                      style={{ 
                        opacity: Math.min(swipeOpacity + 0.2, 1),
                        transform: `translateY(${-swipeDistance * 0.1}px)`,
                        transition: 'none'
                      }}
                    >
                      <span className="text-white font-bold text-2xl tracking-wider">LIKE</span>
                    </div>
                  </div>
                )}

                {/* Pass Overlay - Left Swipe */}
                {swipeDirection === 'left' && (
                  <div 
                    className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                    style={{ 
                      background: `linear-gradient(135deg, rgba(239, 68, 68, ${swipeOpacity * 0.7}), rgba(248, 113, 113, ${swipeOpacity * 0.5}))`,
                      transition: 'none'
                    }}
                  >
                    <div 
                      className="bg-red-500/90 backdrop-blur-sm rounded-full p-6 shadow-2xl transform"
                      style={{ 
                        scale: Math.min(0.8 + (swipeOpacity * 0.4), 1.2),
                        transition: 'none'
                      }}
                    >
                      <X 
                        className="w-12 h-12 text-white" 
                        style={{ 
                          filter: `drop-shadow(0 4px 8px rgba(0,0,0,0.3))`,
                          transform: `rotate(${-swipeDistance * 0.1}deg)`
                        }}
                      />
                    </div>
                    <div 
                      className="absolute bottom-32 bg-red-500/95 backdrop-blur-sm px-8 py-3 rounded-full shadow-xl"
                      style={{ 
                        opacity: Math.min(swipeOpacity + 0.2, 1),
                        transform: `translateY(${-swipeDistance * 0.1}px)`,
                        transition: 'none'
                      }}
                    >
                      <span className="text-white font-bold text-2xl tracking-wider">NOPE</span>
                    </div>
                  </div>
                )}
              </>
            )}
            {/* ...existing code... */}
            <MatchCard
              match={currentMatch}
              imageIndex={imageIndex}
              showMoreInfo={showMoreInfo}
              isPremium={isPremium}
              userImages={currentMatchImages}
              currentUserLatitude={currentUser.latitude}
              currentUserLongitude={currentUser.longitude}
              onImageClick={() => handleImageAreaClick({} as React.MouseEvent<HTMLDivElement>)}
              onToggleInfo={() => setShowMoreInfo(!showMoreInfo)}
              calculateAge={calculateAge}
              calculateDistance={calculateDistance}
              swipeDirection={swipeDirection}
              swipeDistance={swipeDistance}
              isVerified={calculateProfileVerification(currentMatch)}
              isSwipeAreaOnly={true}
              getOptimizedUrl={getOptimizedUrl}
              preCalculatedDistance={userDistances[currentMatch.id]}
            />
          </div>
          {/* ...existing code... */}
          {/* African Adinkra symbols bar - fixed height */}
          <AdinkraBar />

          {/* Info section - dynamic height that fits content exactly */}
          <div className={`bg-white transition-all duration-300 flex-shrink-0 ${
            showMoreInfo ? '' : 'overflow-hidden'
          }`} 
          style={!showMoreInfo ? { marginBottom: '-48px' } : {}}>
            <div 
              ref={contentRef}
              className={`w-full p-1 ${showMoreInfo ? 'overflow-y-scroll' : 'overflow-hidden pb-3'}`} 
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                scrollBehavior: 'smooth',
                maxHeight: showMoreInfo ? 'calc(50vh - 30%)' : 'auto',
                paddingBottom: showMoreInfo 
                  ? 'calc(80px + env(safe-area-inset-bottom, 0px))' 
                  : 'calc(12px + env(safe-area-inset-bottom, 0px))'
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
              onImageClick={() => handleImageAreaClick({} as React.MouseEvent<HTMLDivElement>)}
              onToggleInfo={() => setShowMoreInfo(!showMoreInfo)}
              calculateAge={calculateAge}
              calculateDistance={calculateDistance}
              swipeDirection={swipeDirection}
              swipeDistance={swipeDistance}
              isVerified={calculateProfileVerification(currentMatch)}
              isDetailsAreaOnly={true}
              getOptimizedUrl={getOptimizedUrl}
              preCalculatedDistance={userDistances[currentMatch.id]}
            />
            </div>
          </div>
        </div>
        {/* Loading more indicator */}
  {/* Loading more indicator removed for professional background loading */}
        {/* ...existing code... */}
        <SwipeButtons
          onPass={handlePass}
          onReverse={handleReverse}
          onLike={handleLike}
          canReverse={isPremium ? true : passedUsers.length > 0}
          reversesLeft={isPremium ? undefined : Math.max(0, 2 - reverseUsageToday)}
          isPremium={isPremium}
        />
      </div>
    </div>
  );
}

export default DiscoverPage;

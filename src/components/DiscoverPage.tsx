// Use shared IAP actions
import { buyMonthly, restorePurchases } from '../iap';

function DominantColorImageBg({ imageUrl, children }) {
  // Use lightweight static background color instead of expensive pixel scanning
  const edgeColor = '#f6f6f6';
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {/* Solid color overlay fills all space */}
      <div
        className="absolute inset-0"
        style={{ background: edgeColor, zIndex: 0 }}
        aria-hidden="true"
      />
      {/* Low-res thumbnail as background (cheap to decode). We intentionally request a tiny optimized image and lightly blur it. */}
      {imageUrl && (
        <img
          src={`${imageUrl}?width=40&quality=20&format=webp`}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            // Use a lighter blur for performance; thumbnail provides most of the blur effect
            filter: 'blur(6px) brightness(1.04)',
            zIndex: 1,
            objectFit: 'cover',
            width: '100%',
            height: '100%',
            transform: 'scale(1.4)',
            imageRendering: 'auto'
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
      className="w-full flex justify-center items-center gap-2 relative select-none z-40 leading-none"
      style={{
        backgroundImage: `url('data:image/svg+xml;utf8,<svg width=\"240\" height=\"36\" viewBox=\"0 0 240 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"240\" height=\"36\" fill=\"%23007bdb\"/><g><rect x=\"0\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"24\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"48\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"72\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"96\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"120\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"144\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"168\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/><rect x=\"192\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23ffc72c\"/><rect x=\"216\" y=\"0\" width=\"24\" height=\"36\" fill=\"%23007bdb\"/></g><g><polygon points=\"24,0 36,18 24,36 48,36 36,18 48,0\" fill=\"%23e63946\"/><polygon points=\"72,0 84,18 72,36 96,36 84,18 96,0\" fill=\"%2300b159\"/><polygon points=\"120,0 132,18 120,36 144,36 132,18 144,0\" fill=\"%23e63946\"/><polygon points=\"168,0 180,18 168,36 192,36 180,18 192,0\" fill=\"%2300b159\"/></g><g><rect x=\"0\" y=\"0\" width=\"240\" height=\"6\" fill=\"%23fff\" fill-opacity=\"0.15\"/><rect x=\"0\" y=\"30\" width=\"240\" height=\"6\" fill=\"%23fff\" fill-opacity=\"0.15\"/></g><g><rect x=\"23\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"47\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"71\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"95\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"119\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"143\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"167\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"191\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/><rect x=\"215\" y=\"0\" width=\"2\" height=\"36\" fill=\"%23fff\"/></g></svg>')`,
        backgroundRepeat: 'repeat',
        backgroundSize: '240px 36px',
        transform: 'translateY(-1px)',
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
          className="fixed left-1/2 top-1/12 z-50 px-4 py-3 rounded-lg shadow-lg bg-white border border-gray-300 text-xs text-gray-800 animate-fade-in flex flex-col items-center"
          style={{ transform: 'translate(-50%, -75%)', minWidth: 180, maxWidth: 260 }}
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
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSubscription } from '@/hooks/useSubscription';
import { useImagePreloader } from '@/hooks/useImagePreloader';
import { calculateDistance } from '@/constants/locationData';
import { checkAndTriggerRefill } from '@/utils/performanceOptimizer';
import { debounce, optimizeImageUrl, createPagination, userDataCache } from '@/utils/performanceOptimizer';
import { locationService } from '@/services/locationService';
import { calculateProfileCompletion, getTodaySwipeCount, checkSwipeRestrictions } from '@/utils/profileCompletion';
import { enqueue } from '@/lib/queue';
import PremiumUpgrade from './PremiumUpgrade';
import MatchAnimation from './MatchAnimation';
import MatchCard from './discover/MatchCard';
import SwipeButtons from './discover/SwipeButtons';
import ProfileCompletionModal from './ProfileCompletionModal';
import SwipeCounter from './SwipeCounter';
import AdCard from './discover/AdCard';
import { CurrentUser, PotentialMatch } from '@/types';

interface AdData {
  id: string;
  image_url: string;
  name: string;
  about: string;
  link: string | null;
  link_as: string | null;
  isAd: true; // Mark this as an ad
}

// Union type for matches and ads
type MatchOrAd = PotentialMatch | AdData;

// Global cache for discover page data - persists across component mounts
const discoverCache = new Map<string, { 
  potentialMatches: MatchOrAd[], 
  userImages: { [key: string]: string[] },
  userDistances: { [key: string]: number },
  currentIndex: number,
  timestamp: number 
}>();
const DISCOVER_CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours
const DISCOVER_CACHE_MAX_ENTRIES = 60; // keep cache bounded

const trimDiscoverCacheIfNeeded = () => {
  try {
    if (discoverCache.size <= DISCOVER_CACHE_MAX_ENTRIES) return;
    // delete oldest entries
    const entries = Array.from(discoverCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, discoverCache.size - DISCOVER_CACHE_MAX_ENTRIES);
    toDelete.forEach(([key]) => discoverCache.delete(key));
  } catch (e) {
    // ignore
  }
};

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

// Deterministic shuffle function to ensure consistent profile order
const createDeterministicShuffle = (array: any[], seed: string) => {
  const arr = [...array];
  
  // Simple hash function to convert seed string to number
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Use seeded random for Fisher-Yates shuffle
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  for (let i = arr.length - 1; i > 0; i--) {
    hash = (hash * 9301 + 49297) % 233280; // Linear congruential generator
    const j = Math.floor(seededRandom(hash) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  
  return arr;
};

const DiscoverPage = ({ currentUser, onNavigateToChat, isPremium }: DiscoverPageProps) => {
  // IAP: Track if buy is enabled
  const [canBuy, setCanBuy] = useState(false);
  useEffect(() => {
    function onProductUpdated() {
      // @ts-ignore
      const p = window.CdvPurchase?.store?.get('com.driplove.dating.premium.monthlysub1');
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
  const [potentialMatches, setPotentialMatches] = useState<MatchOrAd[]>([]);
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
  const [ads, setAds] = useState<AdData[]>([]);
  const [realSwipeCount, setRealSwipeCount] = useState(0); // Track actual user swipes (excluding ads)
  // New: Store images by userId for instant access
  const [userImages, setUserImages] = useState<{ [key: string]: string[] }>({});
  // We avoid storing HTMLImageElement objects in state to prevent GC pressure
  // and rely on useImagePreloader for actual image loading status.
  const [preloadedImages, setPreloadedImages] = useState<{ [key: string]: string[] }>({});
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
  // Suppress immediate full fetch when we have fresh cached data and the component remounts
  const suppressFetchRef = useRef(false);
  // Track optimistic/pending swipes to avoid local overshoot while background RPCs complete
  const pendingSwipesRef = useRef(0);
  
  const { toast } = useToast();
  const { sendMatchNotification } = usePushNotifications(currentUser?.id);
  const { subscription, checkUsageLimit, refetchSubscription } = useSubscription(currentUser?.id);
  const { preloadImages, preloadImage, getOptimizedUrl, isImageLoaded, imageStatus } = useImagePreloader({
    maxConcurrent: 4, // Cap concurrency to 4
    quality: 50,
    width: 280
  });

  // Track in-flight image load requests to avoid duplicate DB calls
  const requestedImageProfileIds = useRef<Set<string>>(new Set());

  // Fetch ads from database - load them BEFORE fetching profiles
  const [adsLoaded, setAdsLoaded] = useState(false);
  
  useEffect(() => {
    const fetchAds = async () => {
      try {
        const { data, error } = await supabase
          .from('ads')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Mark ads with isAd property
        const adsWithMarker: AdData[] = (data || []).map(ad => ({
          ...ad,
          isAd: true as const
        }));

        setAds(adsWithMarker);
        setAdsLoaded(true);
      } catch (error) {
        // Silently handle ad fetch errors
        setAdsLoaded(true); // Still allow profiles to load
      }
    };

    fetchAds();
  }, []);

  // Ensure currentIndex stays valid when potentialMatches array changes
  useEffect(() => {
    if (potentialMatches.length > 0 && currentIndex >= potentialMatches.length) {
      setCurrentIndex(Math.max(0, potentialMatches.length - 1));
    }
  }, [potentialMatches.length, currentIndex]);

  // Helper function to check if current match is an ad
  const isAd = (match: PotentialMatch | AdData): match is AdData => {
    return (match as AdData).isAd === true;
  };

  // Stable ad shuffle - deterministic based on user ID and date
  const stableShuffledAds = useMemo(() => {
    if (ads.length === 0) return [];
    
    // Use deterministic shuffle for ads as well to maintain consistency
    const today = new Date().toISOString().split('T')[0]; // Use same stable date format
    const adSeed = `${currentUser?.id}_ads_${today}`;
    return createDeterministicShuffle(ads, adSeed);
  }, [ads, currentUser?.id]);

  // Helper function to inject ads into matches array
  const injectAds = useCallback((matches: PotentialMatch[]): (PotentialMatch | AdData)[] => {
    if (stableShuffledAds.length === 0) {
      return matches;
    }
    
    const result: (PotentialMatch | AdData)[] = [];
    let adIndex = 0;
    
    for (let i = 0; i < matches.length; i++) {
      result.push(matches[i]);
      
      // Insert ad every 10 profiles, ensuring we cycle through ALL ads
      if ((i + 1) % 10 === 0) {
        const selectedAd = stableShuffledAds[adIndex % stableShuffledAds.length];
        result.push(selectedAd);
        adIndex++;
      }
    }
    
    return result;
  }, [stableShuffledAds]);

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

        // CRITICAL: Check swipe restrictions on mount/reload
        const restrictions = await checkSwipeRestrictions(currentUser.id, completionResult.completion, isPremium || false);
        
        // If user can't swipe, block them immediately
        if (!restrictions.canSwipe) {
          if (restrictions.requiresProfileCompletion) {
            // Show profile completion modal if they need to complete profile
            setShowProfileCompletionModal(true);
          } else if (restrictions.reason === 'Daily limit reached') {
            // Show out of swipes screen if they've hit daily limit
            setIsOutOfSwipes(true);
          }
        }
      } catch (error) {
  // ...removed log...
      }
    };

    fetchUserProfileCompletion();
  }, [currentUser?.id, isPremium]);

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
  // Use refs for raw pointer coordinates to avoid async state race conditions
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const currentYRef = useRef(0);
  // Batch swipe-related UI into one object to reduce re-renders
  const [swipeUI, setSwipeUI] = useState<{
    isDragging: boolean;
    swipeDirection: 'left' | 'right' | null;
    swipeDistance: number;
    dragOffset: number;
  }>({ isDragging: false, swipeDirection: null, swipeDistance: 0, dragOffset: 0 });
  const [exitingCard, setExitingCard] = useState(false);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);
  // RAF throttling refs: store latest delta and whether an rAF is scheduled
  const latestDeltaRef = useRef(0);
  const rafScheduledRef = useRef(false);

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

  // Store pre-calculated verification status from database (NO calculation in DiscoverPage!)
  const [verificationStatusMap, setVerificationStatusMap] = useState<{ [key: string]: boolean }>({});
  
  // Fetch pre-calculated verification status from database (NO calculation!)
  const fetchVerificationStatus = useCallback(async (userId: string) => {
    if (!userId || verificationStatusMap[userId] !== undefined) return; // Already fetched
    
    try {
      // For now, we'll calculate it once here and cache it, but ideally this should be pre-calculated in the database
      const { data: images, error: imageError } = await supabase
        .from('user_images')
        .select('image_url, is_approved, moderation_status')
        .eq('user_id', userId);

      if (imageError) {
        setVerificationStatusMap(prev => ({ ...prev, [userId]: false }));
        return;
      }

      // Get the profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profileData) {
        setVerificationStatusMap(prev => ({ ...prev, [userId]: false }));
        return;
      }

      // Calculate verification status once and cache it (this should ideally be done server-side)
      const { showVerifiedBadge } = calculateProfileCompletion(profileData, images || []);
      
      setVerificationStatusMap(prev => ({ ...prev, [userId]: showVerifiedBadge }));
    } catch (error) {
      setVerificationStatusMap(prev => ({ ...prev, [userId]: false }));
    }
  }, [verificationStatusMap]);

  // Get verification status from cache (NO calculation!)
  const isProfileVerified = useCallback((profile: any) => {
    if (!profile) {
      return false;
    }
    
    // Check if we have cached status
    if (verificationStatusMap[profile.id] === undefined) {
      // Start fetching if not cached
      fetchVerificationStatus(profile.id);
      return false;
    }

    return verificationStatusMap[profile.id];
  }, [verificationStatusMap, fetchVerificationStatus]);

  // Background fetching function
  const fetchPotentialMatchesInBackground = useCallback(async () => {
    if (!currentUser?.id || backgroundFetchingRef.current) return;
    backgroundFetchingRef.current = true;

    try {
      const result = await fetchPotentialMatchesData(currentUser.id);
      if (result) {
        const { matches, images, distances, index } = result;
        
        const matchesWithAds = injectAds(matches);
        
        // DISABLED: Background fetch no longer updates cache to prevent profile shuffling
        // The cache will only be updated on manual refresh or navigation

        // Fetch verification status for each profile (NO calculation!)
        matches.forEach(profile => {
          if (profile?.id) {
            fetchVerificationStatus(profile.id);
          }
        });

      }
    } catch (error) {
      // Silently handle background fetch errors
    } finally {
      backgroundFetchingRef.current = false;
      // Allow full fetches again after background refresh completes
      suppressFetchRef.current = false;
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
        .gte('passed_at', new Date(Date.now() - 240 * 60 * 60 * 1000).toISOString())
    ]);

    const likedUserIds = likedUsers?.map(like => like.liked_id) || [];
    const blockedUserIds = blockedUsers?.flatMap(block => [block.blocked_id, block.blocker_id]) || [];
    const passedUserIds = recentPasses?.map(p => p.passed_id) || [];
    const excludedIds = [...likedUserIds, ...blockedUserIds, ...passedUserIds, userId];
    
    // Get user data for location and preferences
    const { data: currentUserData } = await supabase
      .from('profiles')
      .select('max_distance, distance_preference, country, min_age, max_age, preference')
      .eq('id', userId)
      .single();

    const userMaxDistance = currentUserData?.max_distance || currentUserData?.distance_preference || 50;
    // Fix: Match the correct values stored in database ('male', 'female', 'everyone')
    const allowedGenders = currentUserData?.preference === 'male' ? ['male'] : 
                          currentUserData?.preference === 'female' ? ['female'] : 
                          currentUserData?.preference === 'everyone' || currentUserData?.preference === 'both' ? ['male', 'female', 'other'] :
                          ['male', 'female', 'other']; // Default to all if preference is not set

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
        .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols')
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
        .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols')
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

    // Add empty images array and precomputed distance
    const profilesWithImages = filteredProfiles
      .filter(profile => profile.id !== userId)
      .map(profile => ({
        ...profile,
        images: [],
        distance: distanceMap[profile.id] // Precomputed distance from locationService
      }));

    // Deterministic shuffle function to ensure consistent profile order

    // Create seed using user ID and today's date to maintain consistent order per day
    // Use ISO date string for consistency across timezones
    const today = new Date().toISOString().split('T')[0]; // e.g., "2025-10-08"
    // Include profile count in seed for extra stability
    const profileHash = profilesWithImages.map(p => p.id).sort().join('');
    const shuffleSeed = `${userId}_${today}_${profileHash.slice(0, 10)}`;
    console.log('🔀 Creating deterministic shuffle:', {
      userId,
      today,
      profileCount: profilesWithImages.length,
      profileHash: profileHash.slice(0, 20),
      shuffleSeed,
      firstThreeProfiles: profilesWithImages.slice(0, 3).map(p => ({ id: p.id, name: p.first_name }))
    });
    const shuffled = createDeterministicShuffle(profilesWithImages, shuffleSeed);
    console.log('🎯 Shuffled result:', {
      firstThreeShuffled: shuffled.slice(0, 3).map(p => ({ id: p.id, name: p.first_name }))
    });

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
    // Allow manual fetches to override suppress flag - user explicitly wants fresh data
    // Reset suppress flag when user manually refreshes
    suppressFetchRef.current = false;
  
    try {
      // Background loading - don't block UI
      setIsLoading(true);

      const result = await fetchPotentialMatchesData(currentUser.id);
      if (result) {
        const { matches, images, distances, index } = result;
        
        const matchesWithAds = injectAds(matches);
        
        // Update cache with ads already injected (use date-based key for consistency)
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = `${currentUser.id}_${today}`;
        discoverCache.set(cacheKey, {
          potentialMatches: matchesWithAds,
          userImages: images,
          userDistances: distances,
          currentIndex: index,
          timestamp: Date.now()
        });

        setPotentialMatches(matchesWithAds);
        setUserImages(images);
        setUserDistances(distances);
        setCurrentIndex(index);
        setLastShuffleTime(Date.now());

        // Fetch verification status for each profile (NO calculation!)
        matches.forEach(profile => {
          if (profile?.id) {
            fetchVerificationStatus(profile.id);
          }
        });

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

          // Visibility-aware chained loader instead of setInterval
          const continuousLoaderActive = { running: true };
          const CONTINUOUS_INTERVAL_MS = 30000; // base interval
          const continuousLoaderTimerRef = { current: null as any };
          const currentFetchController = { current: null as AbortController | null };

          const stopLoader = () => {
            continuousLoaderActive.running = false;
            if (continuousLoaderTimerRef.current) {
              clearTimeout(continuousLoaderTimerRef.current);
              continuousLoaderTimerRef.current = null;
            }
            if (currentFetchController.current) {
              currentFetchController.current.abort();
              currentFetchController.current = null;
            }
          };

          const scheduleNext = (delay = CONTINUOUS_INTERVAL_MS) => {
            if (!continuousLoaderActive.running) return;
            continuousLoaderTimerRef.current = setTimeout(runOnce, delay);
          };

          const runOnce = async () => {
            if (!continuousLoaderActive.running) return;

            // Pause if tab is hidden
            if (typeof document !== 'undefined' && document.hidden) {
              scheduleNext(CONTINUOUS_INTERVAL_MS);
              return;
            }

            try {
              if (!backgroundFetchingRef.current && !isLoadingMore) {
                const remainingProfiles = potentialMatches.length - currentIndex;
                if (remainingProfiles < 10) {
                  // Use AbortController to allow cancellation
                  currentFetchController.current = new AbortController();
                  const signal = currentFetchController.current.signal;
                  // If loadMoreMatches supports abort via signal, pass it; otherwise, just use fetchPotentialMatchesInBackground
                  // We'll call fetchPotentialMatchesInBackground which internally uses supabase (no signal), so we just guard with backgroundFetchingRef
                  await fetchPotentialMatchesInBackground();
                  // Trim cache if needed after refresh
                  trimDiscoverCacheIfNeeded();
                }
              }
            } catch (err) {
              // ignore background errors
            } finally {
              if (currentFetchController.current) {
                currentFetchController.current = null;
              }
              // schedule next run
              scheduleNext();
            }
          };

          // Start the loop
          scheduleNext(CONTINUOUS_INTERVAL_MS);

          // Expose stop function for cleanup
          if (typeof window !== 'undefined') {
            (window as any).stopDiscoverContinuousLoader = stopLoader;
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
    // Rely on the shared preloader to fetch and dedupe actual image loads
    try {
      const optimized = imageUrls.map(u => u.includes('supabase') ? `${u}?width=800&quality=85&format=webp` : u);
  // Preload only the primary image for this profile
  if (optimized[0]) preloadImage(optimized[0]);
      setPreloadedImages(prev => ({ ...prev, [userId]: optimized }));
    } catch (error) {
      // ignore individual preload failure
    }
  }, [preloadedImages]);

  // Preload images for the next N profiles for smoother UX
  const loadFullImages = useCallback(async (profileId: string) => {
    if (userImages[profileId]?.length > 0) return; // Already loaded
    // Prevent duplicate in-flight requests
    if (requestedImageProfileIds.current.has(profileId)) return;
    requestedImageProfileIds.current.add(profileId);
    try {
      // Only load approved images for discover page
      const { data: images, error } = await supabase
        .from('user_images')
        .select('image_url, is_approved')
        .eq('user_id', profileId)
        .eq('is_approved', true)
        .order('image_order', { ascending: true });

      if (!error && images?.length) {
        const imageUrls = images.map(img => img.image_url);
        setUserImages(prev => ({
          ...prev,
          [profileId]: imageUrls
        }));
        // Preload only the first image via shared preloader
        if (imageUrls.length > 0) {
          preloadImage(imageUrls[0]);
        }
      }
    } catch (error) {
      // ignore individual image fetch errors
    } finally {
      requestedImageProfileIds.current.delete(profileId);
    }
  }, [userImages, preloadImages]);

  // Ultra-optimized preloading strategy - minimal images for maximum speed
  const preloadNextProfileImages = useCallback(async (matches: PotentialMatch[], alreadyLoaded: { [key: string]: string[] }, startIdx: number) => {
    // Only preload the immediate next profile for minimal network work
    const PRELOAD_COUNT = 1;
    const toPreload = matches.slice(startIdx, startIdx + PRELOAD_COUNT)
      .filter(match => !alreadyLoaded[match.id] || alreadyLoaded[match.id]?.length === 0);

    toPreload.forEach((match, index) => {
      setTimeout(() => {
        loadFullImages(match.id);
      }, index * 150);
    });
  }, [loadFullImages]);

  // Track if we've already initialized for this user to prevent re-fetching
  const initializedUserRef = useRef<string | null>(null);

  // Main effect to fetch data - wait for ads to load first  
  useEffect(() => {
    if (!currentUser?.id || !adsLoaded) return;

    // Create cache key that includes date to ensure daily consistency
    const today = new Date().toISOString().split('T')[0]; // "2025-10-08"
    const cacheKey = `${currentUser.id}_${today}`;
    console.log('🔑 Cache key generated:', cacheKey, 'Cache size:', discoverCache.size);

    // Prevent re-initialization for the same user+date
    if (initializedUserRef.current === cacheKey) {
      return; // Already initialized for this user today
    }

    // Use setTimeout to avoid blocking the initial render
    setTimeout(() => {
      // Check if we have fresh cached data first (with date-based key)
      const cached = discoverCache.get(cacheKey);
      console.log(`🔍 Cache check for ${cacheKey}:`, {
        hasCached: !!cached,
        cacheAge: cached ? Date.now() - cached.timestamp : 'N/A',
        cacheDuration: DISCOVER_CACHE_DURATION,
        cacheValid: cached && Date.now() - cached.timestamp < DISCOVER_CACHE_DURATION,
        currentProfilesLength: potentialMatches.length
      });

      if (cached && Date.now() - cached.timestamp < DISCOVER_CACHE_DURATION) {
        console.log('✅ Using cached profiles for consistent experience');
        // Cache already has ads injected, use directly
        setPotentialMatches(cached.potentialMatches);
        setUserImages(cached.userImages);
        setUserDistances(cached.userDistances);
        // CRITICAL: Always use the cached currentIndex to maintain position
        // This ensures the user sees the same profile even after refresh
        const savedIndex = Math.max(0, Math.min(cached.currentIndex, cached.potentialMatches.length - 1));
        setCurrentIndex(savedIndex);
        setIsLoading(false);
        // COMPLETELY DISABLE background refresh to prevent profile changes
        suppressFetchRef.current = true;
        // Mark this user+date as initialized
        initializedUserRef.current = cacheKey;
      } else {
        console.log('🔄 No valid cache, fetching fresh profiles');
        // No cache or stale cache, fetch immediately
        fetchPotentialMatches();
        // Mark this user+date as initialized
        initializedUserRef.current = cacheKey;
      }
    }, 0);
    
    fetchReverseUsage();
  }, [currentUser?.id, adsLoaded]); // Wait for both user and ads

  // Save current match state AND update cache whenever currentIndex changes
  useEffect(() => {
    if (potentialMatches.length > 0 && currentUser?.id) {
      const currentProfile = potentialMatches[currentIndex];
      if (currentProfile?.id) {
        localStorage.setItem('driplove_last_profile_id', currentProfile.id);
        localStorage.setItem('driplove_last_profile_time', Date.now().toString());
        
        // CRITICAL: Update cache with current index to ensure persistence across refreshes
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = `${currentUser.id}_${today}`;
        const cached = discoverCache.get(cacheKey);
        if (cached) {
          discoverCache.set(cacheKey, {
            ...cached,
            currentIndex: currentIndex,
            timestamp: Date.now()
          });
        }
      }
    }
  }, [currentIndex, potentialMatches, currentUser?.id]);

  // Cleanup continuous loading interval on unmount
  useEffect(() => {
    return () => {
      // Stop any continuous loader we started
      try {
        if (typeof window !== 'undefined' && (window as any).stopDiscoverContinuousLoader) {
          (window as any).stopDiscoverContinuousLoader();
          (window as any).stopDiscoverContinuousLoader = null;
        }
        if (typeof window !== 'undefined' && (window as any).continuousLoadingInterval) {
          clearInterval((window as any).continuousLoadingInterval);
          (window as any).continuousLoadingInterval = null;
        }
      } catch (e) {
        // ignore cleanup errors
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
    const realMatches = potentialMatches.filter((m): m is PotentialMatch => !isAd(m));
    preloadNextProfileImages(realMatches, userImages, currentIndex + 1);
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
  startXRef.current = touch.clientX;
  startYRef.current = touch.clientY;
  currentXRef.current = touch.clientX;
  currentYRef.current = touch.clientY;
  setSwipeUI(prev => ({ ...prev, isDragging: true, swipeDirection: null, swipeDistance: 0, dragOffset: 0 }));
  };

  const handleTouchMove = (e: React.TouchEvent) => {
  if (!swipeUI.isDragging) return;
    const touch = e.touches[0];
    currentXRef.current = touch.clientX;
    currentYRef.current = touch.clientY;

    const deltaX = currentXRef.current - startXRef.current;
    const deltaY = Math.abs(currentYRef.current - startYRef.current);

    // Only show swipe feedback if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > deltaY) {
      // write latest delta and schedule an rAF update
      latestDeltaRef.current = deltaX;
      if (!rafScheduledRef.current) {
        rafScheduledRef.current = true;
        requestAnimationFrame(() => {
          const d = latestDeltaRef.current;
          setSwipeUI(prev => ({ ...prev, dragOffset: d, swipeDistance: Math.abs(d), swipeDirection: d > 0 ? 'right' : 'left' }));
          rafScheduledRef.current = false;
        });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!swipeUI.isDragging) return;
  setSwipeUI(prev => ({ ...prev, isDragging: false }));

    const changedTouch = e.changedTouches && e.changedTouches[0];
    const endX = changedTouch ? changedTouch.clientX : currentXRef.current;
    const endY = changedTouch ? changedTouch.clientY : currentYRef.current;

    const deltaX = endX - startXRef.current;
    const deltaY = Math.abs(endY - startYRef.current);
    const screenWidth = window.innerWidth;
  const minSwipeDistance = screenWidth * 0.65; // Increased to 0.65 for longer swipes

    // Reset visual smear (flush any pending rAF)
    latestDeltaRef.current = 0;
    if (rafScheduledRef.current) rafScheduledRef.current = false;
    setSwipeUI(prev => ({ ...prev, dragOffset: 0, swipeDistance: 0 }));

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      // Trigger exit animation
      setExitDirection(deltaX > 0 ? 'right' : 'left');
      setExitingCard(true);
      setSwipeUI(prev => ({ ...prev, swipeDirection: null }));
      
      // Wait for animation to complete before executing action
      setTimeout(() => {
        if (deltaX > 0) {
          handleLike();
        } else {
          handlePass();
        }
        setExitingCard(false);
        setExitDirection(null);
      }, 400); // Animation duration
    } else {
      setSwipeUI(prev => ({ ...prev, swipeDirection: null }));
    }
  };

  // Mouse event handlers for swipe on desktop
  const handleMouseDown = (e: React.MouseEvent) => {
  startXRef.current = e.clientX;
  startYRef.current = e.clientY;
  currentXRef.current = e.clientX;
  currentYRef.current = e.clientY;
  setSwipeUI(prev => ({ ...prev, isDragging: true, swipeDirection: null, swipeDistance: 0, dragOffset: 0 }));

    // Attach global mouse listeners to ensure we capture mouseup/move even if pointer leaves the element
    const onWindowMouseMove = (ev: MouseEvent) => {
  if (!swipeUI.isDragging) return;
      currentXRef.current = ev.clientX;
      currentYRef.current = ev.clientY;
      const deltaX = currentXRef.current - startXRef.current;
      const deltaY = Math.abs(currentYRef.current - startYRef.current);
      if (Math.abs(deltaX) > deltaY) {
        // rAF throttle visual updates
        latestDeltaRef.current = deltaX;
        if (!rafScheduledRef.current) {
          rafScheduledRef.current = true;
          requestAnimationFrame(() => {
            const d = latestDeltaRef.current;
            setSwipeUI(prev => ({ ...prev, dragOffset: d, swipeDistance: Math.abs(d), swipeDirection: d > 0 ? 'right' : 'left' }));
            rafScheduledRef.current = false;
          });
        }
        // Prevent default to avoid text selection during dragging
        ev.preventDefault();
      }
    };

    const onWindowMouseUp = (ev: MouseEvent) => {
    if (!swipeUI.isDragging) return;
  setSwipeUI(prev => ({ ...prev, isDragging: false }));
      // compute final deltas
      const deltaX = ev.clientX - startXRef.current;
      const deltaY = Math.abs(ev.clientY - startYRef.current);
      const minSwipeDistance = 70; // Increased from 50 to 70 for more deliberate mouse swipes
      // Reset visual smear (flush any pending rAF)
      latestDeltaRef.current = 0;
      if (rafScheduledRef.current) rafScheduledRef.current = false;
      setSwipeUI(prev => ({ ...prev, dragOffset: 0, swipeDistance: 0, swipeDirection: null }));
      if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
        // Trigger exit animation
        setExitDirection(deltaX > 0 ? 'right' : 'left');
        setExitingCard(true);
        
        // Wait for animation to complete before executing action
        setTimeout(() => {
          if (deltaX > 0) handleLike(); else handlePass();
          setExitingCard(false);
          setExitDirection(null);
        }, 400); // Animation duration
      }
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  };
  
  // Note: mousemove/mouseup handling is wired globally from mouseDown to ensure robust behavior

  const handleImageAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent swipe action if dragging occurred
    if (Math.abs(swipeUI.dragOffset) > 10) return;

    // This function is mainly a compatibility shim - slide navigation lives inside MatchCard
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
        .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols')
        .not('id', 'in', `(${excludedIds.join(',')})`)
        .in('gender', allowedGenders)
        .eq('account_status', 'active')
        .eq('is_admin', false)
        .limit(25); // Load 25 profiles at a time for continuous buffer

      if (error) throw error;

      // Apply same filtering logic as original fetch using location service
      let filteredProfiles = newProfiles || [];
      const userMaxDistance = currentUser.max_distance || currentUser.distance_preference || 50;
      
      // Get location-based matches for distance filtering (same as fetchPotentialMatchesData)
      const locationMatches = await locationService.getLocationBasedMatches(currentUser.id, userMaxDistance * 2);
      const locationProfileIds = locationMatches.map(match => match.profile_id);
      const distanceMap: { [key: string]: number } = {};
      locationMatches.forEach(match => {
        distanceMap[match.profile_id] = match.distance_km;
      });
      
      // Filter profiles to only those within distance range
      if (currentUser.latitude && currentUser.longitude) {
        filteredProfiles = filteredProfiles.filter(profile => {
          if (!profile.latitude || !profile.longitude) {
            return profile.country === currentUser.country;
          }
          return locationProfileIds.includes(profile.id);
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
        images: [],
        distance: distanceMap[profile.id] // Precomputed distance from locationService
      }));

      // Use a different seed for additional profiles to avoid exact duplicates but maintain consistency
      const today = new Date().toDateString();
      const loadMoreSeed = `${currentUser.id}_${today}_batch_${Math.floor(Date.now() / (1000 * 60 * 60))}`; // Changes every hour
      const shuffled = createDeterministicShuffle(profilesWithImages, loadMoreSeed);
      
      // Simply add new profiles with ads to existing array (don't re-inject into existing)
      setPotentialMatches(prev => [...prev, ...injectAds(shuffled)]);
      
      // Preload images for the new profiles
      if (shuffled.length > 0) {
        await preloadNextProfileImages(shuffled, userImages, 0);
      }
    } catch (error) {
  // ...removed log...
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentUser, allowedGenders, potentialMatches, calculateAge, isLoadingMore, userImages, preloadNextProfileImages, loadFullImages, injectAds, isAd]);

  // Auto-load more matches DISABLED to prevent profile shuffling issues
  // TODO: Re-enable with better stability once caching is fully working
  // useEffect(() => {
  //   if (potentialMatches.length - currentIndex <= 5 && !isLoadingMore) {
  //     setTimeout(() => loadMoreMatches(), 2000);
  //   }
  // }, [currentIndex, potentialMatches.length, loadMoreMatches, isLoadingMore]);

  // Background loading: rely on threshold-based triggers (see effect above) instead of
  // loading on every swipe. This prevents excessive server calls and keeps the UI smooth.

  // Optimistic UI: move to next card instantly, then process like in background
  const handleLike = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Skip likes on ads - just move to next
    if (isAd(currentMatch)) {
      moveToNext();
      return;
    }

    // Check profile completion restriction (70% after 5 swipes)
    if (profileCompletion < 70 && todaySwipeCount >= 5) {
      toast({
        title: 'Complete Your Profile',
        description: `You need ${70 - profileCompletion}% more to continue swiping. Complete your profile to unlock more swipes! `,
        variant: 'destructive'
      });
      setShowProfileCompletionModal(true);
      return;
    }

    // Optimistic path: advance UI immediately, then persist the action in background.
    const prevIndex = currentIndex;
    const prevMatch = currentMatch;

    // Increment local/pending counters immediately for a snappy feel
    pendingSwipesRef.current += 1;
    setTodaySwipeCount(prev => prev + 1);

    // Immediately advance the UI
    moveToNext();

    // Background job: persist usage and like, then show match animation if appropriate.
    enqueue(async () => {
      try {
        // First, increment usage on server (guard against limits)
        const usageResult = await checkUsageLimit('swipe');
        if (!usageResult.success) {
          // rollback: restore the previous card and counters
          setPotentialMatches(prev => {
            const copy = [...prev];
            copy.splice(prevIndex, 0, prevMatch);
            return copy;
          });
          setCurrentIndex(prevIndex);
          setTodaySwipeCount(prev => Math.max(0, prev - 1));
          setIsOutOfSwipes(true);
          updateCacheAfterRollback(prevIndex);
          
          toast({ title: 'Daily Limit Reached', description: usageResult.message || 'You have reached your swipe limit.', variant: 'destructive' });
          return;
        }

        // Then attempt the batched RPC to record the like and detect mutual
        const rpcName = 'like_and_usage_batched';
        const { data: rpcData, error: rpcError } = await supabase.rpc((rpcName as any), {
          liker_id_param: currentUser.id,
          liked_id_param: prevMatch.id,
          premium_param: !!isPremium
        } as any);

        if (rpcError) {
          // Fallback: attempt to insert like and check mutual
          try {
            const { data: existingLike } = await supabase
              .from('likes')
              .select('id')
              .match({ liker_id: currentUser.id, liked_id: prevMatch.id })
              .maybeSingle();

            if (!existingLike) {
              await supabase.from('likes').insert({ liker_id: currentUser.id, liked_id: prevMatch.id });
            }

            const { data: mutualLike } = await supabase
              .from('likes')
              .select('*')
              .match({ liker_id: prevMatch.id, liked_id: currentUser.id })
              .maybeSingle();

            if (mutualLike) {
              setMatchedUser(prevMatch);
              setShowMatchAnimation(true);
              
              // Send match notification to the other user
              try {
                const matchedUserName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';
                console.log('🔔 Sending match notification to:', prevMatch.id, 'from:', matchedUserName);
                const result = await sendMatchNotification(matchedUserName, prevMatch.id);
                console.log('🔔 Match notification result:', result);
              } catch (notificationError) {
                console.error('🔔 Match notification error:', notificationError);
              }
            }
          } catch (fallbackErr) {
            // If even fallback fails, rollback to keep UI consistent
            setPotentialMatches(prev => {
              const copy = [...prev];
              copy.splice(prevIndex, 0, prevMatch);
              return copy;
            });
            setCurrentIndex(prevIndex);
            setTodaySwipeCount(prev => Math.max(0, prev - 1));
            toast({ title: 'Error', description: 'Failed to record like.', variant: 'destructive' });
            return;
          }
        } else {
          // RPC succeeded — if server reports a match, show animation
          if ((rpcData as any)?.match) {
            setMatchedUser(prevMatch);
            setShowMatchAnimation(true);
            
            // Send match notification to the other user
            try {
              const matchedUserName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Someone';
              console.log('🔔 Sending match notification to:', prevMatch.id, 'from:', matchedUserName);
              const result = await sendMatchNotification(matchedUserName, prevMatch.id);
              console.log('🔔 Match notification result:', result);
            } catch (notificationError) {
              console.error('🔔 Match notification error:', notificationError);
            }
          }
        }
      } catch (jobErr) {
        // On unexpected errors, attempt a rollback to keep UX consistent
        setPotentialMatches(prev => {
          const copy = [...prev];
          copy.splice(prevIndex, 0, prevMatch);
          return copy;
        });
        setCurrentIndex(prevIndex);
        setTodaySwipeCount(prev => Math.max(0, prev - 1));
      } finally {
        pendingSwipesRef.current = Math.max(0, pendingSwipesRef.current - 1);
      }
    });
  };

  // Optimistic UI: move to next card instantly, then process pass in background
  const handlePass = async () => {
    const currentMatch = potentialMatches[currentIndex];
    if (!currentMatch) return;

    // Skip passes on ads - just move to next
    if (isAd(currentMatch)) {
      moveToNext();
      return;
    }

    // Check profile completion restriction (70% after 5 swipes)
    if (profileCompletion < 70 && todaySwipeCount >= 5) {
      toast({
        title: 'Complete Your Profile',
        description: `You need ${70 - profileCompletion}% more to continue swiping. Complete your profile to unlock more swipes!`,
        variant: 'destructive'
      });
      setShowProfileCompletionModal(true);
      return;
    }

    // Optimistic path for pass: add to passed list locally, advance UI, persist in background and rollback on error
    const prevIndex = currentIndex;
    const prevMatch = currentMatch;

    // Optimistically add to passed list and increment counters
    setPassedUsers(prev => [{ user_id: prevMatch.id, passed_at: new Date() }, ...prev.slice(0, 9)]);
    pendingSwipesRef.current += 1;
    setTodaySwipeCount(prev => prev + 1);

    // Immediately advance UI
    moveToNext();

    // Background job to persist the pass and usage increment
    enqueue(async () => {
      try {
        const usageResult = await checkUsageLimit('swipe');
        if (!usageResult.success) {
          // rollback: restore the previous card and counters, remove from passedUsers
          setPotentialMatches(prev => {
            const copy = [...prev];
            copy.splice(prevIndex, 0, prevMatch);
            return copy;
          });
          setCurrentIndex(prevIndex);
          setPassedUsers(prev => prev.filter(p => p.user_id !== prevMatch.id));
          setTodaySwipeCount(prev => Math.max(0, prev - 1));
          setIsOutOfSwipes(true);
          
          // Update cache with restored state
          setTimeout(() => {
            if (currentUser?.id) {
              const today = new Date().toISOString().split('T')[0];
              const cacheKey = `${currentUser.id}_${today}`;
              const cached = discoverCache.get(cacheKey);
              if (cached) {
                setPotentialMatches(current => {
                  discoverCache.set(cacheKey, {
                    ...cached,
                    potentialMatches: current,
                    currentIndex: prevIndex,
                    timestamp: Date.now()
                  });
                  return current;
                });
              }
            }
          }, 0);
          
          toast({ title: 'Daily Limit Reached', description: usageResult.message || 'You have reached your swipe limit.', variant: 'destructive' });
          return;
        }

        const rpcName = 'pass_and_usage_batched';
        const { data: rpcData, error: rpcError } = await supabase.rpc((rpcName as any), {
          passer_id_param: currentUser.id,
          passed_id_param: prevMatch.id,
          premium_param: !!isPremium
        } as any);

        if (rpcError) {
          // Fallback: insert pass directly
          try {
            const { data: existingPass } = await supabase
              .from('passes')
              .select('id')
              .match({ passer_id: currentUser.id, passed_id: prevMatch.id })
              .maybeSingle();

            if (!existingPass) {
              await supabase.from('passes').insert({ passer_id: currentUser.id, passed_id: prevMatch.id });
            }
          } catch (fallbackErr) {
            // On fallback failure, rollback
            setPotentialMatches(prev => {
              const copy = [...prev];
              copy.splice(prevIndex, 0, prevMatch);
              return copy;
            });
            setCurrentIndex(prevIndex);
            setPassedUsers(prev => prev.filter(p => p.user_id !== prevMatch.id));
            setTodaySwipeCount(prev => Math.max(0, prev - 1));
            toast({ title: 'Error', description: 'Could not skip this profile.', variant: 'destructive' });
            return;
          }
        }
      } catch (jobErr) {
        // Unexpected error: rollback
        setPotentialMatches(prev => {
          const copy = [...prev];
          copy.splice(prevIndex, 0, prevMatch);
          return copy;
        });
        setCurrentIndex(prevIndex);
        setPassedUsers(prev => prev.filter(p => p.user_id !== prevMatch.id));
        setTodaySwipeCount(prev => Math.max(0, prev - 1));
      } finally {
        pendingSwipesRef.current = Math.max(0, pendingSwipesRef.current - 1);
      }
    });
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
          .select('id, first_name, last_name, bio, city, country, country_code, occupation, education_level, date_of_birth, interests, gender, latitude, longitude, fun_fact, perfect_first_date, last_googled, relationship_intent, smoking, drinking, exercise_level, sleeping_schedule, introvert_extrovert, spontaneous_planner, messy_organized, adinkra_symbols')
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

    } catch (error) {
  // ...removed log...
      toast({
        title: 'Error',
        description: 'Could not reverse the dislike. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Helper to update cache after rollback
  const updateCacheAfterRollback = (restoredIndex: number) => {
    setTimeout(() => {
      if (currentUser?.id) {
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = `${currentUser.id}_${today}`;
        const cached = discoverCache.get(cacheKey);
        if (cached) {
          setPotentialMatches(current => {
            discoverCache.set(cacheKey, {
              ...cached,
              potentialMatches: current,
              currentIndex: restoredIndex,
              timestamp: Date.now()
            });
            return current;
          });
        }
      }
    }, 0);
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
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = `${currentUser.id}_${today}`;
        const cached = discoverCache.get(cacheKey);
        if (cached) {
          discoverCache.set(cacheKey, {
            ...cached,
            potentialMatches: potentialMatches,
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
                : "Free users get 20 swipes per day. Come back tomorrow or upgrade to Premium for unlimited swipes!"
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
                  // Just close the modal - don't fetch new profiles
                  // This keeps the user on the same profile they tried to swipe
                  setIsOutOfSwipes(false);
                }} 
                variant="outline" 
                className="w-full"
              >
                OK
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentMatch = potentialMatches[currentIndex];
  // Use preloaded images for current and next card
  const currentMatchImages = currentMatch && !isAd(currentMatch) ? (userImages[currentMatch.id] || []) : [];
  const nextMatch = potentialMatches[currentIndex + 1];
  const nextMatchImages = nextMatch && !isAd(nextMatch) ? (userImages[nextMatch.id] || []) : [];

  // Handle ads separately
  if (currentMatch && isAd(currentMatch)) {
    const getAdCardTransform = () => {
      if (exitingCard && exitDirection) {
        const screenWidth = window.innerWidth;
        const exitX = exitDirection === 'right' ? screenWidth * 1.5 : -screenWidth * 1.5;
        const exitY = window.innerHeight * 0.3; // Fall down effect
        const rotation = exitDirection === 'right' ? 30 : -30;
        return `translate3d(${exitX}px, ${exitY}px, 0) rotate(${rotation}deg)`;
      }
      if (swipeUI.isDragging) {
        return `translate3d(${swipeUI.dragOffset}px, 0, 0) rotate(${swipeUI.dragOffset * 0.08}deg)`;
      }
      return '';
    };
    
    const adCardTransform = getAdCardTransform();
    
    return (
      <div className="h-full w-full fixed left-0 overflow-hidden"
           style={{ 
             top: '70px', // Align with header end (matches pt-[50px] in MainApp)
             bottom: '70px', // Reserve space for bottom navigation (approximately 70px)
             height: 'auto', // Let top and bottom constraints define the height
             touchAction: 'pan-y',
             overscrollBehavior: 'contain',
             userSelect: 'none',
             WebkitUserSelect: 'none',
             WebkitTouchCallout: 'none'
           }}>
        <div className="h-full w-full relative z-10 flex flex-col"
             style={{
               transform: adCardTransform,
               transition: exitingCard 
                 ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' // Smooth exit with slight bounce
                 : swipeUI.isDragging 
                   ? 'none' 
                   : 'transform 0.2s ease-out',
               willChange: 'transform',
               boxShadow: swipeUI.isDragging ? '0 6px 18px rgba(0,0,0,0.18)' : '0 2px 8px rgba(0,0,0,0.08)'
             }}
             onTouchStart={handleTouchStart}
             onTouchMove={handleTouchMove}
             onTouchEnd={handleTouchEnd}
             onMouseDown={handleMouseDown}>
          <AdCard ad={currentMatch} onSwipe={moveToNext} />
          <AdinkraBar />
          <SwipeButtons
            onPass={handlePass}
            onReverse={handleReverse}
            onLike={handleLike}
            canReverse={false}
            isPremium={isPremium}
          />
        </div>
      </div>
    );
  }

  // Show loading state while data is being fetched
  if (isLoading) {
    return (
      <>
        <style>
          {`
            @keyframes float {
              0%, 100% {
                transform: translateY(0px);
              }
              50% {
                transform: translateY(-12px);
              }
            }
            .float-animation {
              animation: float 1.8s ease-in-out infinite;
            }
          `}
        </style>
        <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
          <div className="flex flex-col items-center">
            <div className="mb-4 float-animation">
              <img 
                src="/driplove-logo.png" 
                alt="DripLove" 
                className="w-20 h-20"
              />
            </div>
            <p className="text-gray-600">Finding your matches...</p>
          </div>
        </div>
      </>
    );
  }

  // Show no profiles message only when not loading and no current match
  if (!currentMatch) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 152px)' }}>
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold mb-2">No more profiles</h2>
            <p className="text-gray-600 mb-4">
              You've seen all available profiles.  Check back later for new matches! or Adjust your preference in settings for moreprofiles.
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
  const swipeOpacity = Math.min(swipeUI.swipeDistance / 100, 0.8);

  // Simple card transform for smooth dragging only - use dragOffset (signed) to avoid stale state
  // Use translate3d to ensure GPU compositing and avoid expensive layout
  const getCardTransform = () => {
    if (exitingCard && exitDirection) {
      const screenWidth = window.innerWidth;
      const exitX = exitDirection === 'right' ? screenWidth * 1.5 : -screenWidth * 1.5;
      const exitY = window.innerHeight * 0.3; // Fall down effect
      const rotation = exitDirection === 'right' ? 30 : -30;
      return `translate3d(${exitX}px, ${exitY}px, 0) rotate(${rotation}deg)`;
    }
    if (swipeUI.isDragging) {
      return `translate3d(${swipeUI.dragOffset}px, 0, 0) rotate(${swipeUI.dragOffset * 0.08}deg)`;
    }
    return '';
  };
  
  const cardTransform = getCardTransform();



  return (
    <>
      {/* Mobile browser viewport fix styles */}
      <style>{`
        /* Fix for mobile browser viewport height issues - only on actual mobile devices */
        @media screen and (max-width: 768px) and (hover: none) and (pointer: coarse) {
          .discover-container {
            /* Use dynamic viewport height for mobile browsers */
            height: 100dvh !important;
            min-height: 100svh !important;
            max-height: 100lvh !important;
          }
          
          .discover-image-area {
            /* Ensure image area doesn't get stuck at fixed heights on mobile */
            min-height: 45vh !important;
            max-height: 65vh !important;
          }
          
          .discover-info-area {
            /* Ensure info area is always visible but don't override expansion behavior */
            min-height: 25vh !important;
          }
          
          /* Specifically target mobile Safari - but preserve expansion functionality */
          .discover-info-area:not(.expanded) {
            max-height: 45vh !important;
          }
        }
        
        /* Additional mobile Safari specific fix */
        @media screen and (max-width: 768px) and (hover: none) and (pointer: coarse) {
          @supports (-webkit-touch-callout: none) {
            .discover-container {
              height: -webkit-fill-available !important;
            }
          }
        }
      `}</style>
      
      <div className="discover-container h-full w-full fixed left-0 overflow-hidden"
           style={{ 
             top: '60px', // Reduced from 65px to eliminate gap
             height: 'calc(100vh - 110px)', // Adjusted to match new top value
             // Mobile browser viewport fix
             minHeight: 'calc(100vh - 110px)',
             touchAction: 'pan-y', // allow vertical scrolling, prevent horizontal scroll-from-browser during horizontal swipes
             overscrollBehavior: 'contain',
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
  <div className="flex-1 relative overflow-hidden" style={{ 
    height: '100%', 
    minHeight: 'calc(100vh - 100px)', 
    display: 'flex', 
    flexDirection: 'column', 
    justifyContent: 'flex-end', 
    paddingBottom: 0 
  }}>
        {/* ...existing code... */}
        {nextMatch && (
          <DominantColorImageBg
            imageUrl={nextMatchImages[0] ? getOptimizedUrl(nextMatchImages[0]) : undefined}
          >
            {/* ...existing code for overlays, etc... */}
            {nextMatchImages.length > 0 && !isAd(nextMatch) ? (
              <img
                src={getOptimizedUrl(nextMatchImages[0])}
                alt={`${nextMatch.first_name}'s photo`}
                className="w-full h-full object-contain rounded-2xl md:rounded-3xl"
                style={{ borderRadius: '1.25rem', position: 'relative', zIndex: 1 }}
                draggable={false}
                loading="eager"
              />
            ) : nextMatch && !isAd(nextMatch) ? (
              <div className="w-full h-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center">
                <span className="text-6xl font-bold text-gray-700">
                  {nextMatch.first_name?.[0]}{nextMatch.last_name?.[0]}
                </span>
              </div>
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
          </DominantColorImageBg>

// Helper component to extract and apply dominant color as background

        )}

        {/* ...existing code... */}
        <div
          className="h-full w-full relative z-10 flex flex-col"
          style={{
            transform: cardTransform,
            transition: exitingCard 
              ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' // Smooth exit with slight bounce
              : swipeUI.isDragging 
                ? 'none' 
                : 'transform 0.2s ease-out', // Faster snap-back
            willChange: 'transform',
            boxShadow: swipeUI.isDragging ? '0 6px 18px rgba(0,0,0,0.18)' : '0 2px 8px rgba(0,0,0,0.08)'
          }}
        >
          {/* Image area - flexible height that fills remaining space */}
          <div
            className="discover-image-area flex-1 cursor-pointer select-none relative transition-all duration-300 overflow-hidden"
            style={{
              // Use flexible height calculation that works better on mobile browsers
              minHeight: showMoreInfo ? 'max(40vh, 300px)' : 'max(50vh, 350px)',
              maxHeight: showMoreInfo ? '60vh' : '70vh'
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onClick={handleImageAreaClick}
          >
            {/* ...existing code... */}
            {swipeUI.isDragging && swipeUI.swipeDirection && (
              <>
                {/* Like Overlay - Right Swipe */}
                {swipeUI.swipeDirection === 'right' && (
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
                          transform: `rotate(${swipeUI.swipeDistance * 0.1}deg)`
                        }}
                      />
                    </div>
                    <div 
                      className="absolute bottom-32 bg-green-500/95 backdrop-blur-sm px-8 py-3 rounded-full shadow-xl"
                      style={{ 
                        opacity: Math.min(swipeOpacity + 0.2, 1),
                        transform: `translateY(${-swipeUI.swipeDistance * 0.1}px)`,
                        transition: 'none'
                      }}
                    >
                      <span className="text-white font-bold text-2xl tracking-wider">LIKE</span>
                    </div>
                  </div>
                )}

                {/* Pass Overlay - Left Swipe */}
                {swipeUI.swipeDirection === 'left' && (
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
                          transform: `rotate(${-swipeUI.swipeDistance * 0.1}deg)`
                        }}
                      />
                    </div>
                    <div 
                      className="absolute bottom-32 bg-red-500/95 backdrop-blur-sm px-8 py-3 rounded-full shadow-xl"
                      style={{ 
                        opacity: Math.min(swipeOpacity + 0.2, 1),
                        transform: `translateY(${-swipeUI.swipeDistance * 0.1}px)`,
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
            {!isAd(currentMatch) && (
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
                swipeDirection={swipeUI.swipeDirection}
                swipeDistance={swipeUI.swipeDistance}
                isVerified={isProfileVerified(currentMatch)}
                isSwipeAreaOnly={true}
                getOptimizedUrl={getOptimizedUrl}
                preCalculatedDistance={userDistances[currentMatch.id]}
                imageStatus={imageStatus}
              />
            )}
          </div>
          
          {/* AdinkraBar - between image and info sections */}
          <AdinkraBar />

          {/* Info section - dynamic height that fits content exactly */}
          <div className={`discover-info-area bg-white transition-all duration-300 flex-shrink-0 -mt-0.1 ${
            showMoreInfo ? 'expanded' : 'overflow-hidden'
          }`}>
            <div 
              ref={contentRef}
              className={`w-full ${showMoreInfo ? 'overflow-y-scroll px-1' : 'overflow-hidden'}`} 
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                scrollBehavior: 'smooth',
                // Restore fixed heights for collapsed/expanded states
                maxHeight: showMoreInfo ? 'min(45vh, 400px)' : '230px', // Fixed max height when collapsed
                minHeight: showMoreInfo ? 'min(20vh, 200px)' : 'auto',
                paddingBottom: showMoreInfo 
                  ? 'calc(140px + env(safe-area-inset-bottom, 0px))' 
                  : '0px'
              }}
            >
            {!isAd(currentMatch) && (
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
                swipeDirection={swipeUI.swipeDirection}
                swipeDistance={swipeUI.swipeDistance}
                isVerified={isProfileVerified(currentMatch)}
                isDetailsAreaOnly={true}
                imageStatus={imageStatus}
                getOptimizedUrl={getOptimizedUrl}
                preCalculatedDistance={userDistances[currentMatch.id]}
              />
            )}
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
    </>
  );
}

export default DiscoverPage;

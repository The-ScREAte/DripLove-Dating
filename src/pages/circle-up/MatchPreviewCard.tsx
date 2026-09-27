import { MapPin, BadgeCheck } from 'lucide-react';
import { CircleProfile } from '@/utils/circlePoolFetch';
import { calculateAge } from '@/utils/discoverCache';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { isRecentlyOnline, SWIPE_ONLINE_WINDOW_MS } from '@/utils/onlineStatus';
import { formatDistance } from '@/utils/distanceUnits';

interface MatchPreviewCardProps {
  profile: CircleProfile;
  distanceKm: number | null;
}

// The exact visual language of Discover's info overlay (ProfilePreviewModal.tsx /
// MatchCard.tsx: a bottom-pinned black gradient over the photo, name+age+online
// dot+verified badge, location+distance, a couple of interest chips) - reused
// here, not reinvented, so a Circle Up match reads as unmistakably "the same
// app" the instant it appears, per the user's explicit instruction that this
// should look like Discover's info area.
const MatchPreviewCard = ({ profile, distanceKm }: MatchPreviewCardProps) => {
  const online = isRecentlyOnline(profile.last_login_at, SWIPE_ONLINE_WINDOW_MS);
  const chips = (profile.interests || []).slice(0, 3);

  return (
    <div className="relative w-full aspect-[3/4] max-w-sm mx-auto rounded-3xl overflow-hidden bg-neutral-900 border border-pink-500/20 shadow-xl shadow-pink-500/10">
      {profile.firstImage ? (
        <img
          src={getDetailImageUrl(profile.firstImage)}
          alt={profile.first_name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pink-900/40 to-purple-900/40">
          <span className="text-white/30 text-sm">No photo</span>
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 z-10 px-5 pt-16 pb-5"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.94) 58%, rgba(0,0,0,1) 70%)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-bold text-white">
            {profile.first_name}, {calculateAge(profile.date_of_birth)}
          </h2>
          {online && (
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-black shrink-0" aria-label="Online now" />
          )}
          {profile.is_verified && (
            <BadgeCheck className="w-4 h-4 text-sky-400 shrink-0" aria-label="Verified profile" />
          )}
        </div>

        <div className="flex items-center text-sm text-white/80 mb-2">
          <MapPin className="w-3.5 h-3.5 mr-1 shrink-0" />
          <span>
            {profile.city}
            {profile.city && profile.country ? ', ' : ''}
            {profile.country}
            {typeof distanceKm === 'number' && (
              <span className="ml-2">• {formatDistance(distanceKm, profile.country_code)}</span>
            )}
          </span>
        </div>

        {chips.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {chips.map((interest) => (
              <span
                key={interest}
                className="text-xs font-medium text-white/85 bg-white/10 border border-pink-500/30 px-2 py-0.5 rounded-full truncate max-w-[120px]"
              >
                {interest}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchPreviewCard;

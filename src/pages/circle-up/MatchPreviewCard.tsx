import { CircleProfile } from '@/utils/circlePoolFetch';
import { calculateAge } from '@/utils/discoverCache';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import { formatDistance } from '@/utils/distanceUnits';
import { isRecentlyOnline, SWIPE_ONLINE_WINDOW_MS } from '@/utils/onlineStatus';
import ProfileInfoOverlay from './ProfileInfoOverlay';

export interface CircleUpShareSettings {
  age: boolean;
  location: boolean;
  interests: boolean;
  bio: boolean;
  occupation: boolean;
  relationshipIntent: boolean;
  photos: boolean;
  education: boolean;
  languages: boolean;
  pets: boolean;
}

// Only 4 true at a time is enforced in CircleUpPrepare's UI (a hard cap on
// how much of your profile Circle Up hands to a stranger before you've even
// talked) - these are just the 4 that ship on by default.
export const DEFAULT_SHARE_SETTINGS: CircleUpShareSettings = {
  age: true,
  location: true,
  interests: true,
  occupation: true,
  relationshipIntent: false,
  bio: false,
  photos: false,
  education: false,
  languages: false,
  pets: false,
};

interface MatchPreviewCardProps {
  profile: CircleProfile;
  distanceKm: number | null;
  shareSettings?: CircleUpShareSettings;
  extraPhotos?: string[];
  /** 'full' for the match-reveal moment, 'compact' for a small thumbnail. */
  size?: 'full' | 'compact';
  /** Shows the "show more info" chevron, like Discover's own card. */
  expandable?: boolean;
}

// Photo + Discover's own info-overlay style on top of it (see
// ProfileInfoOverlay) - reused, not reinvented, so a Circle Up match reads
// as unmistakably "the same app" the instant it appears.
const MatchPreviewCard = ({
  profile,
  distanceKm,
  shareSettings = DEFAULT_SHARE_SETTINGS,
  extraPhotos = [],
  size = 'full',
  expandable = true,
}: MatchPreviewCardProps) => {
  const locationLabel = shareSettings.location
    ? [profile.city, profile.country].filter(Boolean).join(', ') +
      (typeof distanceKm === 'number' ? ` • ${formatDistance(distanceKm, profile.country_code)}` : '')
    : undefined;
  const online = isRecentlyOnline(profile.last_login_at, SWIPE_ONLINE_WINDOW_MS);

  return (
    <div
      className={`relative w-full aspect-[3/4] mx-auto rounded-3xl overflow-hidden bg-neutral-900 border border-pink-500/20 shadow-xl shadow-pink-500/10 ${
        size === 'compact' ? 'max-w-[140px]' : 'max-w-sm'
      }`}
    >
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

      <ProfileInfoOverlay
        firstName={profile.first_name}
        age={shareSettings.age ? calculateAge(profile.date_of_birth) : undefined}
        online={online}
        verified={profile.is_verified}
        locationLabel={locationLabel}
        interests={shareSettings.interests ? profile.interests : []}
        bio={shareSettings.bio ? profile.bio : undefined}
        occupation={shareSettings.occupation ? profile.occupation : undefined}
        relationshipIntent={shareSettings.relationshipIntent ? profile.relationship_intent : undefined}
        education={shareSettings.education ? profile.education_level : undefined}
        languages={shareSettings.languages ? profile.languages || [] : []}
        pets={shareSettings.pets ? profile.pets || [] : []}
        extraPhotos={shareSettings.photos ? extraPhotos : []}
        expandable={expandable}
        size={size}
      />
    </div>
  );
};

export default MatchPreviewCard;

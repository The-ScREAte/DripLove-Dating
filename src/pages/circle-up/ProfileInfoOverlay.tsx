import { useState } from 'react';
import { MapPin, BadgeCheck, ChevronDown, Briefcase, GraduationCap, Languages, PawPrint } from 'lucide-react';
import { getDetailImageUrl } from '@/utils/imageOptimizer';

const formatRelationshipIntent = (intent?: string | null) => {
  if (!intent) return '';
  if (intent === 'serious') return 'Looking for something serious';
  if (intent === 'open_to_anything') return 'Open to anything';
  return `Looking for ${intent.replace(/_/g, ' ').toLowerCase()}`;
};

export interface ProfileInfoOverlayProps {
  firstName: string;
  age?: number;
  online?: boolean;
  verified?: boolean;
  locationLabel?: string;
  interests?: string[];
  bio?: string;
  occupation?: string;
  relationshipIntent?: string;
  education?: string;
  languages?: string[];
  pets?: string[];
  /** Additional approved photos beyond the one already showing as the
      card's own background - rendered as a thumbnail strip when expanded. */
  extraPhotos?: string[];
  /** Shows a chevron that reveals the fuller "About" section below. */
  expandable?: boolean;
  size?: 'full' | 'compact';
}

// The exact visual language of Discover's info overlay (ProfilePreviewModal.tsx /
// MatchCard.tsx: a bottom-pinned black gradient over the photo, name+age+online
// dot+verified badge, location+distance, interest chips, and a chevron that
// expands to a fuller "About" section) - extracted here so it can sit over
// either a static photo (MatchPreviewCard) or a live camera preview
// (CircleUpPrepare's own-profile check) without duplicating the markup.
const ProfileInfoOverlay = ({
  firstName,
  age,
  online,
  verified,
  locationLabel,
  interests = [],
  bio,
  occupation,
  relationshipIntent,
  education,
  languages = [],
  pets = [],
  extraPhotos = [],
  expandable = false,
  size = 'full',
}: ProfileInfoOverlayProps) => {
  const [expanded, setExpanded] = useState(false);
  const chips = interests.slice(0, 3);
  const intentLabel = formatRelationshipIntent(relationshipIntent);
  const hasExpandedContent = !!(bio || occupation || intentLabel || education || languages.length > 0 || pets.length > 0 || extraPhotos.length > 0);
  const compact = size === 'compact';

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-10 px-5 ${compact ? 'pt-8 pb-3' : 'pt-14 pb-5'}`}
      style={{
        background:
          'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.94) 58%, rgba(0,0,0,1) 70%)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className={compact ? 'text-xs font-bold text-white truncate' : 'text-lg font-bold text-white truncate'}>
              {firstName}
              {typeof age === 'number' ? `, ${age}` : ''}
            </h2>
            {online && (
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-black shrink-0" aria-label="Online now" />
            )}
            {verified && <BadgeCheck className="w-4 h-4 text-sky-400 shrink-0" aria-label="Verified profile" />}
          </div>

          {!compact && locationLabel && (
            <div className="flex items-center text-sm text-white/80 mb-2">
              <MapPin className="w-3.5 h-3.5 mr-1 shrink-0" />
              <span className="truncate">{locationLabel}</span>
            </div>
          )}

          {!compact && chips.length > 0 && (
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

          {!compact && expanded && hasExpandedContent && (
            <div
              className="mt-3 pt-3 border-t border-white/10 max-h-56 overflow-y-auto pr-1 space-y-2.5 overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            >
              {extraPhotos.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
                  {extraPhotos.map((url) => (
                    <img
                      key={url}
                      src={getDetailImageUrl(url)}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-white/10"
                    />
                  ))}
                </div>
              )}
              {occupation && (
                <div className="flex items-center text-xs text-white/75">
                  <Briefcase className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">{occupation}</span>
                </div>
              )}
              {education && (
                <div className="flex items-center text-xs text-white/75">
                  <GraduationCap className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">{education.replace(/_/g, ' ')}</span>
                </div>
              )}
              {languages.length > 0 && (
                <div className="flex items-center text-xs text-white/75">
                  <Languages className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">{languages.join(', ')}</span>
                </div>
              )}
              {pets.length > 0 && (
                <div className="flex items-center text-xs text-white/75">
                  <PawPrint className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">{pets.join(', ')}</span>
                </div>
              )}
              {intentLabel && <p className="text-xs text-white/75">{intentLabel}</p>}
              {bio && <p className="text-xs text-white/75 whitespace-pre-wrap">{bio}</p>}
            </div>
          )}
        </div>

        {!compact && expandable && hasExpandedContent && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70"
            aria-label={expanded ? 'Show less info' : 'Show more info'}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfileInfoOverlay;

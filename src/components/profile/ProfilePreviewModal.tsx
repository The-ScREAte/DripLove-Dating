import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapPin,
  Heart,
  Briefcase,
  GraduationCap,
  Languages,
  ArrowDown,
  ArrowUp,
  Ruler,
  Baby,
  MessageCircle,
  Gift,
  PawPrint,
  Share2,
} from 'lucide-react';
import { Pencil } from 'lucide-react';
import { PotentialMatch } from '@/types';
import { calculateAge } from '@/utils/dateUtils';
import { getLanguageName } from '@/utils/languageNames';
import { optimizeImageUrl } from '@/utils/imageOptimizer';
import { buildSlides, getPreviewHighlights, getUserColorHash, HIGHLIGHT_CHIP_BORDER_COLORS, truncateChipLabel, seedFromString, mulberry32 } from '../discover/MatchCardHelpers';
import { favoriteEmoji, formatFavoriteLabel, findFavoriteWithLink } from '@/constants/favorites';
import {
  FAMILY_PLANS_OPTIONS,
  COMMUNICATION_STYLE_OPTIONS,
  LOVE_STYLE_OPTIONS,
  PETS_OPTIONS,
  SOCIAL_MEDIA_OPTIONS,
  traitLabel,
} from '@/constants/profileTraits';
import MusicLinkBadge from '../discover/MusicLinkBadge';
import { SlideRenderer } from '../discover/SlideRenderer';
import UserAdinkraDisplay from '../discover/UserAdinkraDisplay';
import SwipeButtons from '../discover/SwipeButtons';
import PhotoCropModal, { uploadCroppedPhoto } from './PhotoCropModal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { calculateProfileCompletion } from '@/utils/profileCompletion';

const formatHeightLabel = (cm: number) => {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}" (${cm} cm)`;
};

interface ProfilePreviewModalProps {
  profile: PotentialMatch;
  images: string[];
  onClose: () => void;
  onPhotoUpdated?: () => void;
  /** Told whenever there is/isn't an unsaved crop, so the parent (ProfilePage)
   * can warn if the user leaves this screen (switches tabs) before saving -
   * this component itself has no "leave" button of its own; leaving always
   * happens externally (see ProfilePage's isActiveTab/profileTabSignal
   * effects), which unmounts this component and loses the unsaved crop
   * outright, so the warning has to come from the parent. */
  onPendingCropChange?: (hasPending: boolean) => void;
}

const BACKGROUND_COLORS = [
  'bg-gradient-to-br from-pink-600 to-rose-900',
  'bg-gradient-to-br from-purple-600 to-indigo-900',
  'bg-gradient-to-br from-rose-600 to-pink-900',
  'bg-gradient-to-br from-fuchsia-600 to-purple-900',
];

// Where the second captioned photo call-out can land in the expanded details
// panel - always above Personality. Module-level (not per-render) since it's
// a fixed constant, not something that needs recreating on every render.
const PHOTO_ANCHORS = ['lifestyle', 'workEducation'] as const;

const formatRelationshipIntent = (intent?: string | null) => {
  if (!intent) return '';
  if (intent === 'serious') return 'Looking for something serious';
  if (intent === 'open_to_anything') return 'Open to anything';
  return `Looking for ${intent.replace(/_/g, ' ').toLowerCase()}`;
};

const getSafeImageSrc = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('blob:')) return url;
  if (url.includes('supabase')) return optimizeImageUrl(url, { width: 1080, quality: 82 });
  return url;
};

// A light, read-only rendering of "how this profile looks to others" - reuses
// Discover's slide builder/renderer, highlight chips, and cultural-sign glow.
// The name/age caption is pinned to the bottom of the photo with a feathered
// gradient (an ordinary caption overlay, clipped by the photo's own
// overflow-hidden - no transform/negative-margin tricks, which is what
// produced a hard seam, a duplicated strip of photo, and a dead black gap when
// this was borrowed from Discover's fixed-viewport flex-card layout). Tapping
// the arrow reveals the rest of the sections as a normal block below the
// photo. Rendered inline in place of ProfilePage's own content (see
// ProfilePage.tsx), so it keeps MainApp's header and bottom nav visible
// instead of covering the screen; leaving the tab (including tapping the
// Profile nav icon again) drops back to the real profile page, handled by
// ProfilePage via onClose/isActiveTab.
const ProfilePreviewModal: React.FC<ProfilePreviewModalProps> = ({ profile, images, onClose, onPhotoUpdated, onPendingCropChange }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  // Crop is applied locally first ("OK" in the crop modal) so the user sees it
  // exactly as it will look here, and only hits storage/db on an explicit Save.
  const [pendingCrop, setPendingCrop] = useState<{ blob: Blob; previewUrl: string; originalUrl: string } | null>(null);
  const [savingCrop, setSavingCrop] = useState(false);
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);

  // Tell the parent whether there's something unsaved - it has no other way
  // to know, since it's the one that actually unmounts this component when
  // the user navigates away.
  useEffect(() => {
    onPendingCropChange?.(!!pendingCrop);
  }, [pendingCrop, onPendingCropChange]);

  // Revoke the local object URL when it's replaced or the preview goes away.
  useEffect(() => {
    return () => {
      if (pendingCrop?.previewUrl) URL.revokeObjectURL(pendingCrop.previewUrl);
    };
  }, [pendingCrop?.previewUrl]);

  // Warn on a real page unload while a crop is pending.
  useEffect(() => {
    if (!pendingCrop) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingCrop]);

  const handleSavePendingCrop = useCallback(async () => {
    if (!pendingCrop || savingCrop) return;
    setSavingCrop(true);
    try {
      await uploadCroppedPhoto(profile.id, pendingCrop.originalUrl, pendingCrop.blob);
      URL.revokeObjectURL(pendingCrop.previewUrl);
      setPendingCrop(null);
      toast({ title: 'Photo updated', description: 'Your cropped photo has been saved.' });
      onPhotoUpdated?.();
    } catch (error) {
      console.error('Error saving cropped photo:', error);
      toast({ title: 'Error', description: 'Failed to save your cropped photo. Please try again.', variant: 'destructive' });
    } finally {
      setSavingCrop(false);
    }
  }, [pendingCrop, savingCrop, profile.id, toast, onPhotoUpdated]);

  const handleDiscardPendingCrop = useCallback(() => {
    if (pendingCrop?.previewUrl) URL.revokeObjectURL(pendingCrop.previewUrl);
    setPendingCrop(null);
    setShowDiscardWarning(false);
  }, [pendingCrop]);
  const expandedDetailsRef = useRef<HTMLDivElement>(null);

  const slides = useMemo(() => buildSlides(profile, images), [profile, images]);
  const previewHighlights = useMemo(
    () => getPreviewHighlights(profile, currentSlide),
    [profile, currentSlide]
  );
  // Cycles through ALL of this profile's signs (not just the first) as the
  // viewer taps through photos, mirroring MatchCard's rotation.
  const signHighlight = useMemo(() => {
    const theirs = profile.adinkra_symbols;
    if (!theirs || theirs.length === 0) return null;
    return theirs[currentSlide % theirs.length];
  }, [profile.adinkra_symbols, currentSlide]);
  // Up to 2 of this profile's photos that have a caption set (ImageManagement.tsx),
  // picked once via a seeded shuffle so the same 1-2 photos surface consistently
  // rather than a different random pick every render.
  const captionedPhotos = useMemo(() => {
    const entries = Object.entries(profile.imageCaptions || {})
      .filter(([, v]) => v?.caption)
      .map(([url, v]) => ({ url, caption: v!.caption as string, label: v!.label || null }));
    if (entries.length === 0) return [];
    const seed = seedFromString(`${profile.id || profile.first_name || ''}_photocaption`);
    const rand = mulberry32(seed);
    const shuffled = [...entries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 2);
  }, [profile.imageCaptions, profile.id, profile.first_name]);

  // Both captioned photos show in the expanded panel, but scattered rather
  // than back-to-back: the first sits right after About, and the second
  // lands after a randomly chosen later section (seeded per profile, so it's
  // consistent rather than jumping around on every re-render).
  const secondPhotoAnchor = useMemo(() => {
    if (captionedPhotos.length < 2) return null;
    const seed = seedFromString(`${profile.id || profile.first_name || ''}_photo2anchor`);
    const rand = mulberry32(seed);
    return PHOTO_ANCHORS[Math.floor(rand() * PHOTO_ANCHORS.length)];
  }, [captionedPhotos.length, profile.id, profile.first_name]);

  // Caption text is capped at 50 characters, matching the limit enforced when
  // saving it in ImageManagement.tsx, so this should rarely ever truncate -
  // it's just a safety net for older captions saved before that cap existed.
  const truncateCaption = (text: string) => (text.length > 50 ? `${text.slice(0, 50).trimEnd()}…` : text);

  const renderPhotoCaptionCard = (photo: { url: string; caption: string; label?: string | null }) => (
    <div className="relative w-56 aspect-[3/4] rounded-lg overflow-hidden bg-black">
      <img
        src={optimizeImageUrl(photo.url, { width: 400, quality: 70 })}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div
        className="absolute inset-x-0 bottom-0 px-3 pt-8 pb-2.5"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0))' }}
      >
        {photo.label && (
          <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wide truncate">{photo.label}</p>
        )}
        <p className="text-white text-sm leading-snug break-words">{truncateCaption(photo.caption)}</p>
      </div>
    </div>
  );

  // The collapsed card's "body" rotates through chips and a bio excerpt as
  // the viewer taps through photos, mirroring Discover's MatchCard -
  // captioned photos are surfaced separately, in the expanded "Photos"
  // section below, not here in the collapsed call-out.
  const infoSlotSequence = useMemo(() => {
    const seq: Array<'chips' | 'about'> = ['chips', 'chips'];
    if (profile.bio?.trim()) seq.push('about');
    return seq;
  }, [profile.bio]);

  const activeInfoSlot = infoSlotSequence[currentSlide % infoSlotSequence.length];
  const showAbout = activeInfoSlot === 'about';
  // Same "earned" verified badge shown on the user's own profile page (>=85%
  // profile completion), not a face-verification flag.
  const showVerifiedBadge = useMemo(
    () => calculateProfileCompletion(profile, images).showVerifiedBadge,
    [profile, images]
  );
  const musicHighlight = useMemo(() => findFavoriteWithLink(profile.favorites), [profile]);
  const userBackgroundColor = useMemo(
    () => getUserColorHash(profile.id, BACKGROUND_COLORS),
    [profile.id]
  );
  const preferredLanguageName = useMemo(
    () => getLanguageName((profile as unknown as { preferred_language?: string }).preferred_language),
    [profile]
  );

  const currentSlideData = slides[currentSlide] || slides[0];

  const handleNavigationClick = useCallback((e: React.MouseEvent) => {
    const x = e.clientX;
    const width = window.innerWidth;
    const clickX = (x / width) * 100;
    if (clickX < 50) {
      setCurrentSlide(prev => Math.max(0, prev - 1));
    } else {
      setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1));
    }
  }, [slides.length]);

  const lifestyleFields = [profile.smoking, profile.drinking, profile.exercise_level, profile.sleeping_schedule];
  const hasLifestyle = lifestyleFields.some(val => val && val !== 'not_specified');

  return (
    <div
      className="h-full w-full bg-black flex flex-col overflow-hidden"
      style={{
        // Small breathing room below the card's rounded bottom edge and the
        // floating nav pill under it, matching Discover's own gap, so they
        // read as two distinct surfaces instead of touching.
        paddingBottom: 'clamp(6px, 2vw, 10px)',
        // Border + rounded bottom corners live on this OUTER wrapper (not the
        // inner photo box) so they enclose the expanded details panel too,
        // not just the photo - previously the border only ringed the photo,
        // leaving the expanded info panel visually "outside" it once opened.
        borderRadius: '0px 0px 22px 22px',
        border: '1px solid rgba(236,72,153,0.55)',
      }}
    >
      {/* Photo area - sized close to Discover's near-full-bleed swipe card
          (a viewport-relative height rather than a fixed aspect ratio, so it
          fills the screen the same way) with a sensible floor for short
          screens; the caption overlay below is clipped to this box so it can
          never bleed past the photo's own edges. Collapsed, nothing else
          shares this flex column, so a flat 78vh left a dead strip of plain
          black between the photo's own bottom (where the caption/feathering
          is pinned) and the screen's real bottom edge; flex:1 fills that
          instead so the feathering actually reaches the bottom of the
          screen. Bottom corners stay rounded and a subtle pink border rings
          the whole box, matching Discover's swipe card at rest. */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          // flex-basis 0% (not 'auto'): on iOS Safari, a flex item with an 'auto'
          // basis can size itself off its CONTENT's intrinsic height before the
          // image's own 100%-height is resolved - a tall/portrait photo then
          // forces this box (and everything below it) taller than the parent
          // actually has room for, pushing the caption down or off-screen. '0%'
          // makes flex-grow fill space purely from the parent's own definite
          // height, with zero dependency on the photo's natural size.
          // 58% (was 45%) - matches Liked Me's own expanded photo/info split, so the
          // info panel below reads as the same proportion on both screens.
          flex: showMoreInfo ? '0 0 58%' : '1 1 0%',
          // Floors that fit even short screens once the header/nav space above is
          // correctly reserved (this used to assume ~420px was always available below
          // the header, but a real short device/emulator can have well under that once
          // MainApp's wrapper reserves the header/nav's real measured height - the photo
          // would blow past its own parent's bottom edge and get clipped by the nav
          // instead of shrinking to fit).
          minHeight: showMoreInfo ? '180px' : '220px',
          transition: 'flex-basis 300ms ease-out, min-height 300ms ease-out',
        }}
      >
        {/* Absolute + inset 0, not w-full/h-full: pins this box to the exact
            dimensions of the flex box above with zero dependency on this
            element's own content size, so a tall/portrait photo inside can
            never expand it - belt-and-suspenders on top of the flex-basis
            fix above, same technique used in Discover and Liked Me. */}
        <div className="absolute inset-0" onClick={handleNavigationClick} style={{ cursor: 'pointer' }}>
          {currentSlideData && (
            <SlideRenderer
              slide={currentSlideData}
              userBackgroundColor={userBackgroundColor}
              matchFirstName={profile.first_name || ''}
              matchLastName={profile.last_name || ''}
              getOptimizedUrl={(url) =>
                (pendingCrop && url === pendingCrop.originalUrl
                  ? pendingCrop.previewUrl
                  : getSafeImageSrc(url)) || url
              }
            />
          )}
        </div>

        {slides.length > 1 && (
          <div className="absolute left-4 flex gap-1.5 z-10" style={{ top: '10px' }}>
            {slides.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  idx === currentSlide ? 'bg-white w-7' : 'bg-white/50 w-1.5'
                }`}
              />
            ))}
          </div>
        )}

        {/* Cultural sign - same centered glow treatment as Discover's MatchCard.
            No portal needed here: unlike the swipe card, this photo area isn't
            inside a `position: fixed` ancestor, so a plain absolute overlay
            already paints above everything else on the page. */}
        {profile.adinkra_symbols && profile.adinkra_symbols.length > 0 && (
          <div className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center" style={{ top: '4px' }}>
            <div className="relative w-16 h-16 flex items-center justify-center overflow-visible">
              <div className="relative z-10">
                <UserAdinkraDisplay adinkraSymbols={profile.adinkra_symbols} />
              </div>
            </div>
          </div>
        )}

        {/* Crop - top right, same row as the slide dots/sign. Only for photo
            slides (there's nothing to crop on a bio/fact slide). Edits the
            photo currently on screen. */}
        {currentSlideData?.type === 'image' && currentSlideData.content && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowCropModal(true); }}
            aria-label="Crop photo"
            className="absolute right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full text-white backdrop-blur-md transition-transform active:scale-95"
            style={{
              top: '4px',
              background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
              boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
            }}
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        )}

        {showCropModal && currentSlideData?.type === 'image' && currentSlideData.content && (
          <PhotoCropModal
            imageUrl={currentSlideData.content}
            userId={profile.id}
            onClose={() => setShowCropModal(false)}
            onApply={(result) => {
              if (pendingCrop?.previewUrl) URL.revokeObjectURL(pendingCrop.previewUrl);
              // Keep the ORIGINAL stored url as the key, even when re-cropping a
              // crop, so Save still repoints the right user_images row.
              setPendingCrop({ ...result, originalUrl: pendingCrop?.originalUrl || result.originalUrl });
              setShowCropModal(false);
            }}
          />
        )}

        {/* Unsaved-crop controls - only visible while a crop is pending. */}
        {pendingCrop && (
          <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 py-2 bg-black/70 backdrop-blur-md">
            <span className="text-xs text-white">Unsaved crop</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setShowDiscardWarning(true); }}
                disabled={savingCrop}
                className="h-8 px-3 text-xs bg-white border-pink-500/30 text-black hover:bg-neutral-200 hover:text-black"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleSavePendingCrop(); }}
                disabled={savingCrop}
                className="h-8 px-3 text-xs bg-pink-600 hover:bg-pink-700 text-white"
              >
                {savingCrop ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {showDiscardWarning && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-xs rounded-xl border border-pink-500/30 bg-black p-4 text-center">
              <p className="text-sm text-white mb-1 font-semibold">Discard your crop?</p>
              <p className="text-xs text-white/80 mb-4">Your cropped photo hasn't been saved yet.</p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDiscardWarning(false)}
                  className="h-8 px-3 text-xs bg-white border-pink-500/30 text-black hover:bg-neutral-200 hover:text-black"
                >
                  Keep editing
                </Button>
                <Button
                  size="sm"
                  onClick={handleDiscardPendingCrop}
                  className="h-8 px-3 text-xs bg-pink-600 hover:bg-pink-700 text-white"
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Name/age caption - pinned to the bottom of the photo with the same
            feathered gradient curve as Discover's .detailsContainer (transparent
            at the top, but crossing 85% opacity by just 10% down and settling
            fully solid by 24%) so the blend into the photo reads the same way,
            not the much lighter/slower fade this had before. Always in the same
            spot (never "empty gap" below it) since it's clipped to the photo. */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 px-4 pt-16 ${showMoreInfo ? 'pb-2' : 'pb-5'}`}
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.94) 58%, rgba(0,0,0,1) 70%)',
          }}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 leading-tight">
                <h2 className="text-[clamp(15px,4.4vw,18px)] font-bold text-white">
                  {profile.first_name} {profile.last_name}, {calculateAge(profile.date_of_birth)}
                </h2>
                {showVerifiedBadge && (
                  <img
                    loading="lazy"
                    decoding="async"
                    src="/images/verified.svg"
                    alt="Verified profile"
                    title="Verified profile"
                    className="w-[clamp(18px,5vw,24px)] h-[clamp(18px,5vw,24px)]"
                    aria-hidden="false"
                  />
                )}
              </div>
              {/* Location and "looking for" alternate by photo, one at a time, matching
                  Discover's MatchCard - falls back to whichever exists if only one is set. */}
              {!showMoreInfo && (() => {
                const hasLocation = !!profile.city;
                const hasIntent = !!profile.relationship_intent;
                const showLocation = hasLocation && (!hasIntent || currentSlide % 2 === 0);
                // Never alongside About - a bio excerpt already speaks for the
                // person, so pairing it with "looking for" felt redundant.
                const showIntent = !showAbout && hasIntent && (!hasLocation || currentSlide % 2 === 1);

                return (
                  <>
                    {showLocation && (
                      <div className="flex items-center text-[clamp(12px,3.4vw,14px)] text-white/80">
                        <MapPin className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                        <span>
                          {profile.city}, {profile.country}
                          {typeof profile.height_cm === 'number' && profile.height_cm > 0 && (
                            <span className="ml-2">• {formatHeightLabel(profile.height_cm)}</span>
                          )}
                        </span>
                      </div>
                    )}
                    {showIntent && (
                      <div className="flex items-center text-[clamp(11px,3.2vw,13px)] font-medium text-white/80">
                        <Heart className="w-[clamp(13px,3.6vw,16px)] h-[clamp(13px,3.6vw,16px)] mr-1 shrink-0" />
                        <span>{formatRelationshipIntent(profile.relationship_intent)}</span>
                      </div>
                    )}
                  </>
                );
              })()}

              {!showMoreInfo && showAbout ? (
                <p className="mt-2 text-[clamp(11px,3.2vw,13px)] text-white/85 line-clamp-2">
                  {profile.bio}
                </p>
              ) : (
                !showMoreInfo && (previewHighlights.length > 0 || signHighlight || musicHighlight) && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    {previewHighlights.map((highlight, index) => (
                      <span
                        key={index}
                        className={`text-[clamp(9px,2.8vw,12px)] font-medium text-white/85 bg-white/10 border ${HIGHLIGHT_CHIP_BORDER_COLORS[index % HIGHLIGHT_CHIP_BORDER_COLORS.length]} px-2 py-0.5 rounded-full truncate max-w-[100px] min-[400px]:max-w-[140px] shrink-0`}
                      >
                        {truncateChipLabel(highlight)}
                      </span>
                    ))}
                    {signHighlight && (
                      <span className="flex items-center justify-center bg-yellow-400/10 border border-yellow-400/60 rounded-full w-8 h-8 shrink-0">
                        <UserAdinkraDisplay adinkraSymbols={[signHighlight]} />
                      </span>
                    )}
                    {musicHighlight?.link && (
                      <MusicLinkBadge link={musicHighlight.link} label={formatFavoriteLabel(musicHighlight)} />
                    )}
                  </div>
                )
              )}
            </div>

            {/* Expandable info button - same style/behavior as Discover's MatchCard toggle. */}
            <button
              onClick={() => setShowMoreInfo(prev => !prev)}
              className="text-white rounded-full p-[clamp(0.2rem,1vw,0.3rem)] transition-colors duration-200 shrink-0 backdrop-blur-md"
              style={{
                background: 'linear-gradient(135deg, rgba(219,39,119,0.95), rgba(157,23,77,0.92))',
                boxShadow: '0 2px 10px rgba(157,23,77,0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
              }}
              aria-label={showMoreInfo ? t('discover.matchCard.hideDetails', 'Hide details') : t('discover.matchCard.showDetails', 'Show details')}
            >
              {showMoreInfo ? (
                <ArrowUp className="w-[clamp(14px,3.8vw,17px)] h-[clamp(14px,3.8vw,17px)]" strokeWidth={2.5} />
              ) : (
                <ArrowDown className="w-[clamp(14px,3.8vw,17px)] h-[clamp(14px,3.8vw,17px)]" strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details - directly beneath the name caption (the photo
          shrinks to make room, same as the collapsed<->expanded relationship
          in Discover), scrolling independently on its own from here down.
          Same solid black background and minimal top padding so it reads as
          one continuous panel with the caption above rather than a separate
          block with a gap. */}
      {showMoreInfo && (
        <div
          ref={expandedDetailsRef}
          className="bg-black px-4 pt-1 space-y-3 flex-1 overflow-y-auto"
          style={{
            paddingBottom: '10px',
            WebkitOverflowScrolling: 'touch',
            // Overlaps the photo box by a hair to paper over the subpixel seam
            // that shows up between the gradient's solid-black bottom edge and
            // this panel's own bg-black - rounding on the photo's percentage
            // (vh) height can leave a sliver exposing whatever's behind it.
            marginTop: '-2px',
          }}
        >
          {profile.relationship_intent && (
            <div className="flex items-center text-xs text-white/80">
              <Heart className="w-3 h-3 mr-1" />
              <span>{formatRelationshipIntent(profile.relationship_intent)}</span>
            </div>
          )}
          {profile.bio && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-1">{t('discover.matchCard.about')}</h4>
              <p className="text-white text-sm leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {/* First captioned photo (ImageManagement.tsx) - no section heading, just
              the photo, its preset label (what it's about), and the full caption
              (capped at 50 chars) pinned to the image's own bottom edge. */}
          {captionedPhotos[0] && renderPhotoCaptionCard(captionedPhotos[0])}

          {typeof profile.height_cm === 'number' && profile.height_cm > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.height', 'Height')}</h4>
              <div className="flex items-center text-sm">
                <Ruler className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                <span className="text-white">{formatHeightLabel(profile.height_cm)}</span>
              </div>
            </div>
          )}

          {hasLifestyle && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.lifestyle')}</h4>
              <div className="space-y-2">
                {profile.smoking && profile.smoking !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 flex-shrink-0" aria-hidden="true">🚬</span>
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.smoking')}:</span>
                    <span className="text-white">{profile.smoking}</span>
                  </div>
                )}
                {profile.drinking && profile.drinking !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 flex-shrink-0" aria-hidden="true">🍸</span>
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.drinking')}:</span>
                    <span className="text-white">{profile.drinking}</span>
                  </div>
                )}
                {profile.exercise_level && profile.exercise_level !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 flex-shrink-0" aria-hidden="true">🏋️</span>
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.exercise')}:</span>
                    <span className="text-white">{profile.exercise_level}</span>
                  </div>
                )}
                {profile.sleeping_schedule && profile.sleeping_schedule !== 'not_specified' && (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 flex-shrink-0" aria-hidden="true">😴</span>
                    <span className="font-semibold mr-2 text-white">{t('discover.matchCard.sleep')}:</span>
                    <span className="text-white">{profile.sleeping_schedule}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {secondPhotoAnchor === 'lifestyle' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

          {profile.family_plans && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.familyPlans', 'Family Plans')}</h4>
              <div className="flex items-center text-sm">
                <Baby className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                <span className="text-white">{traitLabel(FAMILY_PLANS_OPTIONS, profile.family_plans)}</span>
              </div>
            </div>
          )}

          {(profile.occupation || profile.education_level) && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.workEducation')}</h4>
              <div className="space-y-2">
                {profile.occupation && (
                  <div className="flex items-center text-sm">
                    <Briefcase className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                    <span className="text-white">{profile.occupation}</span>
                  </div>
                )}
                {profile.education_level && (
                  <div className="flex items-center text-sm">
                    <GraduationCap className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                    <span className="text-white">{profile.education_level}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {secondPhotoAnchor === 'workEducation' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

          {(typeof profile.introvert_extrovert === 'number' || typeof profile.spontaneous_planner === 'number' || typeof profile.messy_organized === 'number') && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-3">{t('discover.matchCard.personality')}</h4>
              <div className="space-y-4">
                {typeof profile.introvert_extrovert === 'number' && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-white/60">{t('discover.matchCard.introvert')}</span>
                    <div className="flex-1 bg-white/10 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${profile.introvert_extrovert}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-white/60">{t('discover.matchCard.extrovert')}</span>
                  </div>
                )}
                {typeof profile.spontaneous_planner === 'number' && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-white/80">{t('discover.matchCard.spontaneousVsPlanner', { percentage: profile.spontaneous_planner })}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-white/60">{t('discover.matchCard.spontaneous')}</span>
                      <div className="flex-1 bg-white/10 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${profile.spontaneous_planner}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-white/60">{t('discover.matchCard.planner')}</span>
                    </div>
                  </div>
                )}
                {typeof profile.messy_organized === 'number' && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-white/80">{t('discover.matchCard.messyVsOrganized', { percentage: profile.messy_organized })}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-white/60">{t('discover.matchCard.messy')}</span>
                      <div className="flex-1 bg-white/10 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${profile.messy_organized}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-white/60">{t('discover.matchCard.organized')}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {secondPhotoAnchor === 'personality' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

          {profile.communication_style && profile.communication_style.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-pink-500" />
                {t('discover.matchCard.communicationStyle', 'Communication Style')}
              </h4>
              <div className="flex flex-wrap gap-1">
                {profile.communication_style.map((value, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {traitLabel(COMMUNICATION_STYLE_OPTIONS, value)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {secondPhotoAnchor === 'communicationStyle' && captionedPhotos[1] && renderPhotoCaptionCard(captionedPhotos[1])}

          {profile.love_style && profile.love_style.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-pink-500" />
                {t('discover.matchCard.loveStyle', 'Love Style')}
              </h4>
              <div className="flex flex-wrap gap-1">
                {profile.love_style.map((value, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {traitLabel(LOVE_STYLE_OPTIONS, value)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.interests && profile.interests.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.interests')}</h4>
              <div className="flex flex-wrap gap-1">
                {profile.interests.map((interest, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.favorites && profile.favorites.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.favorites')}</h4>
              <div className="flex flex-wrap gap-1.5">
                {profile.favorites.map((favorite, index) => (
                  <span key={index} className="inline-flex items-center gap-1 h-6 leading-none px-2 py-0 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-xs">
                    <span className="text-[11px] leading-none">{favoriteEmoji(favorite.category)}</span>
                    <span className="leading-none">{formatFavoriteLabel(favorite)}</span>
                    {favorite.link && (
                      <MusicLinkBadge link={favorite.link} label={formatFavoriteLabel(favorite)} variant="inline" />
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.pets && profile.pets.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-1.5">
                <PawPrint className="w-3.5 h-3.5 text-pink-500" />
                {t('discover.matchCard.pets', 'Pets')}
              </h4>
              <div className="flex flex-wrap gap-1">
                {profile.pets.map((value, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {traitLabel(PETS_OPTIONS, value)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.languages && profile.languages.length > 0 && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.languagesSpoken', 'Languages')}</h4>
              <div className="flex flex-wrap gap-1">
                {profile.languages.map((lang, index) => (
                  <span key={index} className="px-2 py-1 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-sm">
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.social_media && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.socialMedia', 'Social Media')}</h4>
              <div className="flex items-center text-sm">
                <Share2 className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-pink-500" />
                <span className="text-white">{traitLabel(SOCIAL_MEDIA_OPTIONS, profile.social_media)}</span>
              </div>
            </div>
          )}

          {preferredLanguageName && (
            <div className="bg-black border border-pink-500/20 rounded-lg p-3">
              <h4 className="font-semibold text-pink-400 mb-2">{t('discover.matchCard.language')}</h4>
              <div className="flex items-center text-sm">
                <Languages className="w-3.5 h-3.5 mr-2 text-pink-500 shrink-0" />
                <span className="text-white">{preferredLanguageName}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Undo button - same 'fixed' control as Discover's SwipeButtons. This modal is
          rendered inline within MainApp's own layout (in place of ProfilePage's
          content), which keeps MainApp's fixed header/nav visible around it - so it
          shares the SAME true viewport those are anchored to, and the same nav-aware
          'fixed' formula that positions this correctly on Discover positions it
          correctly here too. There's no swipe to undo in a read-only preview, so it
          steps back through this profile's own photos instead; disabled on the first
          one. */}
      <SwipeButtons
        onReverse={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
        canReverse={currentSlide > 0}
      />
    </div>
  );
};

export default ProfilePreviewModal;

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Video as VideoIcon, VideoOff, MicOff, Rows2, Columns2, PictureInPicture2, ChevronDown, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { fetchCircleProfilesByIds, CircleProfile } from '@/utils/circlePoolFetch';
import { calculateAge } from '@/utils/discoverCache';
import { getDetailImageUrl } from '@/utils/imageOptimizer';
import CircleUpHeader from './CircleUpHeader';
import ProfileInfoOverlay from './ProfileInfoOverlay';
import SlimSwitch from './SlimSwitch';
import { fetchApprovedImages } from './circleUpProfileExtras';
import { CircleUpShareSettings, DEFAULT_SHARE_SETTINGS } from './MatchPreviewCard';

const MIN_SHARED_FIELDS = 4;

export type CircleUpLayoutPref = 'floating' | 'split-h' | 'split-v';
const LAYOUT_PREF_KEY = 'driplove_circle_up_layout_pref';
const VALID_LAYOUT_PREFS: CircleUpLayoutPref[] = ['floating', 'split-h', 'split-v'];

export const readCircleUpLayoutPref = (): CircleUpLayoutPref => {
  try {
    const raw = window.localStorage.getItem(LAYOUT_PREF_KEY);
    return (VALID_LAYOUT_PREFS as string[]).includes(raw || '') ? (raw as CircleUpLayoutPref) : 'floating';
  } catch {
    return 'floating';
  }
};

// Who to see once live - chosen here, before going live, instead of as an
// in-session toggle, so it sits alongside the other "before you go live"
// choices (what to share, how the call looks) rather than cluttering the
// searching screen itself.
export type CircleUpCandidateFilter = 'matched' | 'not_matched' | 'everyone';
const FILTER_PREF_KEY = 'driplove_circle_up_filter_pref';
const VALID_FILTER_PREFS: CircleUpCandidateFilter[] = ['matched', 'not_matched', 'everyone'];
const FILTER_PREF_OPTIONS: { key: CircleUpCandidateFilter; label: string }[] = [
  { key: 'matched', label: 'Matched' },
  { key: 'not_matched', label: 'Not Matched' },
  { key: 'everyone', label: 'Everyone' },
];

export const readCircleUpFilterPref = (): CircleUpCandidateFilter => {
  try {
    const raw = window.localStorage.getItem(FILTER_PREF_KEY);
    return (VALID_FILTER_PREFS as string[]).includes(raw || '') ? (raw as CircleUpCandidateFilter) : 'everyone';
  } catch {
    return 'everyone';
  }
};

// Small mockup of each layout using the user's own photo in the "you" slot
// and a plain placeholder for "them" (unknown until actually matched) - so
// choosing a view means seeing roughly what it'll look like, not just an icon.
const LayoutMock = ({ type, myPhoto }: { type: CircleUpLayoutPref; myPhoto?: string | null }) => {
  const mePane = (
    <div className="w-full h-full overflow-hidden">
      {myPhoto ? (
        <img src={myPhoto} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-pink-500/50 to-purple-600/50" />
      )}
    </div>
  );
  const themPane = (
    <div className="w-full h-full bg-neutral-700 flex items-center justify-center">
      <User className="w-1/3 h-1/3 text-white/25" />
    </div>
  );

  if (type === 'floating') {
    return (
      <div className="relative w-full aspect-video rounded-lg overflow-hidden">
        {themPane}
        <div className="absolute bottom-1 right-1 w-5 h-7 rounded-[4px] overflow-hidden ring-1 ring-white/40">{mePane}</div>
      </div>
    );
  }
  if (type === 'split-h') {
    return (
      <div className="w-full aspect-video rounded-lg overflow-hidden flex flex-col gap-[2px]">
        <div className="flex-1">{themPane}</div>
        <div className="flex-1">{mePane}</div>
      </div>
    );
  }
  return (
    <div className="w-full aspect-video rounded-lg overflow-hidden flex gap-[2px]">
      <div className="flex-1">{themPane}</div>
      <div className="flex-1">{mePane}</div>
    </div>
  );
};

// Every toggle here is conditional on the field actually being set on the
// user's own profile - no point offering to hide something that's already
// empty, and it keeps the list scoped to what's genuinely theirs to share.
// 'photos' is checked separately (it depends on the fetched extra-images
// list, not a plain CircleProfile field), so it's appended after the fact.
const SHARE_FIELD_DEFS: { key: keyof CircleUpShareSettings; label: string; has: (p: CircleProfile) => boolean }[] = [
  { key: 'age', label: 'Age', has: (p) => !!p.date_of_birth },
  { key: 'location', label: 'Location & distance', has: (p) => !!(p.city || p.country) },
  { key: 'interests', label: 'Interests', has: (p) => (p.interests || []).length > 0 },
  { key: 'occupation', label: 'Occupation', has: (p) => !!p.occupation },
  { key: 'relationshipIntent', label: 'What I\'m looking for', has: (p) => !!p.relationship_intent },
  { key: 'education', label: 'Education', has: (p) => !!p.education_level },
  { key: 'languages', label: 'Languages', has: (p) => (p.languages || []).length > 0 },
  { key: 'pets', label: 'Pets', has: (p) => (p.pets || []).length > 0 },
  { key: 'bio', label: 'About me', has: (p) => !!p.bio },
];

// Standalone route (like /games) - no props from MainApp, so it resolves
// its own current user the same way useSubscription/useEnhancedSubscription
// already do elsewhere in this codebase.
const CircleUpPrepare = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<CircleProfile | null>(null);
  const [myExtraPhotos, setMyExtraPhotos] = useState<string[]>([]);
  const [permissionState, setPermissionState] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [goingLive, setGoingLive] = useState(false);
  const [shareSettings, setShareSettings] = useState<CircleUpShareSettings>(DEFAULT_SHARE_SETTINGS);
  const [shareSectionOpen, setShareSectionOpen] = useState(false);
  const [layoutPref, setLayoutPref] = useState<CircleUpLayoutPref>('floating');
  const [candidateFilter, setCandidateFilter] = useState<CircleUpCandidateFilter>('everyone');

  useEffect(() => {
    setLayoutPref(readCircleUpLayoutPref());
    setCandidateFilter(readCircleUpFilterPref());

    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }
      if (cancelled) return;
      setUserId(user.id);

      // Clear any stale queue/session state from a previous visit that
      // ended without a clean cancel (app kill, crash, back-swipe).
      await supabase.from('circle_up_queue').delete().eq('user_id', user.id);

      const profiles = await fetchCircleProfilesByIds([user.id]);
      if (!cancelled && profiles.length > 0) setMyProfile(profiles[0]);

      const imagesByUser = await fetchApprovedImages([user.id]);
      // The first (main) photo is already the card's own background - only
      // the rest count as "extra" for the gallery/Photos toggle.
      if (!cancelled) setMyExtraPhotos((imagesByUser[user.id] || []).slice(1));

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setPermissionState('granted');
      } catch {
        if (!cancelled) setPermissionState('denied');
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [navigate]);

  // The <video> element only mounts once permissionState flips to
  // 'granted' (it's conditionally rendered below), so videoRef.current
  // was still null at the moment the effect above obtained the stream -
  // assigning srcObject there silently did nothing, which is why the
  // preview rendered solid black. Attaching it here, once the element
  // actually exists, is what makes the live feed show up.
  useEffect(() => {
    if (permissionState === 'granted' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [permissionState, camOn]);

  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
  };

  const chooseLayout = (pref: CircleUpLayoutPref) => {
    setLayoutPref(pref);
    try { window.localStorage.setItem(LAYOUT_PREF_KEY, pref); } catch { /* device storage unavailable, not critical */ }
  };

  const chooseFilter = (pref: CircleUpCandidateFilter) => {
    setCandidateFilter(pref);
    try { window.localStorage.setItem(FILTER_PREF_KEY, pref); } catch { /* device storage unavailable, not critical */ }
  };

  const handleReady = async () => {
    if (!userId || goingLive) return;
    setGoingLive(true);
    const { error } = await supabase
      .from('circle_up_queue')
      .upsert(
        {
          user_id: userId,
          status: 'waiting',
          session_id: null,
          updated_at: new Date().toISOString(),
          share_settings: shareSettings as unknown as Json,
        },
        { onConflict: 'user_id' }
      );
    if (error) {
      setGoingLive(false);
      return;
    }
    navigate('/circle-up/matching');
  };

  const availableFields = myProfile
    ? [
        ...SHARE_FIELD_DEFS.filter((f) => f.has(myProfile)),
        ...(myExtraPhotos.length > 0 ? [{ key: 'photos' as const, label: 'More photos' }] : []),
      ]
    : [];
  const sharedCount = Object.values(shareSettings).filter(Boolean).length;

  // A floor, not a ceiling: at least MIN_SHARED_FIELDS must stay on (turning
  // one off is blocked once exactly that many remain), but there's no cap
  // on how many more a user can choose to share beyond that.
  const handleToggleShare = (key: keyof CircleUpShareSettings, next: boolean) => {
    if (!next && sharedCount <= MIN_SHARED_FIELDS) return;
    setShareSettings((s) => ({ ...s, [key]: next }));
  };

  return (
    <div className="h-[100dvh] w-full bg-black flex flex-col">
      <CircleUpHeader onBack={() => navigate('/?tab=circle')} backLabel="Back to Circle" />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex items-center justify-center px-6 pt-4 pb-6">
          <div className="relative w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden bg-neutral-900 border border-pink-500/20">
            {permissionState === 'granted' && camOn && (
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover scale-x-[-1]" />
            )}
            {permissionState === 'checking' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {permissionState === 'denied' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <VideoOff className="w-8 h-8 text-white/40" />
                <p className="text-white/60 text-sm">Camera and microphone access is needed to go live. Enable it in your device settings.</p>
              </div>
            )}
            {(permissionState !== 'granted' || !camOn) && permissionState !== 'checking' && permissionState !== 'denied' && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                <VideoOff className="w-8 h-8 text-white/30" />
              </div>
            )}

            {/* What your match will actually see, overlaid on your own live
                preview - same overlay Discover uses on a photo, just over
                video here, exactly like a real call's self-view name tag. */}
            {permissionState === 'granted' && camOn && myProfile && (
              <ProfileInfoOverlay
                firstName={myProfile.first_name}
                age={shareSettings.age ? calculateAge(myProfile.date_of_birth) : undefined}
                verified={myProfile.is_verified}
                locationLabel={shareSettings.location ? [myProfile.city, myProfile.country].filter(Boolean).join(', ') : undefined}
                interests={shareSettings.interests ? myProfile.interests : []}
                bio={shareSettings.bio ? myProfile.bio : undefined}
                occupation={shareSettings.occupation ? myProfile.occupation : undefined}
                relationshipIntent={shareSettings.relationshipIntent ? myProfile.relationship_intent : undefined}
                education={shareSettings.education ? myProfile.education_level : undefined}
                languages={shareSettings.languages ? myProfile.languages || [] : []}
                pets={shareSettings.pets ? myProfile.pets || [] : []}
                extraPhotos={shareSettings.photos ? myExtraPhotos : []}
                expandable
              />
            )}

            {permissionState === 'granted' && (
              <div className="absolute top-3 inset-x-0 flex items-center justify-center">
                <span className="px-3 py-1 rounded-full bg-black/50 text-white/70 text-[11px] font-medium border border-white/10">
                  What your match will see
                </span>
              </div>
            )}

            {permissionState === 'granted' && (
              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`w-11 h-11 rounded-full flex items-center justify-center border ${micOn ? 'bg-white/10 border-white/20 text-white' : 'bg-white text-black border-white'} focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400`}
                  aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  onClick={toggleCam}
                  className={`w-11 h-11 rounded-full flex items-center justify-center border ${camOn ? 'bg-white/10 border-white/20 text-white' : 'bg-white text-black border-white'} focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400`}
                  aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
                >
                  {camOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {availableFields.length > 0 && (
          <div className="px-6 pb-6">
            <div className="rounded-2xl border border-pink-500/20 bg-white/[0.03] overflow-hidden">
              <button
                type="button"
                onClick={() => setShareSectionOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <span className="text-left">
                  <span className="block text-white text-sm font-medium">Share with others</span>
                  <span className="block text-white/40 text-xs">{sharedCount} shared</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-white/50 transition-transform flex-shrink-0 ${shareSectionOpen ? 'rotate-180' : ''}`} />
              </button>
              {shareSectionOpen && (
                <div className="border-t border-white/[0.06]">
                  <p className="px-4 pt-2.5 pb-1 text-[11px] text-white/35">At least {MIN_SHARED_FIELDS} details must stay shared</p>
                  <div className="divide-y divide-white/[0.06]">
                    {availableFields.map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-white/85 text-sm">{label}</span>
                        <SlimSwitch
                          checked={shareSettings[key]}
                          onCheckedChange={(v) => handleToggleShare(key, v)}
                          disabled={shareSettings[key] && sharedCount <= MIN_SHARED_FIELDS}
                          aria-label={label}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="px-6 pb-6">
          <p className="text-white/40 text-xs font-medium uppercase tracking-wide mb-2">Who you'll see</p>
          <div className="flex items-center gap-1 bg-white/[0.03] border border-pink-500/20 rounded-full p-1">
            {FILTER_PREF_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => chooseFilter(key)}
                className={`flex-1 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  candidateFilter === key ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'text-white/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6">
          <p className="text-white/40 text-xs font-medium uppercase tracking-wide mb-2">Video call view</p>
          <div className="grid grid-cols-3 gap-2.5">
            {(
              [
                { pref: 'floating' as const, label: 'Little on top', Icon: PictureInPicture2 },
                { pref: 'split-h' as const, label: 'Split horizontal', Icon: Rows2 },
                { pref: 'split-v' as const, label: 'Split vertical', Icon: Columns2 },
              ]
            ).map(({ pref, label, Icon }) => (
              <button
                key={pref}
                type="button"
                onClick={() => chooseLayout(pref)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 ${
                  layoutPref === pref ? 'border-pink-500 bg-pink-500/10' : 'border-white/15 bg-white/[0.03]'
                }`}
              >
                <LayoutMock type={pref} myPhoto={myProfile?.firstImage ? getDetailImageUrl(myProfile.firstImage) : null} />
                <span className="flex items-center gap-1">
                  <Icon className={`w-3 h-3 ${layoutPref === pref ? 'text-pink-400' : 'text-white/50'}`} />
                  <span className={`text-[10px] font-medium leading-tight ${layoutPref === pref ? 'text-white' : 'text-white/60'}`}>
                    {label}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5 bg-black border-t border-white/5">
        <button
          type="button"
          onClick={handleReady}
          disabled={permissionState !== 'granted' || goingLive}
          className="w-full h-11 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
        >
          {goingLive ? 'Getting ready…' : 'Ready'}
        </button>
      </div>
    </div>
  );
};

export default CircleUpPrepare;

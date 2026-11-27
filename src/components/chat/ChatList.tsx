import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, ChevronDown, Heart, MessageCircle, Search, X } from 'lucide-react';
import { ChatMatch } from '@/types';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/LoadingStates';
import ChatUserAvatar from '@/components/ChatUserAvatar';
import MatchExpirationAvatar from './MatchExpirationAvatar';
import { formatListTime, previewText } from './chatFormat';
import IcebreakerRow from '../icebreaker/IcebreakerRow';

// The enter stagger is a first-load nicety - replaying it every time the user
// comes back from a conversation would just be motion for motion's sake.
let listStaggerPlayed = false;

// The search box only earns its space once the list is long enough to need it.
const SEARCH_MIN_CONVERSATIONS = 6;

interface ChatListProps {
  currentUserId: string;
  matches: ChatMatch[];
  matchesLoaded: boolean;
  typingMatchIds: Set<string>;
  isDormant: (match: ChatMatch) => boolean;
  isOnline: (match: ChatMatch) => boolean;
  onSelectMatch: (match: ChatMatch) => void;
  /** Takes the user to Discover from the empty state (omitted -> no button). */
  onFindMatch?: () => void;
  topCompensation: number;
  listRef: React.RefObject<HTMLDivElement>;
  pullHandlers: React.HTMLAttributes<HTMLDivElement>;
  pullIndicator: React.ReactNode;
}

const partnerIdOf = (match: ChatMatch, currentUserId: string) =>
  match.partner?.id || (match.user1_id === currentUserId ? match.user2_id : match.user1_id);

const fullName = (m: ChatMatch) => `${m.first_name} ${m.last_name}`.trim();

/** Layered hearts - the warm illustration used by the empty states. */
const HeartsIllustration: React.FC = () => (
  <div className="relative mx-auto mb-5 h-28 w-28" aria-hidden="true">
    <div className="absolute inset-0 rounded-full bg-brand-gradient opacity-20 blur-xl" />
    <div className="absolute inset-3 grid place-items-center rounded-full border border-brand/40 bg-brand/10">
      <MessageCircle className="h-9 w-9 text-brand-ink" />
    </div>
    <Heart className="absolute -right-1 top-1 h-7 w-7 rotate-12 fill-current text-brand dl-pop" />
    <Heart className="absolute -left-1 bottom-3 h-5 w-5 -rotate-12 fill-current text-brand-strong/80 dl-pop" />
  </div>
);

const ChatList: React.FC<ChatListProps> = ({
  currentUserId,
  matches,
  matchesLoaded,
  typingMatchIds,
  isDormant,
  isOnline,
  onSelectMatch,
  onFindMatch,
  topCompensation,
  listRef,
  pullHandlers,
  pullIndicator,
}) => {
  const { t, i18n } = useTranslation();
  const [showDormant, setShowDormant] = useState(false);
  const [query, setQuery] = useState('');
  const stagger = useMemo(() => {
    const play = !listStaggerPlayed;
    listStaggerPlayed = true;
    return play;
  }, []);

  // Dedupe new matches by partner so one person never shows up twice.
  const newMatches = useMemo(() => {
    const seen = new Set<string>();
    return matches.filter((m) => {
      if (m.last_message) return false;
      const pid = partnerIdOf(m, currentUserId);
      if (seen.has(pid)) return false;
      seen.add(pid);
      return true;
    });
  }, [matches, currentUserId]);

  const withMessages = useMemo(() => matches.filter((m) => m.last_message), [matches]);
  const q = query.trim().toLowerCase();
  const matchesQuery = (m: ChatMatch) => !q || fullName(m).toLowerCase().includes(q);
  const active = useMemo(
    () => withMessages.filter((m) => !isDormant(m) && matchesQuery(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withMessages, isDormant, q]
  );
  const dormant = useMemo(
    () => withMessages.filter((m) => isDormant(m) && matchesQuery(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withMessages, isDormant, q]
  );

  const totalUnread = useMemo(
    () => matches.reduce((sum, m) => sum + (m.unread_messages && m.unread_messages > 0 ? m.unread_messages : 0), 0),
    [matches]
  );
  const now = new Date();
  const yesterdayLabel = t('chat.yesterday');
  const nothingAtAll = withMessages.length === 0 && newMatches.length === 0;
  const onlyNewMatches = withMessages.length === 0 && newMatches.length > 0;
  const showSearch = withMessages.length >= SEARCH_MIN_CONVERSATIONS;

  const activate = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  const renderRow = (match: ChatMatch, muted: boolean) => {
    const pid = partnerIdOf(match, currentUserId);
    const unread = match.unread_messages && match.unread_messages > 0 ? match.unread_messages : 0;
    const typing = typingMatchIds.has(match.id);
    const mine = match.last_message_obj?.sender_id === currentUserId;
    const preview = previewText(match.last_message);
    return (
      <div
        key={match.id}
        role="button"
        tabIndex={0}
        aria-label={t('chat.openConversation', { name: fullName(match) })}
        onClick={() => onSelectMatch(match)}
        onKeyDown={(e) => activate(e, () => onSelectMatch(match))}
        className={`dl-press group flex min-h-[72px] w-full cursor-pointer items-center gap-3 border-b border-white/5 px-4 py-3 outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.06] ${
          unread ? 'bg-brand/[0.07]' : ''
        } ${muted ? 'opacity-75' : ''}`}
      >
        <div className="relative shrink-0">
          <ChatUserAvatar userId={pid} firstName={match.first_name} lastName={match.last_name} size="lg" className="h-14 w-14" />
          {isOnline(match) && (
            <span
              className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-black bg-success"
              role="img"
              aria-label={t('chat.activeNow')}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`flex min-w-0 items-center gap-1 text-[15px] ${unread ? 'font-bold text-white' : 'font-semibold text-white/90'}`}>
              <span className="truncate">{fullName(match)}</span>
              {match.is_verified && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-brand" aria-label={t('chat.verified')} />
              )}
            </h3>
            <span className={`shrink-0 text-xs ${unread ? 'font-semibold text-brand-ink' : 'text-white/45'}`}>
              {formatListTime(match.last_message_time, now, i18n.language, yesterdayLabel)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            {typing ? (
              <p className="truncate text-sm font-medium text-brand-ink">{t('chat.typing')}</p>
            ) : (
              <p className={`truncate text-sm ${unread ? 'font-medium text-white/90' : 'text-white/55'}`}>
                {mine && <span className="text-white/45">{t('chat.you')}: </span>}
                {preview}
              </p>
            )}
            {unread > 0 && (
              <span
                className="dl-pop grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-brand-gradient px-1.5 text-[11px] font-bold leading-none text-white shadow-dl-brand"
                aria-label={t('chat.unreadCount', { count: unread })}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dl-route mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col bg-black md:border-x md:border-white/10" style={{ paddingTop: `${topCompensation}px`, paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
      {/* Header */}
      <div
        className="z-30 shrink-0 border-b border-white/10 text-white"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0.9))' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-gradient shadow-dl-brand" aria-hidden="true">
              <Heart className="h-4 w-4 fill-current text-white" />
            </span>
            <span className="bg-brand-gradient bg-clip-text text-transparent">DripChat</span>
          </h2>
          {totalUnread > 0 && (
            <span className="rounded-full bg-brand/15 px-2.5 py-1 text-xs font-semibold text-brand-ink">
              {t('chat.unreadCount', { count: totalUnread > 99 ? '99+' : totalUnread })}
            </span>
          )}
        </div>
        {showSearch && (
          <div className="px-4 pb-3">
            <label className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 focus-within:border-brand/60">
              <Search className="h-4 w-4 shrink-0 text-white/50" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('chat.search')}
                aria-label={t('chat.search')}
                className="min-w-0 flex-1 appearance-none select-text bg-transparent text-base text-white outline-none placeholder:text-white/40 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden md:text-sm"
                style={{ fontSize: '16px' }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="grid h-6 w-6 place-items-center rounded-full text-white/60 hover:bg-white/10"
                  aria-label={t('chat.cancel')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
          </div>
        )}
      </div>

      {/* Break the ice requests waiting for an answer (renders nothing when there are none). */}
      {!q && <IcebreakerRow />}

      {/* New matches */}
      {newMatches.length > 0 && !q && (
        <section className="shrink-0 border-b border-white/10 bg-black/60 py-3" aria-label={t('chat.newMatchesAria')}>
          <h3 className="mb-2 flex items-center gap-2 px-4 text-sm font-semibold text-white">
            {t('chat.newMatches')}
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand-ink">{newMatches.length}</span>
          </h3>
          <div className="scrollbar-hide flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {newMatches.map((match) => {
              const pid = partnerIdOf(match, currentUserId);
              return (
                <div
                  key={match.id}
                  role="button"
                  tabIndex={0}
                  aria-label={t('chat.openConversation', { name: fullName(match) })}
                  onClick={() => onSelectMatch(match)}
                  onKeyDown={(e) => activate(e, () => onSelectMatch(match))}
                  className="dl-press flex w-[84px] shrink-0 snap-start cursor-pointer flex-col items-center rounded-2xl py-1 outline-none focus-visible:bg-white/[0.06]"
                >
                  <div className="relative">
                    <MatchExpirationAvatar
                      userId={pid}
                      matchId={match.id}
                      matchCreatedAt={match.created_at}
                      hasMessages={false}
                      firstName={match.first_name}
                      lastName={match.last_name}
                      size="md"
                    />
                    <span
                      className="dl-pop absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-black bg-brand-gradient text-white shadow-dl-brand"
                      aria-hidden="true"
                    >
                      <Heart className="h-3 w-3 fill-current" />
                    </span>
                  </div>
                  <span className="mt-1.5 w-full truncate text-center text-xs font-medium text-white/85">{match.first_name}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Scrollable list (only this area scrolls) */}
      <div
        ref={listRef}
        className="scrollbar-hide min-h-0 flex-1 overflow-y-auto pb-44 sm:pb-36"
        style={{
          WebkitOverflowScrolling: 'touch',
          // The pull indicator owns the top edge; the list's own bounce there
          // would move the content twice as far as the finger.
          overscrollBehaviorY: 'contain',
        }}
        {...pullHandlers}
      >
        {pullIndicator}

        {!matchesLoaded && nothingAtAll ? (
          <ListSkeleton rows={7} />
        ) : nothingAtAll ? (
          <div className="flex flex-col items-center px-8 pt-16 text-center dl-rise">
            <HeartsIllustration />
            <h3 className="mb-2 text-xl font-bold text-white">{t('chat.noMatchesTitle')}</h3>
            <p className="mb-1 max-w-xs text-white/70">{t('chat.swipeRightInDripCheck')}</p>
            <p className="mb-6 max-w-xs text-sm text-white/50">{t('chat.moreYouSwipe')}</p>
            {onFindMatch && (
              <Button variant="primary" size="lg" onClick={onFindMatch}>
                <Heart className="fill-current" aria-hidden="true" />
                {t('chat.findYourMatch')}
              </Button>
            )}
          </div>
        ) : onlyNewMatches ? (
          <div className="flex flex-col items-center px-8 pt-12 text-center dl-rise">
            <div className="mb-4 grid h-20 w-20 place-items-center rounded-full border border-brand/40 bg-brand/10 text-4xl" aria-hidden="true">
              ✨
            </div>
            <h3 className="mb-2 text-lg font-bold text-white">{t('chat.newMatchesWaiting')}</h3>
            <p className="max-w-xs text-white/70">{t('chat.tapMatchToMessage')}</p>
          </div>
        ) : active.length === 0 && dormant.length === 0 ? (
          <p className="px-6 pt-10 text-center text-sm text-white/55" role="status">
            {t('chat.noResults')}
          </p>
        ) : (
          <>
            <div className={stagger ? 'dl-stagger' : undefined}>{active.map((m) => renderRow(m, false))}</div>

            {dormant.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowDormant((v) => !v)}
                  aria-expanded={showDormant}
                  className="flex min-h-[44px] w-full items-center justify-between px-4 py-2 text-sm text-white/55 transition-colors hover:bg-white/[0.03]"
                >
                  <span>{t('chat.earlierConversations', { count: dormant.length })}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showDormant ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {(showDormant || !!q) && <div>{dormant.map((m) => renderRow(m, true))}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(ChatList);

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Flag, Heart, MessageCircleHeart, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { useBackClose } from '@/utils/backStack';
import { refreshInbox, respondIcebreaker, useIcebreakerInbox, type InboxItem } from '@/services/icebreaker';
import { shortAgo } from '@/utils/icebreaker';
import { useProfileReport } from '@/components/profile-card/useProfileReport';
import { ProfileReportModal } from '@/components/profile-card/ProfileReportModal';
import { closeIcebreakerInbox, getIcebreakerHandlers } from './store';
import { Avatar } from './IcebreakerSheet';
import './icebreaker.css';

const VerifiedMark: React.FC<{ label: string }> = ({ label }) => (
  <img src="/images/verified.svg" alt={label} title={label} className="ice-verified" loading="lazy" decoding="async" />
);

/* -------------------------------- list item -------------------------------- */
const RequestCard: React.FC<{ item: InboxItem; onOpen: () => void; index: number }> = ({ item, onOpen, index }) => {
  const { t } = useTranslation();
  return (
    <button type="button" className="ice-req dl-focus dl-press" onClick={onOpen} style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}>
      <Avatar name={item.firstName} photoUrl={item.photoUrl} size={56} />
      <span className="ice-req-main">
        <span className="ice-req-top">
          <span className="ice-req-name" dir="auto">
            {item.firstName}
            {item.age ? `, ${item.age}` : ''}
          </span>
          {item.isVerified && <VerifiedMark label={t('discover.matchCard.verifiedProfile', 'Verified profile')} />}
          <span className="ice-req-time">{shortAgo(item.createdAt) === 'now' ? t('chat.now', 'now') : shortAgo(item.createdAt)}</span>
        </span>
        <span className="ice-req-msg" dir="auto">
          {item.message}
        </span>
      </span>
    </button>
  );
};

/* --------------------------------- detail ---------------------------------- */
const RequestDetail: React.FC<{ item: InboxItem; onBack: () => void; onDone: () => void }> = ({ item, onBack, onDone }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const long = item.message.length > 140;

  const report = useProfileReport({
    reportedUserId: item.senderId,
    getImageUrl: () => item.photoUrl || undefined,
    onBlocked: () => {
      // The block is final: also close out this request, and go back to the list.
      void respondIcebreaker(item.id, false, true).finally(onDone);
    },
  });

  const accept = async () => {
    if (busy) return;
    setBusy('accept');
    setError(false);
    const res = await respondIcebreaker(item.id, true);
    if (!res.ok) {
      setBusy(null);
      if (res.code === 'not_pending' || res.code === 'expired' || res.code === 'not_found' || res.code === 'unavailable') onDone();
      else setError(true);
      return;
    }
    setCelebrate(true);
    // A short "it's a match" moment, then straight into the new conversation.
    window.setTimeout(() => {
      closeIcebreakerInbox();
      getIcebreakerHandlers().openChat(res.matchId ?? null);
    }, 1100);
  };

  const decline = async () => {
    if (busy) return;
    setBusy('decline');
    await respondIcebreaker(item.id, false, false);
    onDone();
  };

  return (
    <div className="ice-detail">
      <PageHeader
        title={t('icebreaker.inbox.requestTitle', 'Break the ice')}
        onBack={onBack}
        right={
          <IconButton aria-label={t('icebreaker.inbox.reportBlock', 'Report or block')} onClick={() => report.open()}>
            <Flag />
          </IconButton>
        }
      />
      <div className="ice-detail-scroll">
        <div className="ice-hero">
          {item.photoUrl ? (
            <img src={item.photoUrl} alt="" className="ice-hero-img" decoding="async" />
          ) : (
            <div className="ice-hero-fallback" aria-hidden="true">
              {(item.firstName || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="ice-hero-shade" aria-hidden="true" />
          <div className="ice-hero-meta">
            <h2 className="ice-hero-name" dir="auto">
              {item.firstName}
              {item.age ? `, ${item.age}` : ''}
              {item.isVerified && <VerifiedMark label={t('discover.matchCard.verifiedProfile', 'Verified profile')} />}
            </h2>
            {item.city && <p className="ice-hero-city">{item.city}</p>}
          </div>
        </div>

        <figure className="ice-said">
          <figcaption>{t('icebreaker.inbox.said', '{{name}} says', { name: item.firstName })}</figcaption>
          <blockquote dir="auto" className={long && !expanded ? 'ice-clamp' : undefined}>
            {item.message}
          </blockquote>
          {long && (
            <button type="button" className="ice-more dl-focus" onClick={() => setExpanded((v) => !v)}>
              {expanded ? t('icebreaker.inbox.showLess', 'Show less') : t('icebreaker.inbox.readMore', 'Read more')}
            </button>
          )}
        </figure>

        <p className="ice-note">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>{t('icebreaker.inbox.acceptNote', "Accepting matches you with {{name}} and opens your chat. If you're not interested, nothing is sent back.", { name: item.firstName })}</span>
        </p>
      </div>

      <footer className="ice-footer">
        <p className="ice-error" role="alert" aria-live="assertive">
          {error ? t('icebreaker.inbox.error', "Couldn't do that right now. Please try again.") : ''}
        </p>
        <Button variant="primary" size="lg" className="w-full" loading={busy === 'accept'} disabled={!!busy} onClick={accept}>
          <Heart className="h-5 w-5" aria-hidden="true" />
          <span>{t('icebreaker.inbox.accept', 'Accept & start chatting')}</span>
        </Button>
        <Button variant="quiet" size="md" className="w-full text-white/75" loading={busy === 'decline'} disabled={!!busy} onClick={decline}>
          {t('icebreaker.inbox.decline', 'Not now')}
        </Button>
      </footer>

      {celebrate && (
        <div className="ice-celebrate" role="status" aria-live="polite">
          <div className="ice-hearts" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, i) => (
              <Heart key={i} style={{ ['--i' as string]: i } as React.CSSProperties} />
            ))}
          </div>
          <span className="ice-success" aria-hidden="true">
            <MessageCircleHeart />
          </span>
          <h2 className="ice-big">{t('icebreaker.inbox.matched', "It's a match!")}</h2>
          <p className="ice-sub">{t('icebreaker.inbox.matchedBody', 'You and {{name}} can chat now.', { name: item.firstName })}</p>
        </div>
      )}

      <ProfileReportModal report={report} />
    </div>
  );
};

/* --------------------------------- inbox ---------------------------------- */
const IcebreakerInbox: React.FC = () => {
  const { t } = useTranslation();
  const { items, loaded } = useIcebreakerInbox();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    void refreshInbox();
  }, []);

  // If the selected request disappears (answered elsewhere, expired) `selected` becomes null and the list shows.

  const back = () => (selectedId ? setSelectedId(null) : closeIcebreakerInbox());
  useBackClose(true, back);

  return createPortal(
    <div className="ice-inbox dl-under-popup" role="dialog" aria-modal="true" aria-label={t('icebreaker.inbox.title', 'Icebreakers')}>
      {selected ? (
        <RequestDetail key={selected.id} item={selected} onBack={() => setSelectedId(null)} onDone={() => setSelectedId(null)} />
      ) : (
        <div className="ice-list-screen">
          <PageHeader title={t('icebreaker.inbox.title', 'Icebreakers')} subtitle={t('icebreaker.inbox.intro', 'Accepting creates a match and opens your chat.')} onBack={closeIcebreakerInbox} />
          <div className="ice-list">
            {!loaded && (
              <div className="ice-skeletons" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="ice-skel dl-skeleton" />
                ))}
              </div>
            )}
            {loaded && items.length === 0 && (
              <EmptyState
                icon={<MessageCircleHeart />}
                title={t('icebreaker.inbox.empty', 'No icebreakers right now')}
                description={t('icebreaker.inbox.emptySub', "When someone sends you a first message, it'll show up here.")}
              />
            )}
            {items.map((item, i) => (
              <RequestCard key={item.id} item={item} index={i} onOpen={() => setSelectedId(item.id)} />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

export default IcebreakerInbox;

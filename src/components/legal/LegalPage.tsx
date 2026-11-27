import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { COMPANY } from './legalInfo';

// Shared layout for About, Terms of Service and Privacy Policy: one dark
// surface like the rest of the app, a sticky back bar, a single scroll area,
// and every safe-area inset respected (notch, home indicator, and the sides in
// landscape).

interface LegalPageProps {
  title: string;
  updated?: string;
  intro?: React.ReactNode;
  onBack: () => void;
  /** Show a clickable table of contents (Parts if the page has them, otherwise sections). */
  contents?: boolean;
  children: React.ReactNode;
}

type ContentsItem = { id: string; label: string };

const LEGAL_LINKS = [
  { to: '/terms-of-service', key: 'legal.links.terms', fallback: 'Terms of Service' },
  { to: '/privacy-policy', key: 'legal.links.privacy', fallback: 'Privacy Policy' },
  { to: '/community-guidelines', key: 'legal.links.community', fallback: 'Community Guidelines' },
  { to: '/child-safety', key: 'legal.links.childSafety', fallback: 'Child Safety' },
  { to: '/safety-tips', key: 'legal.links.safetyTips', fallback: 'Safety Tips' },
];

// Headings sit below the sticky back bar when jumped to.
const ANCHOR_OFFSET = 'calc(env(safe-area-inset-top, 0px) + 72px)';

export const LegalPage = ({ title, updated, intro, onBack, contents = false, children }: LegalPageProps) => {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<ContentsItem[]>([]);

  // Build the contents list from the rendered headings, so it can never drift
  // from the document itself.
  useEffect(() => {
    if (!contents) return;
    const timer = window.setTimeout(() => {
      const body = bodyRef.current;
      if (!body) return;
      const parts = body.querySelectorAll<HTMLElement>('[data-toc-part]');
      const nodes = parts.length > 0 ? parts : body.querySelectorAll<HTMLElement>('[data-toc-section]');
      setToc(Array.from(nodes).map((node) => ({ id: node.id, label: node.dataset.tocPart || node.dataset.tocSection || '' })));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [contents]);

  // Smooth jump to a heading, instant when the user (or low-end tier) prefers reduced motion.
  const jumpTo = (id: string) => {
    const reduced =
      document.documentElement.dataset.motion === 'reduced' ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  // Give each page its own browser tab / search result title.
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | DripLove`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div
      className="min-h-fill h-full overflow-y-auto bg-black text-neutral-300"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <header
        className="sticky top-0 z-10 border-b border-white/10 bg-black/95"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 active:bg-white/15"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="truncate text-[15px] font-semibold text-white">{title}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pt-8">
        <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
        {updated && <p className="mt-2 text-sm text-neutral-500">{updated}</p>}
        {intro && <div className="mt-6 space-y-3 text-[15px] leading-relaxed">{intro}</div>}

        {toc.length > 0 && (
          <details
            className="group mt-8 rounded-xl border border-white/10 bg-white/[0.03]"
            open={toc.length <= 8}
          >
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400 [&::-webkit-details-marker]:hidden">
              {t('legal.contents', 'Contents')}
              <span aria-hidden className="text-base leading-none text-neutral-500 transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <nav aria-label={t('legal.contents', 'Contents')} className="px-4 pb-4">
              <ol className="space-y-0.5">
                {toc.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => jumpTo(item.id)}
                      className="min-h-[36px] w-full py-1.5 text-left text-[14px] leading-snug text-neutral-300 transition-colors hover:text-pink-400 active:text-pink-400"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </details>
        )}

        <div ref={bodyRef} className="mt-10 space-y-10 break-words">
          {children}
        </div>

        <footer className="mt-14 border-t border-white/10 pt-6 text-xs leading-relaxed text-neutral-500">
          <nav aria-label={t('legal.related', 'Related policies')} className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="inline-flex min-h-[32px] items-center text-pink-400 hover:underline">
                {t(l.key, l.fallback)}
              </Link>
            ))}
          </nav>
          © {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
        </footer>
      </main>
    </div>
  );
};

export const LegalSection = ({
  number,
  title,
  children,
}: {
  number?: number;
  title: string;
  children: React.ReactNode;
}) => (
  <section
    id={number !== undefined ? `section-${number}` : undefined}
    data-toc-section={number !== undefined ? `${number}. ${title}` : title}
    style={{ scrollMarginTop: ANCHOR_OFFSET }}
  >
    <h2 className="flex gap-3 text-lg font-semibold text-white">
      {number !== undefined && <span className="tabular-nums text-pink-500">{number}.</span>}
      {title}
    </h2>
    <div className="mt-3 space-y-3 text-[15px] leading-relaxed">{children}</div>
  </section>
);

// A group of sections ("Part II – Your Safety and Responsibility").
export const LegalPart = ({
  numeral,
  title,
  children,
}: {
  numeral: string;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-10">
    <div
      id={`part-${numeral.toLowerCase()}`}
      data-toc-part={`Part ${numeral} · ${title}`}
      className="border-t border-white/10 pt-8"
      style={{ scrollMarginTop: ANCHOR_OFFSET }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-500">Part {numeral}</p>
      <h2 className="mt-1 text-xl font-bold tracking-tight text-white">{title}</h2>
    </div>
    {children}
  </div>
);

export const LegalList = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="list-disc space-y-2 pl-5 marker:text-pink-500/70">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

export const LegalSubheading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="pt-1 text-[15px] font-semibold text-neutral-100">{children}</h3>
);

export const ContactCard = ({ team }: { team: string }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
    <p className="font-medium text-white">
      {COMPANY.name}, {team}
    </p>
    <a href={`mailto:${COMPANY.email}`} className="mt-1 inline-block text-pink-400 hover:underline">
      {COMPANY.email}
    </a>
  </div>
);

// Small inline link to another policy page.
export const PolicyLink = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link to={to} className="text-pink-400 hover:underline">
    {children}
  </Link>
);


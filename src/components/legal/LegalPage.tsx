import React, { useEffect } from 'react';
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
  children: React.ReactNode;
}

export const LegalPage = ({ title, updated, intro, onBack, children }: LegalPageProps) => {
  const { t } = useTranslation();

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
        className="sticky top-0 z-10 border-b border-white/10 bg-black/85 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="rounded-full p-2 text-white transition-colors hover:bg-white/10"
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

        <div className="mt-10 space-y-10">{children}</div>

        <footer className="mt-14 border-t border-white/10 pt-6 text-xs leading-relaxed text-neutral-500">
          © {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
          <br />
          {COMPANY.address}
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
  <section>
    <h2 className="flex gap-3 text-lg font-semibold text-white">
      {number !== undefined && <span className="tabular-nums text-pink-500">{number}.</span>}
      {title}
    </h2>
    <div className="mt-3 space-y-3 text-[15px] leading-relaxed">{children}</div>
  </section>
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
    <p className="mt-1 text-sm text-neutral-400">{COMPANY.address}</p>
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


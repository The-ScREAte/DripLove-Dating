import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ChevronLeft, Heart } from 'lucide-react';

// Public, shareable "link in bio" style page for DripLove.
// Lives at /links - reuses the exact welcome-screen gradient/brand palette so
// it reads as an official DripLove surface rather than a generic linktree
// clone. No auth, no app state - just brand + outbound links.
//
// Accessibility/contrast note: the brand gradient runs from a dark maroon
// down to a bright, fairly light magenta (#d6136e). White text sitting
// directly on that bright stop only hits ~5:1 contrast even at full
// opacity, and anything below full opacity fails WCAG AA. Rather than
// water down the brand gradient, all readable content sits inside one
// brand-tinted glass card (bg-[#2a0316]/65 + blur) so contrast holds
// regardless of where the card falls on the gradient, while the vivid
// gradient and bubbles stay visible around it for the "rich DripLove"
// backdrop.

const APP_LINK = 'https://driplove.love/r/o5f15uwE';
const PAGE_URL = 'https://www.driplove.love/links';
const OG_IMAGE = 'https://www.driplove.love/driplove-logo.png';
const PAGE_TITLE = 'DripLove — Slide into real love here. 💕';
const PAGE_DESCRIPTION =
  'Slide into real love here. Connect with DripLove, get the app, and follow us on social media.';

const SOCIALS = [
  {
    name: 'Instagram',
    handle: '@driplove_official',
    href: 'https://www.instagram.com/driplove_official?stkn=cGUwNnJ3cXhxaGU0&utm_source=qr',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.3" cy="6.7" r="1.15" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: 'TikTok',
    handle: '@driplovedating',
    href: 'https://www.tiktok.com/@driplovedating?_r=1&_t=ZN-99vc2sD9Pl8',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
        <path d="M16.6 5.82c-.9-.78-1.47-1.9-1.6-3.14h-3.05v13.1c0 1.55-1.26 2.8-2.8 2.8a2.8 2.8 0 0 1-2.8-2.8c0-1.55 1.25-2.81 2.8-2.81.28 0 .55.04.8.12v-3.1a5.93 5.93 0 0 0-.8-.06c-3.25 0-5.88 2.64-5.88 5.9s2.63 5.88 5.88 5.88 5.88-2.63 5.88-5.88V9.34a8.9 8.9 0 0 0 5.1 1.6V7.9a5.6 5.6 0 0 1-3.53-2.08Z" />
      </svg>
    ),
  },
  {
    name: 'Facebook',
    handle: 'DripLove',
    href: 'https://www.facebook.com/share/1cd6Wj5DtS/?mibextid=wwXIfr',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
        <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.9h-2.34V22c4.78-.8 8.44-4.95 8.44-9.94Z" />
      </svg>
    ),
  },
];

// Shared focus ring - explicit rather than relying on the browser default,
// since a default blue outline reads poorly against the pink brand
// background. High-contrast white, offset so it never gets clipped by a
// button's own rounded corners.
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

const LinksPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <link rel="canonical" href={PAGE_URL} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:site_name" content="DripLove" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="363" />
        <meta property="og:image:height" content="279" />
        <meta property="og:image:alt" content="DripLove logo" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={PAGE_URL} />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
      </Helmet>

      <div className="min-h-screen w-full flex flex-col items-center bg-gradient-to-br from-[#3d0320] via-[#7a0a40] to-[#d6136e] relative overflow-hidden">
        <style>{`
          @keyframes linksBubbleFloat {
            0% { transform: translate3d(0, 0, 0) scale(1); }
            50% { transform: translate3d(0, -12px, 0) scale(1.03); }
            100% { transform: translate3d(0, 0, 0) scale(1); }
          }
          @keyframes linksBubbleDrift {
            0% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(10px, -6px, 0); }
            100% { transform: translate3d(0, 0, 0); }
          }
          .links-bubble {
            will-change: transform;
            transform: translate3d(0, 0, 0);
            backface-visibility: hidden;
          }
          .links-bubble-a { animation: linksBubbleFloat 18s ease-in-out infinite; }
          .links-bubble-b { animation: linksBubbleDrift 22s ease-in-out infinite; }
          .links-bubble-c { animation: linksBubbleFloat 24s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .links-bubble { animation: none !important; }
          }
        `}</style>

        {/* Ambient bubbles - same brand language as the welcome screen, toned
            down, purely decorative and hidden from assistive tech */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="links-bubble links-bubble-a bg-[#ff2d87] opacity-20 rounded-full w-32 h-32 absolute top-16 -left-10" />
          <div className="links-bubble links-bubble-b bg-[#d6136e] opacity-20 rounded-full w-52 h-52 absolute bottom-24 -right-16" />
          <div className="links-bubble links-bubble-c bg-[#ff5fa3] opacity-15 rounded-full w-24 h-24 absolute top-1/3 right-6" />
        </div>

        {/* Back to app */}
        <Link
          to="/"
          aria-label="Back to the DripLove home screen"
          className={`absolute top-[calc(env(safe-area-inset-top,0px)+12px)] left-4 z-20 min-h-[44px] flex items-center gap-1 text-white hover:text-white/85 active:text-white/70 transition-colors bg-white/10 hover:bg-white/15 backdrop-blur-sm rounded-full pl-2 pr-4 py-2.5 text-xs font-semibold border border-white/15 touch-manipulation ${FOCUS_RING}`}
        >
          <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          DripLove
        </Link>

        <main
          aria-labelledby="links-heading"
          className="relative z-10 w-full max-w-sm sm:max-w-md flex flex-col items-center px-5 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+68px)] pb-[calc(env(safe-area-inset-bottom,0px)+28px)]"
        >
          {/* Logo + slogan */}
          <header className="flex flex-col items-center mb-6 sm:mb-7">
            <img
              src="/driplove-logo.webp"
              alt="DripLove"
              className="w-20 h-16 sm:w-24 sm:h-20 mb-3 drop-shadow-[0_4px_18px_rgba(0,0,0,0.35)]"
              loading="eager"
              decoding="async"
              width="96"
              height="80"
            />
            <h1
              id="links-heading"
              className="font-brush font-bold text-white text-center px-2"
              style={{ fontSize: 'clamp(20px, 6vw, 28px)' }}
            >
              <span className="sr-only">DripLove — </span>
              Slide into real love here. 💕
            </h1>
          </header>

          {/* Content card - keeps every piece of text and every button on a
              controlled, brand-tinted background so contrast holds no
              matter where it lands on the gradient behind it. */}
          <div className="w-full rounded-[28px] sm:rounded-[32px] bg-[#2a0316]/65 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)] px-5 sm:px-7 pt-7 pb-6 sm:pt-8 sm:pb-7 flex flex-col items-center">
            {/* Primary CTA - deliberately the strongest element on the page:
                solid white fill, largest text, deepest shadow. Social links
                below share its radius/spacing rhythm but stay visually
                quieter. */}
            <a
              href={APP_LINK}
              aria-describedby="cta-helper"
              className={`group w-full flex items-center justify-center gap-2.5 min-h-[56px] bg-white text-[#a3125c] font-bold text-base sm:text-[17px] rounded-2xl px-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:shadow-[0_14px_38px_rgba(0,0,0,0.42)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_6px_18px_rgba(0,0,0,0.3)] transition-all duration-200 touch-manipulation ${FOCUS_RING}`}
            >
              <Heart className="w-5 h-5 shrink-0" fill="currentColor" aria-hidden="true" />
              Get the DripLove App
            </a>
            <p id="cta-helper" className="text-white/80 text-xs mt-2.5 tracking-wide text-center">
              Opens in the App Store, Google Play, or on the web
            </p>

            {/* Divider */}
            <div className="w-full flex items-center gap-3 my-7">
              <div className="h-px flex-1 bg-white/20" />
              <h2
                id="follow-heading"
                className="text-white/85 text-[11px] font-semibold uppercase tracking-[0.15em] shrink-0"
              >
                Follow DripLove
              </h2>
              <div className="h-px flex-1 bg-white/20" />
            </div>

            {/* Socials - same corner radius as the CTA, same left/right
                rhythm; a translucent, "glass" fill keeps them visually
                quieter than the solid-white primary button. */}
            <nav aria-labelledby="follow-heading" className="w-full">
              <ul className="flex flex-col gap-3 list-none m-0 p-0">
                {SOCIALS.map((social) => (
                  <li key={social.name}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Follow DripLove on ${social.name} (opens in a new tab)`}
                      className={`w-full min-h-[56px] flex items-center gap-3.5 bg-white/10 hover:bg-white/[0.16] active:bg-white/20 border border-white/15 hover:border-white/30 rounded-2xl px-4 transition-all duration-200 touch-manipulation ${FOCUS_RING}`}
                    >
                      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-white/15 text-white shrink-0" aria-hidden="true">
                        {social.icon}
                      </span>
                      <span className="flex flex-col items-start text-left min-w-0">
                        <span className="text-white font-semibold text-sm leading-tight">{social.name}</span>
                        <span className="text-white/75 text-xs leading-tight truncate w-full">{social.handle}</span>
                      </span>
                      <ChevronLeft
                        className="ml-auto w-4 h-4 text-white/50 rotate-180 shrink-0"
                        aria-hidden="true"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Footer */}
          <p className="text-white/70 text-xs mt-7 text-center">
            © {new Date().getFullYear()} DripLove. Real people. Real love.
          </p>
        </main>
      </div>
    </>
  );
};

export default LinksPage;

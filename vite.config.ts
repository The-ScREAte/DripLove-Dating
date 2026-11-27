
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from 'rollup-plugin-visualizer';

// Leaf modules (import only vendor packages / each other) shared by the
// first-paint entry and the lazy page chunks - see manualChunks 'app-core'.
const APP_CORE_MODULES = [
  '/src/integrations/supabase/client.ts',
  '/src/integrations/supabase/types.ts',
  '/src/utils/platformUtils.ts',
  '/src/hooks/use-toast.ts',
  '/src/lib/utils.ts',
  '/src/components/ui/toast.tsx',
  '/src/components/ui/button.tsx',
  '/src/components/ui/input.tsx',
  '/src/components/ui/card.tsx',
  '/src/components/ui/badge.tsx',
  '/src/components/ui/label.tsx',
  '/src/components/ui/dialog.tsx',
  '/src/components/HoppingLogo.tsx',
  '/src/services/exchangeRateService.ts',
  '/src/hooks/usePricingConfig.ts',
  '/src/utils/iapOfferInfo.ts',
  '/src/components/forms/formTheme.ts',
  '/src/cache/chatCache.ts',
  '/src/constants/locationData.ts',
  '/src/services/pushNotifications.ts',
  '/src/components/ui/dropdown-menu.tsx',
  '/src/components/ui/toaster.tsx',
  '/src/components/ui/sonner.tsx',
  '/src/components/ui/tooltip.tsx',
  '/src/components/ui/LoadingStates.tsx',
  '/src/i18n/',
];


// Modules the app entry (src/main.tsx) reaches through static imports only.
// Computed once per build from Rollup's module graph.
let entryClosureCache: Set<string> | null = null;
const entryStaticClosure = (getModuleInfo: (id: string) => { importedIds: readonly string[] } | null): Set<string> => {
  if (entryClosureCache) return entryClosureCache;
  const closure = new Set<string>();
  const stack = [path.resolve(__dirname, 'src/main.tsx')];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (closure.has(cur) || cur.startsWith('\0') || cur.includes('node_modules')) continue;
    closure.add(cur);
    const info = getModuleInfo(cur);
    if (info) for (const dep of info.importedIds) stack.push(dep);
  }
  entryClosureCache = closure;
  return closure;
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Web must use absolute base so routes like /r/:id can load assets.
  // Capacitor builds need relative base so assets resolve under file://.
  base: mode === 'capacitor' ? './' : '/',
  server: {
    host: "::",
    port: 8080,
    // Optimize dev server performance
    hmr: {
      overlay: false, // Disable error overlay for faster HMR
    },
    watch: {
      // Exclude node_modules and other directories from watching
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**',
        '**/.nyc_output/**',
        '**/tmp/**',
        '**/temp/**',
        '**/android/**',
        '**/ios/**'
      ], 
      // Use polling with a reasonable interval to reduce file watcher usage
      usePolling: true,
      interval: 1000,
    },
  },
  define: {
    // Define process.env for browser compatibility
    'process.env': {},
  },
  plugins: [
    react(),
    // Only use visualizer in production builds
    ...(mode === 'production' ? [visualizer({ open: false, filename: 'dist/stats.html' })] : [])
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // CRITICAL: Force all dependencies to use the same React instance
    dedupe: ['react', 'react-dom'],
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      // Let Vite handle React core to avoid duplicate React instances
      'react-router-dom',
      '@supabase/supabase-js',
      'lucide-react',
      '@tanstack/react-query',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      'sonner',
      'i18next',
      'react-i18next'
    ],
    // Exclude heavy deps that should be lazy loaded
    exclude: ['@capacitor/core'],
    // Force re-bundling on certain changes
    force: false
  },
  // Build configuration
  build: {
    chunkSizeWarningLimit: 500, // Reduced from 1000kb for faster Android parsing
    // Optimize for mobile devices (especially Android)
    // Support floor = the native minimums: iOS 15.0 (Podfile/pbxproj) -> WebKit 15,
    // Android minSdk 26 with a Chromium 92+ System WebView. esbuild lowers any
    // syntax newer than this; cssTarget stops the CSS minifier from emitting
    // syntax older WebViews can't parse (e.g. modern color/nesting forms).
    target: ['es2020', 'chrome92', 'safari15'],
    cssTarget: ['chrome92', 'safari15'],
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production', // Remove ALL console.* in production
        drop_debugger: true,
        pure_funcs: mode === 'production' ? ['console.log', 'console.info', 'console.debug', 'console.warn', 'console.error', 'console.trace'] : [],
        passes: 3, // More compression passes for smaller output
        // The terser `unsafe_*` options were removed on purpose: they can change
        // behaviour (comparison operand order with NaN/valueOf, floating-point
        // re-association in distance/animation math, arrow/method rewrites that
        // break `new` calls) for a negligible size win - not worth a subtle
        // production-only bug on one device family.
      },
      format: {
        comments: false
      },
      mangle: {
        safari10: true // Ensure compatibility
      }
    },
    rollupOptions: {
      output: {
        manualChunks(id, { getModuleInfo }) {
          // CRITICAL: React must load before anything that depends on it
          if (id.includes('node_modules')) {
            // 1. React ecosystem - MUST be first (no libraries that use createContext!)
            if (id.includes('/react/') || id.includes('/react-dom/') || 
                id.includes('/scheduler/')) {
              return 'react-vendor';
            }
            
            // 2. React-dependent libraries (use createContext) - load AFTER react-vendor
            if (id.includes('/react-router') || id.includes('next-themes') || 
                id.includes('react-helmet')) {
              return 'react-libs';
            }
            
            // 2. Core dependencies (loaded after React)
            if (id.includes('@supabase/supabase-js') || id.includes('@supabase/postgrest-js') ||
                id.includes('@supabase/realtime-js') || id.includes('@supabase/storage-js') ||
                id.includes('@supabase/functions-js') || id.includes('@supabase/auth-js')) {
              return 'supabase-vendor';
            }
            
            if (id.includes('@tanstack/react-query') || id.includes('@tanstack/query-core')) {
              return 'query-vendor';
            }
            
            if (id.includes('i18next') || id.includes('react-i18next')) {
              return 'i18n-vendor';
            }
            
            // 3. UI dependencies
            if (id.includes('class-variance-authority') || id.includes('/clsx/') || id.includes('tailwind-merge')) {
              return 'ui-utils';
            }
            
            if (id.includes('sonner')) {
              return 'toast-vendor';
            }
            
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            
            // 4. Radix UI components (depend on React)
            if (id.includes('@radix-ui/react-dialog') || id.includes('@radix-ui/react-alert-dialog')) {
              return 'radix-dialog';
            }
            if (id.includes('@radix-ui/react-select') || id.includes('@radix-ui/react-checkbox') || 
                id.includes('@radix-ui/react-switch')) {
              return 'radix-forms';
            }
            if (id.includes('@radix-ui')) {
              return 'radix-ui-other';
            }
            
            // 5. Capacitor
            if (id.includes('@capacitor/core') || id.includes('@capacitor/app')) {
              return 'capacitor-core';
            }
            if (id.includes('@capacitor/') || id.includes('@capacitor-')) {
              return 'capacitor-plugins';
            }
            
            // 6. Tanstack Virtual
            if (id.includes('@tanstack/react-virtual') || id.includes('@tanstack/virtual-core')) {
              return 'virtual-vendor';
            }
            
            // 7. Date utilities
            if (id.includes('date-fns')) {
              return 'date-vendor';
            }
            
            // Don't create vendor-libs - let other dependencies stay in main bundle
            // to avoid loading order issues
          }
          
          // Shared foundation modules the first-paint entry (Index/Welcome/Auth)
          // needs. Without their own chunk Rollup absorbed them into whichever
          // big page chunk bundled them first (admin-page, discover-page,
          // profile-tools, chat-tools), so the entry statically depended on -
          // and the browser eagerly downloaded - entire pages (~2MB raw) before
          // first paint. Every module listed here imports only vendor packages
          // or other modules in this same list (leaf chunk -> no circular init).
          if (APP_CORE_MODULES.some((m) => id.includes(m))) {
            return 'app-core';
          }

          // Automatic version of the list above: any app module the entry
          // statically imports (transitively) goes to app-core. That set is
          // closed under static imports, so app-core can only import vendor
          // chunks or itself - never a page chunk - which keeps the first-paint
          // load small and rules out the circular-init crash, without having to
          // remember to add every new shared file (popups, ratings, back stack,
          // profile-card helpers...) to a hand-kept list.
          if (!id.includes('node_modules') && entryStaticClosure(getModuleInfo).has(id)) {
            return 'app-core';
          }

          // Tiny lazy route: with experimentalMinChunkSize Rollup merged it into
          // the entry chunk, which then statically imported FaceVerification
          // (profile-tools) and made the whole profile bundle eager. A manual
          // chunk is exempt from that merge, keeping it truly lazy.
          if (id.includes('/src/pages/FaceVerificationPage')) {
            return 'face-verification-page';
          }

          // Split large app components for better Android performance
          if (id.includes('/src/components/DiscoverPage')) {
            return 'discover-page';
          }
          if (id.includes('/src/components/ChatPage')) {
            return 'chat-page';
          }
          if (id.includes('/src/components/ProfilePage')) {
            return 'profile-page';
          }
          if (id.includes('/src/components/AdminPage')) {
            return 'admin-page';
          }
          if (id.includes('/src/components/LikedMePage')) {
            return 'liked-page';
          }
          
          // Each admin/* sub-panel is individually lazy() + Suspense'd per
          // tab in AdminPage.tsx now (only AdminErrorBoundary stays static).
          // Forcing all of them into one 'admin-tools' bucket here would
          // undo that - every tab's dynamic import would still pull in one
          // shared 220KB blob containing every OTHER tab's code too. Leaving
          // this unassigned lets Rollup split each lazy import into its own
          // chunk, so opening one admin tab loads only that tab's code.

          // PhotoCropModal is now lazy-imported from RegistrationForm/
          // ProfileCompletionPage, which aren't otherwise chunked (they load
          // eagerly, pre-auth). Lumping it into 'profile-tools' pulled that
          // chunk's existing circular dependency (profile-tools <-> discover-
          // tools <-> profile-page <-> react-libs) into the eager load path,
          // producing a real "Cannot access 'a' before initialization" crash
          // on first paint - giving it its own isolated chunk breaks that.
          if (id.includes('/src/components/profile/PhotoCropModal')) {
            return 'photo-crop-modal';
          }

          // Shared cultural-sign data (used by both a profile/ component -
          // AdinkraSection - and discover/ components - UserAdinkraDisplay,
          // AdinkraBar) with no manualChunks rule of its own, Rollup folded it
          // into whichever chunk happened to bundle it first (discover-tools),
          // making profile-tools import it back FROM discover-tools - the
          // same profile-tools <-> discover-tools cycle noted above for
          // PhotoCropModal, producing the identical "Cannot access before
          // initialization" crash on first paint. Isolating it here the same
          // way breaks the cycle: both sides import this shared chunk instead
          // of each other.
          if (id.includes('/src/constants/africanSymbols') || id.includes('/src/constants/signCompatibility')) {
            return 'adinkra-data';
          }

          // Profile sub-components
          if (id.includes('/src/components/profile/')) {
            return 'profile-tools';
          }
          
          // Chat sub-components
          if (id.includes('/src/components/chat/')) {
            return 'chat-tools';
          }
          
          // Discover sub-components
          if (id.includes('/src/components/discover/')) {
            return 'discover-tools';
          }
          
          // IAP related code
          if (id.includes('/src/iap') || id.includes('/src/utils/iap')) {
            return 'iap-module';
          }
        },
        // Optimize chunk naming for better caching
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId ?? '';
          if (facadeModuleId.includes('node_modules')) {
            return 'vendor/[name]-[hash].js';
          }
          return 'chunks/[name]-[hash].js';
        },
        // Smaller chunks for faster Android parsing
        experimentalMinChunkSize: 10000, // 10kb minimum for optimal mobile performance
      },
    },
    // Enable build reporting to track bundle size
    reportCompressedSize: true,
    // Optimize CSS code splitting
    cssCodeSplit: true,
  },
  // Enable build cache for faster rebuilds
  cacheDir: '.vite-cache',
}));

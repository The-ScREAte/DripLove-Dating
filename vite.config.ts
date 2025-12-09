
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? './' : '/',
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
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
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
    chunkSizeWarningLimit: 1000, // Increase from default 500kb to 1000kb
    // Optimize for mobile devices (especially Android)
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production', // Remove console.* in production
        drop_debugger: true,
        pure_funcs: mode === 'production' ? ['console.log', 'console.info', 'console.debug', 'console.warn'] : [],
        passes: 2, // Multiple compression passes for smaller output
        unsafe_arrows: true,
        unsafe_methods: true,
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
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // Supabase
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            // Radix UI - split by category
            if (id.includes('@radix-ui/react-dialog') || id.includes('@radix-ui/react-alert-dialog')) {
              return 'radix-dialog';
            }
            if (id.includes('@radix-ui/react-select') || id.includes('@radix-ui/react-checkbox') || 
                id.includes('@radix-ui/react-radio-group') || id.includes('@radix-ui/react-switch')) {
              return 'radix-forms';
            }
            if (id.includes('@radix-ui')) {
              return 'radix-ui-other';
            }
            // UI utilities
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            if (id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'ui-utils';
            }
            // Capacitor plugins - split by functionality
            if (id.includes('@capacitor/core') || id.includes('@capacitor/app')) {
              return 'capacitor-core';
            }
            if (id.includes('@capacitor/')) {
              return 'capacitor-plugins';
            }
            // i18next - separate chunk for translations
            if (id.includes('i18next') || id.includes('react-i18next')) {
              return 'i18n-vendor';
            }
            // Tanstack Query
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor';
            }
            // Sonner toasts
            if (id.includes('sonner')) {
              return 'toast-vendor';
            }
            // Date utilities
            if (id.includes('date-fns')) {
              return 'date-vendor';
            }
            // All other small vendors (keep this small!)
            return 'vendor-libs';
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
          
          // Admin components in separate chunk
          if (id.includes('/src/components/admin/')) {
            return 'admin-tools';
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
        // Smaller chunks for Android
        experimentalMinChunkSize: 20000, // 20kb minimum
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

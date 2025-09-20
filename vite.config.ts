
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
      'tailwind-merge'
    ],
    // Force re-bundling on certain changes
    force: false
  },
  // Build configuration
  build: {
    chunkSizeWarningLimit: 1000, // Increase from default 500kb to 1000kb
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks to optimize loading
          'react-vendor': ['react', 'react-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'ui-vendor': ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-alert-dialog'],
        },
      },
    },
  },
}));

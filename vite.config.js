/**
 * Noesis.io Health — Vite build configuration
 * © 2026 Athena Core Technologies, Inc.
 *
 * The legacy single-file frontend (`noesis-health-app.jsx`) was authored
 * against CRA-style environment variables (`process.env.REACT_APP_*`).
 * To avoid invasive refactors of that 4,900-line file, we shim those
 * variables at build time via Vite's `define` config and resolve `.jsx`
 * extensions explicitly.
 */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['REACT_APP_', 'VITE_']);

  return {
    plugins: [react({
      // Allow .jsx in our root JSX file
      include: '**/*.{jsx,js}',
    })],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@app': path.resolve(__dirname, '.'),
      },
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    },
    define: {
      // Shim process.env for legacy CRA-style env access in noesis-health-app.jsx
      'process.env.REACT_APP_API_URL': JSON.stringify(
        env.REACT_APP_API_URL || env.VITE_API_URL || 'http://localhost:3001/api/v1'
      ),
      'process.env.REACT_APP_VERSION': JSON.stringify(env.REACT_APP_VERSION || '1.0.0'),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    build: {
      outDir: 'build',
      sourcemap: mode !== 'production',
      target: 'es2020',
      // Capacitor iOS WebView serves from the app bundle; avoid hashed asset
      // names that complicate offline cache invalidation? Keep hashes for
      // proper web cache busting; iOS will pick up new assets on each build.
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            charts: ['recharts'],
            icons: ['lucide-react'],
          },
        },
      },
    },
    server: {
      port: 3000,
      strictPort: false,
      proxy: {
        '/api/v1': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});

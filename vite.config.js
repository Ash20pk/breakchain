import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import legacy from '@vitejs/plugin-legacy';
import { createHtmlPlugin } from 'vite-plugin-html';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Base public path when served in production
    base: '/',
    
    // Directory to serve as plain static assets
    publicDir: 'public',
    
    // Configure resolve aliases
    resolve: {
      alias: {
        // Ensure Phaser is properly imported
        phaser: resolve(__dirname, './node_modules/phaser/dist/phaser-arcade-physics.js')
      }
    },
    
    // Define environment variables to expose to the client
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      // Make sure we handle the legacy openssl provider env
      'process.env.NODE_OPTIONS': JSON.stringify('--openssl-legacy-provider'),
      // API endpoint from env if available
      'process.env.API_ENDPOINT': JSON.stringify(env.API_ENDPOINT || null),
      // Ensure phaser WebGL and Canvas are set
      'CANVAS_RENDERER': true,
      'WEBGL_RENDERER': true
    },
    
    // Configure server options
    server: {
      host: 'localhost',
      port: 3000,
      open: true,
    },
    
    // Build options
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: mode === 'development',
      // Configure rollup
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ['phaser'],
            vendor: ['@reown/appkit', '@reown/appkit-adapter-wagmi', '@wagmi/core'],
          }
        }
      },
      // Limits for chunk and asset size warnings
      chunkSizeWarningLimit: 1000,
    },
    
    // Plugins
    plugins: [
      // Legacy browsers support
      legacy({
        targets: ['>0.25%', 'not IE 11', 'not op_mini all'],
      }),
      
      // HTML template handling
      createHtmlPlugin({
        minify: mode === 'production',
        inject: {
          data: {
            title: 'Dino Runner',
            description: 'A Chrome Dino game clone built with Phaser 3',
          }
        }
      }),
      
      // PWA support
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt'],
        manifest: {
          name: 'Dino Runner',
          short_name: 'Dino',
          description: 'A Chrome Dino game clone built with Phaser 3',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'fullscreen',
          icons: [
            {
              src: '/favicons/android-chrome-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/favicons/android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,gif,wav,mp3,woff,woff2,ttf,eot}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          skipWaiting: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        }
      }),
      
      // Copy static assets
      viteStaticCopy({
        targets: [
          {
            src: 'assets/**/*',
            dest: 'assets/'
          }
        ],
        // Exclude raw assets and md files (similar to the webpack config)
        flatten: false
      })
    ],
    
    // Optimization options
    optimizeDeps: {
      include: ['phaser'],
      exclude: []
    }
  };
});
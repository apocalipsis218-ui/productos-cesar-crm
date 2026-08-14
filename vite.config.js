import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const SUPABASE_HOST_BY_MODE={
  production:'jmcbaduxjrzfnesbslmp.supabase.co',
  staging:'odlwbuagtrgmfpdohors.supabase.co'
};

function validateSupabaseBuildEnv(mode){
  const fileEnv=loadEnv(mode,process.cwd(),'VITE_');
  const supabaseUrl=(process.env.VITE_SUPABASE_URL||fileEnv.VITE_SUPABASE_URL||'').trim();
  const supabaseKey=(process.env.VITE_SUPABASE_ANON_KEY||fileEnv.VITE_SUPABASE_ANON_KEY||'').trim();
  const placeholder=/TU_|PEGA_AQUI|tu-proyecto/i;

  if(!supabaseUrl||placeholder.test(supabaseUrl)){
    throw new Error('[build] VITE_SUPABASE_URL no está configurada. Se bloqueó la publicación.');
  }
  if(!supabaseKey||placeholder.test(supabaseKey)){
    throw new Error('[build] VITE_SUPABASE_ANON_KEY no está configurada. Se bloqueó la publicación.');
  }

  let parsedUrl;
  try{parsedUrl=new URL(supabaseUrl);}catch{
    throw new Error('[build] VITE_SUPABASE_URL no es una URL válida.');
  }
  const expectedHost=SUPABASE_HOST_BY_MODE[mode]||SUPABASE_HOST_BY_MODE.production;
  if(parsedUrl.protocol!=='https:'||parsedUrl.hostname!==expectedHost){
    throw new Error(`[build] El proyecto Supabase no corresponde al entorno ${mode}.`);
  }
  if(/service_role|sb_secret_/i.test(supabaseKey)){
    throw new Error('[build] Se detectó una clave secreta de Supabase en el cliente. Publicación bloqueada.');
  }
  if(!supabaseKey.startsWith('sb_publishable_')&&!supabaseKey.startsWith('eyJ')){
    throw new Error('[build] La clave pública de Supabase no tiene un formato permitido.');
  }
}

export default defineConfig(({command,mode})=>{
  if(command==='build') validateSupabaseBuildEnv(mode);
  return ({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png'
      ],
      manifest: {
        id: '/',
        name: 'Productos César CRM',
        short_name: 'Productos César',
        description: 'CRM operativo de Productos César para órdenes, carnicería, facturación, validación, delivery y liquidación.',
        lang: 'es-DO',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#9f1239',
        orientation: 'any',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\//i,
            handler: 'NetworkOnly',
            method: 'GET',
            options: {
              cacheName: 'supabase-network-only'
            }
          },
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\//i,
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              cacheName: 'supabase-network-only'
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ]
  });
});

import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const vite=fs.readFileSync(new URL('../vite.config.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

function ok(cond,label){
  if(!cond){ console.error('ERROR - '+label); process.exit(1); }
  console.log('OK - '+label);
}

ok(['9.3.1','9.3.2','9.3.3','9.3.4','9.3.5'].includes(pkg.version),'package conserva la PWA desde V9.3.1');
ok(pkg.devDependencies?.['vite-plugin-pwa'],'vite-plugin-pwa instalado');
ok(vite.includes("registerType: 'prompt'"),'actualización controlada por aviso');
ok(vite.includes("display: 'standalone'"),'manifest abre como aplicación independiente');
ok(vite.includes("handler: 'NetworkOnly'") && vite.includes('supabase'),'Supabase no se almacena en caché');
ok(vite.includes('cleanupOutdatedCaches: true'),'cachés anteriores se limpian');
ok(vite.includes('maximumFileSizeToCacheInBytes'),'bundle principal incluido de forma explícita');
ok(main.includes("import { initPwa } from './pwa.js';") && main.includes('initPwa();'),'PWA integrada al arranque');
ok(/V9\.3\.(?:[1-9]|\d{2,}) PWA/.test(main),'versión PWA actual visible');
ok(pwa.includes('beforeinstallprompt'),'instalación desde la aplicación');
ok(pwa.includes('onNeedRefresh'),'aviso de nueva versión');
ok(pwa.includes('onOfflineReady'),'confirmación de estructura disponible');
ok(pwa.includes('pwa-offline-lock'),'bloqueo operativo sin conexión');
ok(pwa.includes("window.addEventListener('online'") && pwa.includes("window.addEventListener('offline'"),'detección de conexión');
ok(css.includes('V9.3.1 PWA') && css.includes('.pwa-install-button'),'estilos PWA incluidos');
ok(html.includes('theme-color') && html.includes('apple-touch-icon'),'metadatos móviles incluidos');
ok(fs.existsSync(new URL('../public/pwa-192x192.png',import.meta.url)),'icono 192 disponible');
ok(fs.existsSync(new URL('../public/pwa-512x512.png',import.meta.url)),'icono 512 disponible');
ok(fs.existsSync(new URL('../public/pwa-maskable-512x512.png',import.meta.url)),'icono maskable disponible');
ok(pkg.scripts.test.includes('auditoria_pwa_v931.mjs'),'auditoría PWA integrada en npm test');

console.log('Auditoría Productos César CRM PWA V9.3.1 aprobada.');

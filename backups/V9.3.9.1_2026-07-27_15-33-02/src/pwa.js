import { registerSW } from 'virtual:pwa-register';

const APP_VERSION = 'V9.3.9.0 PWA';
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

let deferredInstallPrompt = null;
let updateServiceWorker = async () => {};
let registrationRef = null;
let openedOffline = false;

function isStandalone(){
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function ensurePwaLayer(){
  let layer = document.getElementById('pwa-layer');
  if(layer) return layer;

  layer = document.createElement('div');
  layer.id = 'pwa-layer';
  layer.innerHTML = `
    <button id="pwa-install-button" class="pwa-install-button" type="button" hidden>
      Instalar aplicación
    </button>

    <section id="pwa-notice" class="pwa-notice" role="status" aria-live="polite" hidden>
      <div>
        <strong id="pwa-notice-title">Productos César</strong>
        <span id="pwa-notice-text"></span>
      </div>
      <div class="pwa-notice-actions">
        <button id="pwa-notice-primary" type="button" hidden></button>
        <button id="pwa-notice-close" type="button" class="gray">Cerrar</button>
      </div>
    </section>

    <section id="pwa-offline-lock" class="pwa-offline-lock" role="alertdialog" aria-modal="true" hidden>
      <div class="pwa-offline-card">
        <div class="pwa-offline-logo">PC</div>
        <h2>Sin conexión a internet</h2>
        <p>La aplicación puede abrir, pero los movimientos del negocio no deben consultarse ni guardarse hasta recuperar la conexión con Supabase.</p>
        <div class="pwa-offline-version">${APP_VERSION}</div>
        <button id="pwa-retry-button" type="button">Reintentar conexión</button>
      </div>
    </section>
  `;
  document.body.appendChild(layer);
  return layer;
}

function notice({title='Productos César', text='', actionLabel='', onAction=null, persistent=false} = {}){
  ensurePwaLayer();
  const box = document.getElementById('pwa-notice');
  const titleEl = document.getElementById('pwa-notice-title');
  const textEl = document.getElementById('pwa-notice-text');
  const primary = document.getElementById('pwa-notice-primary');
  const close = document.getElementById('pwa-notice-close');

  titleEl.textContent = title;
  textEl.textContent = text;
  primary.hidden = !actionLabel;
  primary.textContent = actionLabel || '';
  primary.onclick = actionLabel && onAction ? onAction : null;
  close.onclick = () => { box.hidden = true; };
  box.hidden = false;

  if(!persistent){
    window.clearTimeout(notice.timer);
    notice.timer = window.setTimeout(() => {
      if(box && !box.hidden) box.hidden = true;
    }, 7000);
  }
}

function updateInstallButton(){
  ensurePwaLayer();
  const button = document.getElementById('pwa-install-button');
  const canInstall = Boolean(deferredInstallPrompt) && !isStandalone();
  button.hidden = !canInstall;
  button.onclick = canInstall ? async () => {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    button.hidden = true;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    if(choice?.outcome === 'accepted'){
      notice({title:'Aplicación instalada', text:'Productos César quedó disponible desde la pantalla principal.'});
    }
  } : null;
}

function setConnectionUi(){
  ensurePwaLayer();
  const offline = !navigator.onLine;
  const lock = document.getElementById('pwa-offline-lock');
  document.documentElement.classList.toggle('pwa-is-offline', offline);
  lock.hidden = !offline;
  if(offline) openedOffline = true;
}

async function checkForUpdate(){
  try{
    await registrationRef?.update();
  }catch(error){
    console.warn('No se pudo comprobar una actualización de la PWA.', error);
  }
}

export function initPwa(){
  ensurePwaLayer();
  openedOffline = !navigator.onLine;
  setConnectionUi();
  updateInstallButton();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButton();
    notice({title:'Aplicación instalada', text:'Abre Productos César desde su nuevo icono.'});
  });

  window.addEventListener('offline', () => {
    setConnectionUi();
  });

  window.addEventListener('online', () => {
    setConnectionUi();
    notice({
      title:'Conexión restablecida',
      text: openedOffline ? 'Actualiza los datos antes de continuar trabajando.' : 'La comunicación con internet volvió a estar disponible.',
      actionLabel: openedOffline ? 'Actualizar datos' : '',
      onAction: openedOffline ? () => window.location.reload() : null,
      persistent: openedOffline
    });
    openedOffline = false;
    checkForUpdate();
  });

  document.getElementById('pwa-retry-button').onclick = () => {
    if(navigator.onLine){
      window.location.reload();
      return;
    }
    notice({title:'Todavía sin conexión', text:'Revisa el Wi-Fi o los datos móviles y vuelve a intentarlo.'});
  };

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh(){
      notice({
        title:'Nueva versión disponible',
        text:'Actualiza la aplicación para cargar las mejoras más recientes.',
        actionLabel:'Actualizar ahora',
        onAction: async () => {
          await updateServiceWorker(true);
        },
        persistent:true
      });
    },
    onOfflineReady(){
      notice({
        title:'Aplicación preparada',
        text:'La estructura de Productos César ya puede abrirse aun cuando falle la conexión.'
      });
    },
    onRegisteredSW(_swUrl, registration){
      registrationRef = registration || null;
      checkForUpdate();
      window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
    },
    onRegisterError(error){
      console.error('No se pudo registrar la PWA.', error);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') checkForUpdate();
  });
}

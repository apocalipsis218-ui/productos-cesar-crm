import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const main=read('src/main.js');
const css=read('src/styles.css');
const pkg=JSON.parse(read('package.json'));
const ok=(cond,msg)=>{ if(!cond){ console.error('ERROR - '+msg); process.exit(1); } console.log('OK - '+msg); };

ok((Number(pkg.version.split('.')[0])===9 && Number(pkg.version.split('.')[1])===3 && Number(pkg.version.split('.')[2])>=2)||pkg.version==='9.4.0','package V9.3.2 o superior');
ok(/V(?:9\.3\.(?:[2-9]|\d{2,})(?:\.\d+)?|9\.4\.0) PWA/.test(main),'versión V9.3.2 o superior visible');
ok(main.includes("pc_sidebar_collapsed_v932"),'preferencia local por dispositivo');
ok(main.includes('id="sidebarToggle"'),'botón para ocultar y mostrar la barra');
ok(main.includes('aria-controls="appSidebar"'),'botón accesible conectado al menú');
ok(main.includes('bindSidebarToggle()'),'evento del botón enlazado');
ok(main.includes('applySidebarCollapsed'),'estado plegado aplicado sin recargar el módulo');
ok(css.includes('V9.3.2 — NAVEGACIÓN LATERAL PLEGABLE'),'marcador CSS V9.3.2');
ok(css.includes('.shell.sidebar-collapsed'),'contenido se expande al ocultar la barra');
ok(css.includes('.shell.sidebar-collapsed .sidebar-toggle{left:0}'),'botón permanece visible con menú oculto');
ok(css.includes('@media(max-width:940px)') && css.includes('.sidebar-toggle{display:none!important}'),'navegación móvil preservada');
ok(pkg.scripts.test.includes('auditoria_sidebar_plegable_v932.mjs'),'auditoría V9.3.2 integrada en npm test');

console.log('Auditoría Barra Lateral Plegable V9.3.2 aprobada.');

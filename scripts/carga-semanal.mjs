// Carga semanal del stock SAP, sin intervención: abre la app (index.html de este
// repo) en un navegador sin ventana y usa el mismo botón "Carga semanal SAP" que
// usa una persona, así la lógica es exactamente la de la app.
//
// Uso:
//   node scripts/carga-semanal.mjs <archivo_stock.csv> [--simular]
//
//   --simular  solo muestra la vista previa (KPI y cambios); no escribe nada.
//
// Necesita salida a script.google.com y script.googleusercontent.com. Las llamadas
// al backend las hace Node (respeta HTTPS_PROXY con NODE_USE_ENV_PROXY=1), no el navegador.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
function cargarPlaywright() {
  const candidatos = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const c of candidatos) { try { return require(c); } catch (e) {} }
  throw new Error('No se encontró Playwright (npm i -g playwright)');
}

const args = process.argv.slice(2);
const archivo = args.find(a => !a.startsWith('--'));
const simular = args.includes('--simular');
if (!archivo || !fs.existsSync(archivo)) {
  console.error('Uso: node scripts/carga-semanal.mjs <archivo_stock.csv> [--simular]');
  process.exit(2);
}

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USUARIO = 'Claude (carga semanal automática)';
const { chromium } = cargarPlaywright();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const erroresPagina = [];
page.on('pageerror', e => erroresPagina.push(e.message));

// Backend: reenviar desde Node (sigue la redirección a script.googleusercontent.com)
await page.route('**/script.google.com/**', async route => {
  const req = route.request();
  try {
    const r = await fetch(req.url(), {
      method: req.method(),
      body: req.method() === 'POST' ? req.postData() : undefined,
      headers: req.method() === 'POST' ? { 'Content-Type': 'text/plain' } : undefined,
      redirect: 'follow'
    });
    await route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() });
  } catch (e) {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'Sin conexión con el backend: ' + e.message }) });
  }
});
// CDN de terceros (OCR del escáner) no hace falta acá
await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
await page.route('http://app.local/**', route => {
  const p = new URL(route.request().url()).pathname.replace(/^\/$/, '/index.html');
  const f = path.join(RAIZ, p);
  if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
});

const salida = { archivo: path.basename(archivo), simular, ok: false };
try {
  await page.goto('http://app.local/');
  await page.fill('#inp-usuario', USUARIO);
  await page.click('#btn-entrar');
  await page.waitForFunction(() =>
    getComputedStyle(document.getElementById('app')).display !== 'none'
    || document.getElementById('lbl-login-error').textContent.trim() !== '', null, { timeout: 90000 });
  const errLogin = await page.textContent('#lbl-login-error');
  if (errLogin.trim()) throw new Error('No se pudo entrar a la app: ' + errLogin.trim());
  // Esperar a que carguen los materiales (la tabla o el estado vacío)
  await page.waitForFunction(() => S.materiales.length > 0, null, { timeout: 120000 });
  salida.materiales_app = await page.evaluate(() => S.materiales.length);

  await page.evaluate(() => abrirCargaSemanal());
  await page.waitForTimeout(3000); // historial de KPI (para la variación)
  await page.setInputFiles('#inp-csv-semanal', archivo);
  await page.waitForSelector('#sem-preview', { state: 'visible', timeout: 60000 });

  salida.preview = await page.evaluate(() => ({
    ultima: document.getElementById('sem-ultima').textContent,
    resumen: document.getElementById('sem-resumen').textContent,
    cantidades: document.getElementById('lbl-sem-cantidad').textContent,
    ubicaciones: document.getElementById('lbl-sem-ubicacion').textContent,
    kpis: semanalData.kpis
  }));

  if (!simular) {
    await page.click('#btn-sem-procesar');
    await page.waitForFunction(() => {
      const li = document.querySelectorAll('#sem-pasos li');
      const err = [...li].some(x => x.className === 'err');
      return err || [...li].filter(x => x.className === 'ok').length >= 3;
    }, null, { timeout: 300000 });
    salida.pasos = await page.$$eval('#sem-pasos li', l => l.map(x => ({ ok: x.className === 'ok', texto: x.textContent })));
    salida.ok = salida.pasos.every(p => p.ok);
  } else {
    salida.ok = true;
  }
} catch (e) {
  salida.error = e.message;
} finally {
  salida.errores_pagina = erroresPagina;
  console.log(JSON.stringify(salida, null, 2));
  await browser.close();
  process.exit(salida.ok ? 0 : 1);
}

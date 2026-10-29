// Run with an isolated Chrome debugging session (port 9322) and the local dev server.
// Override CHROME_DEBUG_URL / SITE_URL if either uses a different port.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const chrome = process.env.CHROME_DEBUG_URL ?? 'http://127.0.0.1:9322';
const site = process.env.SITE_URL ?? 'http://127.0.0.1:4321';
const targets = await (await fetch(`${chrome}/json`)).json();
const target = targets.find((entry) => entry.type === 'page');
assert.ok(target, 'Open an isolated Chrome debugging session before running browser tests.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (!message.id) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(message.error);
  else resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, { resolve, reject });
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const waitFor = async (expression) => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(25);
  }
  assert.fail(`Timed out: ${expression}`);
};
const settle = async (selector) => {
  await click(selector);
  await waitFor('document.querySelector("[data-book]").getAttribute("aria-busy") === "false"');
};
const key = async (value) => {
  const keyCode = { Escape: 27, ArrowLeft: 37, ArrowRight: 39 }[value];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code: value, windowsVirtualKeyCode: keyCode });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code: value, windowsVirtualKeyCode: keyCode });
  await delay(90);
  if (await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches')) {
    await waitFor('document.querySelector("[data-book]").getAttribute("aria-busy") === "false"');
  }
};
const position = () => evaluate('document.querySelector("[data-book]").dataset.position');
const label = () => evaluate('document.querySelector("[data-page]").textContent');
const saveFrame = async (name) => {
  if (!process.env.ALBUM_SCREENSHOTS) return;
  const image = await send('Page.captureScreenshot');
  await writeFile(`${process.env.ALBUM_SCREENSHOTS}/leaf-${name}.png`, Buffer.from(image.data, 'base64'));
};

async function checkRestingLayers(page) {
  const faces = await evaluate(`Array.from(document.querySelectorAll('[data-face]'))
    .map(el => ({
      sheet: Number(el.closest('[data-sheet]').dataset.sheet),
      side: el.dataset.face, visible: getComputedStyle(el).visibility === 'visible',
      parentTransform: getComputedStyle(el.parentElement).transform,
      transformStyle: getComputedStyle(el.parentElement).transformStyle,
      faceTransform: getComputedStyle(el).transform,
    })).filter(face => face.visible)`);
  const expected = [];
  if (page > 0) expected.push({ sheet: page - 1, side: 'back' });
  if (page < 7) expected.push({ sheet: page, side: 'front' });
  assert.deepEqual(faces.map(({ sheet, side }) => ({ sheet, side })), expected, 'Only the two exposed faces participate in stacking');
  for (const face of faces) {
    assert.equal(face.parentTransform, 'none', 'Resting leaves are flat, not competing 3D surfaces');
    assert.equal(face.transformStyle, 'flat');
    assert.equal(face.faceTransform, 'none');
  }
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('.album-page')).every(el => getComputedStyle(el).backgroundImage === 'none')`), 'A page-local gradient must not mirror at the end of a turn');
  assert.ok(await evaluate(`(() => {
    const book = document.querySelector('[data-book]').getBoundingClientRect();
    const hinge = book.left + book.width / 2;
    return [...document.querySelectorAll('[data-face][data-visible="true"]')].every(face => {
      const rect = face.getBoundingClientRect();
      return face.dataset.face === 'front' ? rect.left >= hinge - 1 : rect.right <= hinge + 1;
    });
  })()`), 'The resting right page must never cross in front of the left page');
}

async function checkTurn(selector, from, to, sheetIndex, screenshots = false) {
  await checkRestingLayers(from);
  const previousLabel = await label();
  const sourceText = `Array.from(document.querySelectorAll('[data-sheet] > [data-face]')).map(el=>el.textContent)`;
  const contents = await evaluate(sourceText);
  const gutterBackground = await evaluate('getComputedStyle(document.querySelector("[data-gutter]")).backgroundImage');
  await click(selector);
  await waitFor('!!document.querySelector(".is-turning")');
  await evaluate(`window.testTurns = document.getAnimations().filter(a => a.effect?.target.matches?.('[data-sheet], [data-book], [data-gutter], .album-turn-shadow, .album-curl-strip')); window.testTurns.forEach(a => { a.pause(); a.currentTime = 0; })`);
  const flexible = sheetIndex > 0 && sheetIndex < 6;
  assert.equal(await evaluate('window.testTurns.length'), flexible ? 16 : 4, 'Leaf, curl, cast shadow and spine synchronize');
  assert.equal(await evaluate('document.querySelectorAll(".album-curl-strip").length'), flexible ? 12 : 0);
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".album-curl img")).every(img => img.complete && img.naturalWidth > 0 && img.loading === "eager")'), 'Every clipped image is ready before the paper is revealed');
  assert.equal(await label(), previousLabel, 'No eager page-label/content swap');
  assert.equal(await evaluate('document.querySelector("[data-book]").dataset.index'), String(from));
  assert.equal(await evaluate('document.querySelector(".is-turning").dataset.sheet'), String(sheetIndex));
  for (const time of [0, 180, 300, 450, 720, 899]) {
    await evaluate(`window.testTurns.forEach(a => a.currentTime = ${time})`);
    await delay(25);
    const geometry = await evaluate(`(() => {
      const sheet = document.querySelector('.is-turning');
      const matrix = new DOMMatrixReadOnly(getComputedStyle(sheet).transform);
      return {
        hinge: getComputedStyle(sheet).transformOrigin.split(' ')[0],
        x: matrix.m41, y: matrix.m42, z: matrix.m43,
        scale: Math.hypot(matrix.m11, matrix.m13),
        opacity: getComputedStyle(sheet).opacity,
      };
    })()`);
    assert.equal(geometry.hinge, '0px');
    assert.equal(geometry.x, 0, 'No independent horizontal cover/page translation');
    assert.equal(geometry.y, 0);
    assert.equal(geometry.z, 0);
    assert.ok(Math.abs(geometry.scale - 1) < .00001, 'No cover/page scaling');
    assert.equal(geometry.opacity, '1', 'Covers do not fade in or out');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-gutter]")).backgroundImage'), gutterBackground);
    const gutter = await evaluate(`(() => {
      const book = document.querySelector('[data-book]').getBoundingClientRect();
      const gutter = document.querySelector('[data-gutter]').getBoundingClientRect();
      return { width: gutter.width, offset: gutter.left - book.left - book.width / 2 };
    })()`);
    assert.ok(Math.abs(gutter.width - 36) < .01);
    assert.ok(Math.abs(gutter.offset + 18) < .01, 'The stationary gutter never changes side');
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('[data-sheet]:not(.is-turning)')).every(el => getComputedStyle(el).transform === 'none')`));
    assert.ok(await evaluate(`document.querySelectorAll('[data-face][data-visible="true"]').length <= 4`), 'Only the turning leaf and its immediate neighbours are exposed');
    assert.equal(await label(), previousLabel, 'The new spread is not committed mid-turn');
    assert.deepEqual(await evaluate(sourceText), contents, 'Faces retain their content throughout the turn');
    if (flexible && time === 450) {
      assert.ok(await evaluate(`Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.album-curl-strip:last-child')).transform).m43) > 10`), 'Paper visibly bends out of its rigid plane');
    }
    if (screenshots) await saveFrame(`${from}-${to}-${time}`);
  }
  // Repeated navigation while a leaf is in flight must not skip spreads.
  await click(selector);
  await evaluate('window.testTurns.forEach(a => a.finish())');
  await delay(80);
  assert.equal(await evaluate('document.querySelector("[data-book]").dataset.index'), String(to));
  assert.equal(await evaluate('document.querySelectorAll(".is-turning").length'), 0);
  assert.equal(await evaluate('document.querySelectorAll(".album-curl, .album-turn-shadow").length'), 0);
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-gutter]")).backgroundImage'), gutterBackground);
  assert.equal(await evaluate('document.getAnimations().filter(a => a.effect?.target.matches?.("[data-sheet], [data-book]")).length'), 0);
  await checkRestingLayers(to);
}
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: site });
  await delay(1200);
  assert.equal(await evaluate('document.querySelector("[data-open-album]").textContent.trim()'), '');
  assert.equal(await evaluate('document.querySelector("#theme-toggle").textContent.trim()'), '');
  if (await evaluate('document.documentElement.dataset.theme === "dark"')) await click('#theme-toggle');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".theme-moon")).display'), 'block');
  assert.equal(await evaluate('document.querySelector("#theme-toggle").getAttribute("aria-label")'), 'Switch to dark theme');
  await click('#theme-toggle');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".theme-sun")).display'), 'block');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".theme-moon")).display'), 'none');
  await send('Page.navigate', { url: site });
  await delay(800);
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark', 'Theme choice persists on reload');
  await click('#theme-toggle');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light');
  assert.equal(await evaluate('document.querySelectorAll("#research .sketch").length'), 0);
  assert.equal(await evaluate('document.querySelectorAll(".university-print, .university-letter").length'), 0);
  assert.equal(await evaluate('document.querySelector("[data-sheet=\\"5\\"] .sheet-back .academic-title").textContent'), 'Bilkent University');
  assert.equal(await evaluate('document.querySelector("[data-sheet=\\"6\\"] .sheet-front .academic-title").textContent'), 'Kingston University');
  await saveFrame('header');
  await evaluate('localStorage.setItem("duck-friend", "1")');
  for (let i = 0; i < 15; i++) {
    await click('[data-duck]');
    assert.ok(['quack quack', 'quackk', '🦆'].includes(await evaluate('document.querySelector("[data-bubble]").textContent')));
  }
  assert.equal(await evaluate('document.querySelectorAll(".duck").length'), 1);
  await click('[data-open-album]');
  assert.equal(await position(), 'front');
  assert.equal(await evaluate('document.querySelectorAll("[data-spread][data-active=\\"true\\"]").length'), 0);
  assert.equal(await evaluate(`document.querySelectorAll('[data-spread]:not([data-spread="2"]) .sketch').length`), 0);
  assert.equal(await evaluate(`document.querySelectorAll('[data-spread="2"] .sketch').length`), 2);
  assert.ok(await evaluate(`!document.querySelector('#album').textContent.includes('The duck is friendly.')`));
  assert.ok(await evaluate(`!document.querySelector('#album').textContent.includes('Selected chapters')`));
  assert.equal(await evaluate('document.querySelectorAll("[data-sheet]").length'), 7);
  await saveFrame('front');
  await evaluate('document.querySelector("[data-cover-open]").focus()');
  await settle('[data-cover-open]');
  assert.equal(await label(), 'Microsoft');
  assert.equal(await evaluate('document.querySelector("[data-spread=\\"1\\"]").querySelectorAll("img").length'), 3);
  await click('[data-spread="1"] [data-lightbox]');
  assert.equal(await evaluate('document.querySelector("#lightbox").open'), true);
  await key('Escape');
  assert.equal(await evaluate('document.querySelector("#lightbox").open'), false);
  assert.equal(await evaluate('document.querySelector("#album").open'), true);
  for (const expected of ['ASELSAN', 'Research / PRISM', 'CanvasPilot', 'ProctorHub', 'Education']) {
    await key('ArrowRight');
    assert.equal(await label(), expected);
    assert.equal(await evaluate('document.querySelectorAll("[data-spread][data-active=\\"true\\"]").length'), 2);
    if (expected === 'Education') await saveFrame('education');
  }
  await key('ArrowRight');
  assert.equal(await position(), 'back');
  assert.equal(await evaluate('document.querySelector("[data-cover=\\"back\\"] a").href'), 'mailto:iremesendemir48@gmail.com');
  await click('[data-restart]');
  assert.equal(await position(), 'front');

  // Freeze every turn at multiple points, including both covers in both directions.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  for (let from = 0; from < 7; from++) {
    await checkTurn('[data-next]', from, from + 1, from, [0, 1, 6].includes(from));
    if (from === 0) await saveFrame('microsoft');
  }
  assert.equal(await position(), 'back');
  await saveFrame('back');
  for (let from = 7; from > 0; from--) {
    await checkTurn('[data-prev]', from, from - 1, from - 1, [7, 1].includes(from));
  }
  assert.equal(await position(), 'front');

  // Closing a bending paper leaf must also dispose of its temporary mesh.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await settle('[data-next]');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await click('[data-next]');
  await waitFor('!!document.querySelector(".is-turning")');
  assert.equal(await evaluate('document.querySelectorAll(".album-curl-strip").length'), 12);
  await delay(120);
  await click('#album [data-close]');
  await delay(80);
  await click('[data-open-album]');
  assert.equal(await position(), 'front');
  assert.equal(await evaluate('document.querySelectorAll(".is-turning").length'), 0);
  assert.equal(await evaluate('document.querySelectorAll(".album-curl, .album-turn-shadow, .is-bending").length'), 0);

  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.ok(await evaluate('document.querySelector("#album").scrollWidth <= innerWidth'));
    await settle('[data-next]');
    assert.equal(await label(), 'Microsoft');
    assert.ok(await evaluate('document.querySelector("[data-mobile]").scrollHeight > document.querySelector("[data-mobile]").clientHeight'));
    await settle('[data-prev]');
  }
  await key('Escape');
  assert.equal(await evaluate('document.querySelector("#album").open'), false);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('Passed: stable symmetric gutter, 12-strip paper curl, rigid covers, 14 turns, separate university pages, no RNA decoration, icon controls, themes, mobile, cancellation, reduced motion.');
} finally {
  socket.close();
}

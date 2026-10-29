// Cold-cache regression tests: hold image requests until after navigation is clicked.
import assert from 'node:assert/strict';

const chrome = process.env.CHROME_DEBUG_URL ?? 'http://127.0.0.1:9322';
const site = process.env.SITE_URL ?? 'http://127.0.0.1:4321';
const target = (await (await fetch(`${chrome}/json`)).json()).find((entry) => entry.type === 'page');
assert.ok(target, 'Start an isolated Chrome debugging session first.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const held = new Set();
const requests = [];
const errors = [];
let blocked = 'canvaspilot-';
let failedPreview = '';
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  if (message.method === 'Fetch.requestPaused') {
    const { requestId, request } = message.params;
    if (failedPreview && request.url.endsWith(failedPreview)) {
      void send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch((error) => errors.push(error));
    } else if (blocked && request.url.includes(blocked)) {
      held.add(requestId);
    } else {
      void send('Fetch.continueRequest', { requestId }).catch((error) => errors.push(error));
    }
  }
  if (!message.id) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(message.error);
  else resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const waitFor = async (expression) => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(30);
  }
  assert.fail(`Timed out: ${expression}`);
};
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const index = () => evaluate('document.querySelector("[data-book]").dataset.index');
const release = async () => {
  blocked = '';
  const ids = [...held];
  held.clear();
  await Promise.all(ids.map((requestId) => send('Fetch.continueRequest', { requestId })));
};
let navigation = 0;
const navigate = async (page) => {
  await send('Page.navigate', { url: `${site}/?image-test=${++navigation}#album-${page}` });
  await waitFor(`document.querySelector('#album')?.open && document.querySelector('[data-book]')?.dataset.index === '${page}'`);
};
const freezeTurn = async () => {
  await waitFor('!!document.querySelector(".is-turning")');
  await evaluate(`window.imageTurns = document.getAnimations().filter(a => a.effect?.target.matches?.('[data-sheet], [data-book], [data-gutter], .album-turn-shadow, .album-curl-strip'));
    window.imageTurns.forEach(a => { a.pause(); a.currentTime = 450; });`);
};

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*images/projects/*', requestStage: 'Request' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  await navigate(3);
  await click('[data-next]');
  await delay(350);
  assert.ok(held.size >= 2, 'CanvasPilot previews are genuinely delayed, not served from a warm cache');
  assert.equal(await index(), '3');
  assert.equal(await evaluate('document.querySelectorAll(".is-turning").length'), 0, 'Do not begin turning a blank page');
  assert.equal(await evaluate('document.querySelector("[data-album-loading]").hidden'), false);
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".album-photo img")).every(img => Number(img.getAttribute("width")) > 0 && Number(img.getAttribute("height")) > 0)'), 'Reserve photo dimensions before download');
  assert.equal(requests.filter((url) => /canvaspilot-.*-full/.test(url)).length, 0, 'Album pages use previews, not multi-megabyte originals');
  await release();
  await freezeTurn();
  assert.equal(await evaluate('document.querySelectorAll(".album-curl img").length'), 24);
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".album-curl img")).every(img => img.complete && img.naturalWidth > 0 && img.loading === "eager")'), 'All clipped copies are loaded before any strip is visible');
  assert.equal(await evaluate('document.querySelector("[data-album-loading]").hidden'), true);
  await evaluate('window.imageTurns.forEach(a => a.finish())');
  await waitFor('document.querySelector("[data-book]").dataset.index === "4" && document.querySelector("[data-book]").getAttribute("aria-busy") === "false"');

  await click('[data-sheet="3"] .sheet-back [data-lightbox]');
  await waitFor('document.querySelector("#lightbox [data-img]").naturalWidth === 2940');
  assert.ok((await evaluate('document.querySelector("#lightbox [data-img]").src')).endsWith('canvaspilot-1-full.jpg'));
  await click('#lightbox [data-close]');

  // Delay bitmap decoding of the curl itself, independently of the source images.
  await evaluate(`window.nativeImageDecode = HTMLImageElement.prototype.decode;
    window.releaseClones = [];
    HTMLImageElement.prototype.decode = function() {
      const ready = window.nativeImageDecode.call(this);
      return this.closest('.album-curl') ? ready.then(() => new Promise(resolve => window.releaseClones.push(resolve))) : ready;
    };`);
  await click('[data-prev]');
  await waitFor('window.releaseClones.length === 24');
  assert.equal(await evaluate('document.querySelectorAll(".is-turning, .is-bending").length'), 0);
  assert.equal(await evaluate('document.querySelector(".album-curl").hidden'), true, 'The original page stays visible while copies decode');
  await click('#album [data-close]');
  await delay(50);
  assert.equal(await evaluate('document.querySelectorAll(".album-curl, .album-turn-shadow").length'), 0, 'Closing disposes even an unstarted curl immediately');
  await click('[data-open-album]');
  await evaluate('HTMLImageElement.prototype.decode = window.nativeImageDecode; window.releaseClones.forEach(resolve => resolve())');
  await delay(100);
  assert.equal(await index(), '0', 'Late decodes must not commit an abandoned turn');

  // Repeat the cold-load case using the mobile-only spreads.
  blocked = 'proctorhub-';
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(4);
  await click('[data-next]');
  await delay(350);
  assert.ok(held.size >= 2, 'Mobile previews are also tested with pending requests');
  assert.equal(await index(), '4');
  await click('#album [data-close]');
  await delay(50);
  assert.equal(await evaluate('document.querySelector("[data-album-loading]").hidden'), true);
  await release();
  await delay(350);
  assert.equal(await evaluate('document.querySelector("#album").open'), false);
  assert.equal(await index(), '4', 'Closing while downloading cancels mobile navigation');
  await click('[data-open-album]');
  assert.equal(await index(), '0');

  // A missing preview presents a fallback rather than locking navigation.
  failedPreview = 'canvaspilot-1.jpg';
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(3);
  await click('[data-next]');
  await waitFor('document.querySelector("[data-book]").dataset.index === "4" && document.querySelector("[data-book]").getAttribute("aria-busy") === "false"');
  assert.ok(await evaluate('!!document.querySelector("[data-sheet=\\"3\\"] .image-unavailable")'));
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-sheet=\\"3\\"] .image-unavailable .album-image-fallback")).display'), 'block');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('Passed: cold image loads, delayed requests and bitmap decodes, loaded curl copies, full-resolution lightbox, mobile cancellation, missing-preview fallback.');
} finally {
  await release();
  await send('Fetch.disable');
  await send('Network.setCacheDisabled', { cacheDisabled: false });
  socket.close();
}

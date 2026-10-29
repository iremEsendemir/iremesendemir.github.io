// Run against the local server and an isolated Chrome debugging session.
import assert from 'node:assert/strict';
import { access, writeFile } from 'node:fs/promises';

const site = process.env.SITE_URL ?? 'http://127.0.0.1:4321';
const chrome = process.env.CHROME_DEBUG_URL ?? 'http://127.0.0.1:9322';
const response = await fetch(site);
assert.equal(response.status, 200);
const html = await response.text();
assert.ok(!html.includes('id="album"') && !html.includes('data-open-album'));
assert.ok(html.includes('Recipeasy') && html.includes('UART') && !html.includes('NVIDIA Jetson AGX Orin'));
assert.ok(!html.includes('/images/projects/proctorhub-'));
assert.ok(!html.includes('EsendemirCV.pdf') && !html.includes('Resume'));
assert.ok(!html.includes('id="duck"') && !html.includes('data-duck') && !html.includes('The duck is friendly.'));
for (const path of ['/album', '/album/', '/album-4']) {
  const unavailable = await fetch(`${site}${path}`);
  assert.equal(unavailable.status, 404, `${path} must not expose an album`);
  const body = await unavailable.text();
  assert.ok(!body.includes('id="album"') && !body.includes('id="duck"') && !body.includes('The duck'));
}
for (const filename of ['EIremEsendemirCV.pdf', 'IremEsendemirCV.pdf']) {
  assert.equal((await fetch(`${site}/${filename}`)).status, 404, 'Resume must not remain available by direct URL');
  await assert.rejects(access(new URL(`../public/${filename}`, import.meta.url)), { code: 'ENOENT' });
}

const target = (await (await fetch(`${chrome}/json`)).json()).find((entry) => entry.type === 'page');
assert.ok(target, 'Open an isolated Chrome debugging session before running browser tests.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
const requests = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
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
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(30);
  }
  assert.fail(`Timed out: ${expression}`);
};
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
let navigation = 0;
const navigate = async (hash = '') => {
  await send('Page.navigate', { url: `${site}/?portfolio-test=${++navigation}${hash}` });
  await waitFor(`location.search === '?portfolio-test=${navigation}' && document.readyState === "complete" && !!document.querySelector("#theme-toggle") && !!document.querySelector("#research")`);
};
const photo = async (name) => {
  if (!process.env.PORTFOLIO_SCREENSHOTS) return;
  const screenshot = await send('Page.captureScreenshot');
  await writeFile(`${process.env.PORTFOLIO_SCREENSHOTS}/${name}.png`, Buffer.from(screenshot.data, 'base64'));
};
const article = (name) => `Array.from(document.querySelectorAll('#projects article')).find(el => el.querySelector('h3').textContent === ${JSON.stringify(name)})`;

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate();
  assert.equal(await evaluate('document.querySelectorAll("#album, [data-open-album], [data-sheet]").length'), 0);
  assert.deepEqual(await evaluate(`(() => {
    const job = [...document.querySelectorAll('#experience .timeline > li')].find(el => el.querySelector('h3').textContent === 'Microsoft');
    return [...job.querySelectorAll('ul > li')].map(el => el.textContent);
  })()`), [
    'Built a VS Code dashboard for inspecting and managing Azure PostgreSQL Elastic Clusters.',
    'Added shard-skew analysis to identify uneven data distribution and recommend tenant isolation or shard splitting.',
  ]);
  assert.equal(await evaluate('document.querySelectorAll("#projects article").length'), 5);
  assert.equal(await evaluate('document.querySelectorAll("#projects article[data-project-size=compact]").length'), 2);
  for (const name of ['Recipeasy', 'UART']) {
    assert.equal(await evaluate(`(${article(name)}).dataset.projectSize`), 'compact');
    assert.equal(await evaluate(`(${article(name)}).querySelectorAll('svg[data-project-icon][aria-hidden=true]').length`), 1);
    assert.ok(await evaluate(`Array.from((${article(name)}).querySelectorAll('svg path, svg rect')).every(el => getComputedStyle(el).outlineStyle === 'none')`), 'Icon strokes must not pick up Tailwind outline boxes');
  }
  assert.equal(await evaluate('document.querySelector("body > header a").textContent'), 'E. İrem Esendemir');
  assert.ok(await evaluate('Array.from(document.querySelectorAll("a[href*=\'linkedin.com\']")).every(a => a.href === "https://www.linkedin.com/in/emine-irem-esendemir/")'));
  assert.equal(await evaluate('document.querySelectorAll("a[href$=\'.pdf\']").length'), 0);
  assert.deepEqual(await evaluate(`Array.from((${article('PRISM')}).querySelectorAll('a'), a => a.href)`), ['https://prismdevtools.com/']);
  for (const [name, url] of [
    ['CanvasPilot', 'https://github.com/Gall-ardo/CanvasPilot'],
    ['ProctorHub', 'https://github.com/Gall-ardo/ProctorHub'],
    ['Recipeasy', 'https://github.com/RuveydaBilir/Recipeasy'],
    ['UART', 'https://github.com/iremEsendemir/CS223/tree/main/Project'],
  ]) {
    assert.equal(await evaluate(`(${article(name)}).querySelector('a').href`), url);
  }
  assert.equal(await evaluate(`(${article('ProctorHub')}).querySelectorAll('img, [data-lightbox]').length`), 0);
  assert.equal(await evaluate(`(${article('CanvasPilot')}).querySelectorAll('img').length`), 2);
  assert.ok(await evaluate(`(${article('PRISM')}).querySelector('header > p').textContent.includes('CS491 · In progress')`));
  assert.equal(await evaluate('document.querySelectorAll("[data-project-status]").length'), 0);
  assert.ok(await evaluate('!document.querySelector("#projects").textContent.includes("Currently being developed")'));
  assert.equal(await evaluate('document.querySelector("#top").textContent.match(/senior at Bilkent University/gi).length'), 1);
  assert.equal(await evaluate('document.querySelectorAll("#top a[href=\\"http://ciceklab.cs.bilkent.edu.tr\\"]").length'), 0);
  assert.equal(await evaluate('document.querySelector("#research a[href=\\"http://ciceklab.cs.bilkent.edu.tr\\"]").target'), '_blank');
  assert.equal(await evaluate('document.querySelectorAll("a[href=\\"http://ciceklab.cs.bilkent.edu.tr\\"]").length'), 1);
  assert.equal(await evaluate('document.querySelector("#research ul > li:first-child").textContent'), 'Currently working on RNA–protein interaction prediction.');
  assert.equal(await evaluate('document.querySelectorAll("#research ul > li").length'), 4);
  assert.ok(await evaluate(`(() => {
    const items = document.querySelectorAll('#research ul > li');
    const first = getComputedStyle(items[0]);
    const second = getComputedStyle(items[1]);
    return first.fontWeight === second.fontWeight && first.fontSize === second.fontSize && first.color === second.color;
  })()`), 'Current work uses the same styling as the other research bullets');
  assert.equal(await evaluate('document.querySelectorAll("#top h1 .u-mark, #contact h2 .u-mark").length'), 0);
  assert.ok(await evaluate(`(() => {
    const cards = [...document.querySelectorAll('#projects article[data-project-size=full]')].map(el => el.getBoundingClientRect());
    return cards.every(card => Math.abs(card.width - cards[0].width) < 1)
      && cards[1].top >= cards[0].bottom && cards[2].top >= cards[1].bottom;
  })()`), 'Projects form full-width rows rather than uneven columns');
  assert.ok(await evaluate(`(() => {
    const images = [...(${article('CanvasPilot')}).querySelectorAll('[data-lightbox]')].map(el => el.getBoundingClientRect());
    return Math.abs(images[0].top - images[1].top) < 1 && images[1].left > images[0].right;
  })()`), 'CanvasPilot screenshots share a balanced gallery row');
  assert.equal(await evaluate('document.querySelectorAll("#duck, .duck, [data-duck], [data-bubble]").length'), 0);
  assert.ok(await evaluate('!document.body.textContent.toLowerCase().includes("duck")'));
  assert.equal(await evaluate('document.querySelectorAll("#research .rna-sketch svg[role=img]").length'), 1);
  assert.equal(await evaluate('document.querySelectorAll("#research .rna-sketch .backbone").length'), 1);
  assert.equal(await evaluate('document.querySelectorAll("#research .rna-base").length'), 20);
  assert.equal(await evaluate('document.querySelectorAll("#research .rna-sketch text, #research .rna-sketch circle, #research .rna-sketch rect, #research [data-rna-pair]").length'), 0);
  assert.ok(await evaluate('document.querySelector("#research .rna-sketch svg").getAttribute("aria-label").includes("single RNA strand")'));
  assert.ok(await evaluate(`(() => {
    const rect = document.querySelector('#research .rna-sketch svg').getBoundingClientRect();
    return rect.width > rect.height * 3;
  })()`), 'RNA is a horizontal single strand, not a technical hairpin diagram');
  assert.equal(await evaluate('new Set(Array.from(document.querySelectorAll("#research .rna-base"), node => getComputedStyle(node).stroke)).size'), 3);
  assert.equal(await evaluate('document.querySelector("#research .rna-sketch").getAnimations({subtree: true}).length'), 0);

  // Theme persistence and screenshot enlargement remain available without the album.
  const originalTheme = await evaluate('document.documentElement.dataset.theme');
  await click('#theme-toggle');
  const nextTheme = await evaluate('document.documentElement.dataset.theme');
  assert.notEqual(nextTheme, originalTheme);
  await navigate();
  assert.equal(await evaluate('document.documentElement.dataset.theme'), nextTheme);
  await click('#experience [data-lightbox]');
  await waitFor('document.querySelector("#lightbox [data-img]").naturalWidth > 0');
  assert.equal(await evaluate('document.querySelector("#lightbox").open'), true);
  await click('#lightbox [data-close]');
  await evaluate('document.querySelector("#projects").scrollIntoView()');
  await delay(150);
  await photo('portfolio-projects-desktop');
  await evaluate('document.querySelector("#projects [data-project-size=compact]").scrollIntoView({block:"center"})');
  await photo('portfolio-small-projects-desktop');

  // Old hash links must remain inert, not resurrect the removed dialog.
  for (const hash of ['#album', '#album-4']) {
    await navigate(hash);
    assert.equal(await evaluate('document.querySelectorAll("#album, [data-open-album]").length'), 0);
    assert.ok(await evaluate('document.querySelector("h1").textContent.includes("Hi,")'));
  }
  assert.equal(requests.filter((url) => /\/src\/(?:scripts|styles)\/album|\/Album\.astro/.test(url)).length, 0, 'No album code or styles are loaded');
  assert.equal(requests.filter((url) => /\/Duck\.astro/.test(url)).length, 0, 'No duck code is loaded');

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await navigate();
  assert.equal(await evaluate('document.querySelector("#research .rna-sketch").getAnimations({subtree: true}).length'), 0, 'The RNA illustration is static regardless of motion preference');
  await evaluate('document.querySelector("#research").scrollIntoView()');
  await delay(800);
  await photo('portfolio-research-desktop');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate('#research');

  for (const width of [390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(100);
    assert.ok(await evaluate(`(() => {
      const rect = document.querySelector('#research .rna-sketch').getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth;
    })()`));
    assert.equal(await evaluate('document.querySelectorAll("#duck, [data-duck]").length'), 0);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'No mobile horizontal overflow');
  }
  await evaluate('document.querySelector("#research").scrollIntoView()');
  await delay(100);
  await photo('portfolio-research-mobile');
  await navigate('#projects');
  await delay(200);
  await photo('portfolio-projects-mobile');
  await evaluate('document.querySelector("#projects [data-project-size=compact]").scrollIntoView({block:"center"})');
  await photo('portfolio-small-projects-mobile');

  await send('Page.navigate', { url: `${site}/missing-portfolio-page` });
  await waitFor('document.readyState === "complete" && document.querySelector("h1")?.textContent === "Page not found."');
  assert.equal(await evaluate('document.querySelectorAll("#duck, [data-duck]").length'), 0);
  assert.ok(await evaluate('!document.body.textContent.toLowerCase().includes("duck")'));
  assert.equal(await evaluate('document.querySelector("main a").getAttribute("href")'), '/');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('Passed: resume link/file unavailable, updated header/LinkedIn, PRISM link only, project GitHub links, compact Recipeasy/UART, RNA, themes, lightbox, mobile.');
} finally {
  socket.close();
}

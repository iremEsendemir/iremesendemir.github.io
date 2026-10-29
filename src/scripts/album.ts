import { createPaperTurn } from './paper-turn';
import { prepareAlbumImages } from './album-images';

const dialog = document.getElementById('album') as HTMLDialogElement;
const book = dialog.querySelector<HTMLElement>('[data-book]')!;
const gutter = dialog.querySelector<HTMLElement>('[data-gutter]')!;
const desktopPages = dialog.querySelector<HTMLElement>('[data-sheets]')!;
const sheets = [...dialog.querySelectorAll<HTMLElement>('[data-sheet]')];
const mobile = dialog.querySelector<HTMLElement>('[data-mobile]')!;
const spreads = [...mobile.querySelectorAll<HTMLElement>('[data-mobile-spread]')];
const mobileFront = mobile.querySelector<HTMLElement>('[data-mobile-cover="front"]')!;
const mobileBack = mobile.querySelector<HTMLElement>('[data-mobile-cover="back"]')!;
const status = dialog.querySelector<HTMLElement>('[data-page]')!;
const prev = dialog.querySelector<HTMLButtonElement>('[data-prev]')!;
const next = dialog.querySelector<HTMLButtonElement>('[data-next]')!;
const loading = dialog.querySelector<HTMLElement>('[data-album-loading]')!;
const last = spreads.length + 1;
let current = 0;
let busy = false;
let transition = 0;
const activeAnimations = new Set<Animation>();
const activeCleanups = new Set<() => void>();
let loadingTimer: number | undefined;
const desktop = matchMedia('(min-width: 761px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const centerAt = (page: number) => `translateX(${page === 0 ? -25 : page === last ? 25 : 0}%)`;

function imageRoots(page: number): HTMLElement[] {
  if (!desktop.matches) return [page === 0 ? mobileFront : page === last ? mobileBack : spreads[page - 1]];
  const roots: HTMLElement[] = [];
  if (page > 0) roots.push(sheets[page - 1].querySelector<HTMLElement>(':scope > .sheet-back')!);
  if (page < last) roots.push(sheets[page].querySelector<HTMLElement>(':scope > .sheet-front')!);
  return roots;
}

function warmImages() {
  if (dialog.open) void prepareAlbumImages([...imageRoots(current), ...imageRoots(Math.min(last, current + 1))]);
}

function stopLoading() {
  clearTimeout(loadingTimer);
  loading.hidden = true;
}

function exposeLayers(left: number, right: number, turning = -1) {
  sheets.forEach((sheet, i) => {
    sheet.style.zIndex = i === turning ? '3' : '1';
    for (const face of sheet.querySelectorAll<HTMLElement>('[data-face]')) {
      const visible = i === turning || (face.dataset.face === 'front' ? i === right : i === left);
      face.dataset.visible = String(visible);
    }
  });
}

function render() {
  sheets.forEach((sheet, i) => {
    sheet.classList.toggle('is-turned', i < current);
    sheet.classList.remove('is-turning');
    for (const face of sheet.querySelectorAll<HTMLElement>('[data-face]')) {
      face.inert = face.dataset.face === 'front' ? i !== current : i !== current - 1;
      face.setAttribute('aria-hidden', String(face.inert));
      const page = face.querySelector<HTMLElement>('[data-spread]');
      if (page) page.dataset.active = String(!face.inert && desktop.matches);
    }
  });
  exposeLayers(current - 1, current);
  desktopPages.inert = !desktop.matches;
  mobile.inert = desktop.matches;
  mobileFront.hidden = current !== 0;
  mobileBack.hidden = current !== last;
  book.dataset.position = current === 0 ? 'front' : current === last ? 'back' : 'spread';
  book.dataset.index = String(current);
  book.setAttribute('aria-busy', String(busy));
  gutter.style.opacity = current > 0 && current < last ? '1' : '0';
  spreads.forEach((spread, i) => {
    spread.hidden = i !== current - 1;
  });
  const label = current === 0 ? 'Front cover' : current === last ? 'Back cover' : spreads[current - 1].getAttribute('aria-label');
  status.textContent = label;
  prev.disabled = current === 0;
  next.disabled = current === last;
  prev.setAttribute('aria-disabled', String(busy || prev.disabled));
  next.setAttribute('aria-disabled', String(busy || next.disabled));
  next.setAttribute('aria-label', current === 0 ? 'Open album' : current === last - 1 ? 'Close to back cover' : 'Next spread');
}

function play(element: HTMLElement, frames: Keyframe[], duration: number) {
  const animation = element.animate(frames, {
    duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both',
  });
  activeAnimations.add(animation);
  return animation;
}

function cancelTransition() {
  transition++;
  activeAnimations.forEach((animation) => animation.cancel());
  activeAnimations.clear();
  activeCleanups.forEach((cleanup) => cleanup());
  activeCleanups.clear();
  stopLoading();
  busy = false;
  render();
}

async function go(requested: number, motion = true) {
  if (busy) return;
  const to = Math.max(0, Math.min(last, requested));
  if (to === current) return;
  const from = current;
  const token = ++transition;
  const restoreNavigationFocus = book.contains(document.activeElement) || document.activeElement === prev || document.activeElement === next;
  const running: Animation[] = [];
  const cleanups: (() => void)[] = [];
  busy = true;
  render();
  loadingTimer = window.setTimeout(() => loading.hidden = false, 150);
  try {
    await prepareAlbumImages([...imageRoots(from), ...imageRoots(to)]);
    if (token !== transition) return;
    if (motion && !reduced.matches) {
      if (desktop.matches) {
        // A leaf is never replaced: its recto/verso rotate together around the spine.
        const forward = to > from;
        const sheet = sheets[forward ? from : to];
        const stageAnimation: typeof play = (element, frames, duration) => {
          const animation = play(element, frames, duration);
          animation.pause();
          animation.currentTime = 0;
          return animation;
        };
        const paper = createPaperTurn(
          sheet, desktopPages, forward,
          Number(sheet.dataset.sheet) > 0 && Number(sheet.dataset.sheet) < sheets.length - 1,
          stageAnimation, 900,
        );
        running.push(...paper.animations);
        cleanups.push(paper.cleanup);
        activeCleanups.add(paper.cleanup);
        await paper.ready;
        if (token !== transition) return;
        stopLoading();
        sheet.classList.add('is-turning');
        // Resting faces stay in flat, separate left/right planes. Only the
        // moving leaf enters 3D, so closed covers cannot jump over open pages.
        exposeLayers(forward ? from - 1 : to - 1, forward ? to : from, forward ? from : to);
        desktopPages.inert = true;
        running.push(stageAnimation(sheet, [
          { transform: `rotateY(${forward ? 0 : -180}deg)` },
          { transform: `rotateY(${forward ? -180 : 0}deg)` },
        ], 900));
        running.push(stageAnimation(book, [
          { transform: centerAt(from) }, { transform: centerAt(to) },
        ], 900));
        running.push(stageAnimation(gutter, [
          { opacity: from > 0 && from < last ? 1 : 0 },
          { opacity: to > 0 && to < last ? 1 : 0 },
        ], 900));
        paper.activate();
        const startTime = document.timeline.currentTime;
        running.forEach((animation) => {
          animation.play();
          if (startTime !== null) animation.startTime = startTime;
        });
        await Promise.all(running.map((animation) => animation.finished));
      } else {
        stopLoading();
        running.push(play(mobile, [{ opacity: 1 }, { opacity: 0 }], 100));
        await running[0].finished;
        if (token !== transition) return;
        current = to;
        render();
        running.push(play(mobile, [{ opacity: 0 }, { opacity: 1 }], 140));
        await running[1].finished;
      }
    }
    if (token === transition) current = to;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
  } finally {
    if (token === transition) {
      stopLoading();
      busy = false;
      render();
      mobile.scrollTop = 0;
      if (restoreNavigationFocus && dialog.open) {
        (current === last ? prev : next).focus({ preventScroll: true });
      }
      warmImages();
    }
    running.forEach((animation) => {
      animation.cancel();
      activeAnimations.delete(animation);
    });
    cleanups.forEach((cleanup) => {
      cleanup();
      activeCleanups.delete(cleanup);
    });
  }
}

prev.addEventListener('click', () => void go(current - 1));
next.addEventListener('click', () => void go(current + 1));
dialog.querySelectorAll('[data-cover-open]').forEach((button) => button.addEventListener('click', () => void go(1)));
dialog.querySelectorAll('[data-restart]').forEach((button) => button.addEventListener('click', () => open()));
dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', cancelTransition);
desktop.addEventListener('change', () => { cancelTransition(); warmImages(); });
dialog.addEventListener('keydown', (event) => {
  if (document.querySelector('#lightbox[open]')) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    void go(current + (event.key === 'ArrowRight' ? 1 : -1));
  }
});

function open(page = 0) {
  cancelTransition();
  current = Math.max(0, Math.min(last, page));
  render();
  if (!dialog.open) dialog.showModal();
  warmImages();
}

document.querySelectorAll('[data-open-album]').forEach((button) => button.addEventListener('click', () => open()));
const match = location.hash.match(/^#album(?:-(\d+))?$/);
if (match) open(match[1] ? Number(match[1]) : 0);
render();

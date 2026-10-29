import { prepareAlbumImages } from './album-images';

type Animate = (element: HTMLElement, frames: Keyframe[], duration: number) => Animation;

function copyPage(source: HTMLElement, width: number, height: number, offset: number) {
  const frame = document.createElement('div');
  frame.className = 'album-paper-content';
  Object.assign(frame.style, { width: `${width}px`, height: `${height}px`, left: `${-offset}px` });
  const page = source.cloneNode(true) as HTMLElement;
  for (const node of [page, ...page.querySelectorAll<HTMLElement>('*')]) {
    node.removeAttribute('id');
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith('data-') && !attribute.name.startsWith('data-astro-')) {
        node.removeAttribute(attribute.name);
      }
    }
  }
  for (const image of page.querySelectorAll<HTMLImageElement>('img')) {
    image.loading = 'eager';
    image.decoding = 'sync';
  }
  frame.append(page);
  return frame;
}

export function createPaperTurn(
  sheet: HTMLElement,
  stage: HTMLElement,
  forward: boolean,
  flexible: boolean,
  animate: Animate,
  duration: number,
) {
  const animations: Animation[] = [];
  const shadow = document.createElement('div');
  shadow.className = 'album-turn-shadow';
  shadow.setAttribute('aria-hidden', 'true');
  stage.append(shadow);
  const steps = Array.from({ length: 17 }, (_, i) => i / 16);
  animations.push(animate(shadow, steps.map((t) => {
    const progress = forward ? t : 1 - t;
    const lift = Math.sin(Math.PI * progress);
    return {
      offset: t,
      opacity: lift * .36,
      transform: `translateX(${Math.cos(Math.PI * progress) * 55}%) scaleX(${.2 + lift * .8})`,
    };
  }), duration));

  let curl: HTMLElement | undefined;
  let activate = () => {};
  if (flexible) {
    const width = sheet.offsetWidth;
    const height = sheet.offsetHeight;
    const count = 12;
    const piece = width / count;
    const front = sheet.querySelector<HTMLElement>(':scope > .sheet-front > .album-page')!;
    const back = sheet.querySelector<HTMLElement>(':scope > .sheet-back > .album-page')!;
    curl = document.createElement('div');
    curl.className = 'album-curl';
    curl.hidden = true;
    curl.inert = true;
    curl.setAttribute('aria-hidden', 'true');

    // Integrate each strip's tangent so adjacent strips share an edge.
    // Curvature vanishes at both ends, exactly matching the resting page.
    const poses = steps.map((t) => {
      const progress = forward ? t : 1 - t;
      const bend = Math.sin(Math.PI * progress) * (forward ? -1 : 1) * .55;
      let x = 0;
      let z = 0;
      return Array.from({ length: count }, (_, i) => {
        const angle = bend * Math.pow(i / (count - 1), 1.4);
        const pose = { x, z, angle };
        x += Math.cos(angle) * piece;
        z -= Math.sin(angle) * piece;
        return pose;
      });
    });

    for (let i = 0; i < count; i++) {
      const strip = document.createElement('div');
      strip.className = 'album-curl-strip';
      strip.style.width = `${piece + .35}px`;
      for (const [side, source, offset] of [
        ['front', front, i * piece],
        ['back', back, width - (i + 1) * piece],
      ] as const) {
        const face = document.createElement('div');
        face.className = `album-curl-side ${side}`;
        face.append(copyPage(source, width, height, offset));
        strip.append(face);
      }
      curl.append(strip);
      animations.push(animate(strip, poses.map((pose, step) => ({
        offset: steps[step],
        transform: `translate3d(${pose[i].x}px, 0, ${pose[i].z}px) rotateY(${pose[i].angle}rad)`,
      })), duration));
    }
    sheet.append(curl);
    const mesh = curl;
    activate = () => {
      sheet.classList.add('is-bending');
      mesh.hidden = false;
      for (const side of ['front', 'back']) {
        const scrollTop = (side === 'front' ? front : back).querySelector('.album-panel')!.scrollTop;
        mesh.querySelectorAll<HTMLElement>(`.album-curl-side.${side} .album-panel`).forEach((panel) => {
          panel.scrollTop = scrollTop;
        });
      }
    };
  }

  let disposed = false;
  return {
    animations,
    ready: curl ? prepareAlbumImages([curl]) : Promise.resolve(),
    activate,
    cleanup() {
      if (disposed) return;
      disposed = true;
      shadow.remove();
      curl?.remove();
      sheet.classList.remove('is-bending');
    },
  };
}

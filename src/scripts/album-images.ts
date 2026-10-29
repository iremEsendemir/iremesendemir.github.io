const pending = new WeakMap<HTMLImageElement, Promise<void>>();

function prepareImage(image: HTMLImageElement) {
  const existing = pending.get(image);
  if (existing) return existing;
  // Hidden pages and clipped curl strips must not depend on viewport-based loading.
  image.loading = 'eager';
  image.decoding = 'sync';
  const ready = image.decode().then(() => {
    image.closest('.album-photo')?.classList.remove('image-unavailable');
  }).catch(() => {
    // A failed preview must not lock navigation; its original is still linked.
    image.closest('.album-photo')?.classList.add('image-unavailable');
  }).finally(() => {
    pending.delete(image);
  });
  pending.set(image, ready);
  return ready;
}

export async function prepareAlbumImages(roots: Element[]) {
  await Promise.all(roots.flatMap((root) =>
    [...root.querySelectorAll<HTMLImageElement>('img')].map(prepareImage),
  ));
}

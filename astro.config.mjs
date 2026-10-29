// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// For GitHub Pages at https://<user>.github.io, keep `base` as '/'.
// If deploying to https://<user>.github.io/<repo>, set base: '/<repo>'.
export default defineConfig({
  site: 'https://iremesendemir.github.io',
  vite: {
    plugins: [tailwindcss()],
  },
});

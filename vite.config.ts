import { defineConfig } from 'vite';

/**
 * One static page at the root of a subdomain. Nothing here talks to a server: the typeface is
 * built, drawn and serialised into a .ttf entirely in the tab, which is the whole reason the tool
 * can promise that an unreleased typeface never leaves the machine it was drawn on.
 */
export default defineConfig({
  base: '/',
  build: { target: 'es2022' },
});

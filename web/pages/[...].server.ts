import { defineHead } from 'void';

export const ssr = false;

export const head = defineHead(() => ({
  htmlAttrs: { lang: 'en' },
  link: [
    { href: '/icon.png', rel: 'icon' },
    { href: '/apple-touch-icon.png', rel: 'apple-touch-icon' },
  ],
  meta: [
    { charset: 'utf8' },
    { content: 'width=device-width, initial-scale=1.0', name: 'viewport' },
    { content: '#f8f8f6', name: 'theme-color' },
  ],
  title: 'Codiff',
}));

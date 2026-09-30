import { expect, test } from 'vite-plus/test';
import { makeAssetResponseMutable } from './assetResponse.ts';

test('clones asset binding responses with mutable headers', () => {
  const immutable = Response.redirect('https://codiff.dev/icon.png');
  const response = makeAssetResponseMutable(immutable);

  expect(() => response.headers.set('x-auth-session', 'available')).not.toThrow();
  expect(response.headers.get('x-auth-session')).toBe('available');
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('https://codiff.dev/icon.png');
});

test('caches fingerprinted build assets without the binding no-cache directive', () => {
  const response = makeAssetResponseMutable(
    new Response('asset', { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } }),
    '/__assets/app-123.js',
  );

  expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  expect(response.headers.has('Pragma')).toBe(false);
});

test.each([
  ['/__assets/app-123.js', 'text/javascript; charset=utf-8'],
  ['/__assets/app-123.css', 'text/css; charset=utf-8'],
  ['/__assets/logo-123.webp', 'image/webp'],
  ['/__assets/font-123.woff2', 'font/woff2'],
])('adds a missing MIME type for %s', (pathname, contentType) => {
  const response = makeAssetResponseMutable(
    new Response(new TextEncoder().encode('asset')),
    pathname,
  );
  expect(response.headers.get('Content-Type')).toBe(contentType);
});

test('preserves an asset binding MIME type', () => {
  const response = makeAssetResponseMutable(
    new Response('asset', { headers: { 'Content-Type': 'application/javascript' } }),
    '/__assets/app-123.js',
  );
  expect(response.headers.get('Content-Type')).toBe('application/javascript');
});

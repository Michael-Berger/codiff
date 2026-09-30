const contentTypes: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
  wasm: 'application/wasm',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

export const makeAssetResponseMutable = (response: Response, pathname?: string) => {
  const mutable = new Response(response.body, response);
  if (pathname && !mutable.headers.get('Content-Type')) {
    const extension = pathname.match(/\.([^./]+)$/)?.[1]?.toLowerCase();
    const contentType = extension && contentTypes[extension];
    if (contentType) {
      mutable.headers.set('Content-Type', contentType);
    }
  }
  if (pathname?.startsWith('/__assets-v2/')) {
    mutable.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    mutable.headers.delete('Pragma');
  }
  return mutable;
};

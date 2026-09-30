import { defineMiddleware } from 'void';
import { makeAssetResponseMutable } from '../src/lib/assetResponse.ts';
import { isAssetPath } from '../src/lib/isAssetPath.ts';

const isAssetBinding = (value: unknown): value is { fetch(request: Request): Promise<Response> } =>
  typeof value === 'object' &&
  value !== null &&
  'fetch' in value &&
  typeof value.fetch === 'function';

export default defineMiddleware(async (context, next) => {
  const request = context.req.raw;
  const assets = context.env.ASSETS;
  const pathname = new URL(request.url).pathname;
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    isAssetPath(pathname) &&
    isAssetBinding(assets)
  ) {
    const response = await assets.fetch(request);
    if (response.status !== 404) {
      // Asset binding responses have immutable headers, but outer middleware such as auth may
      // append headers after this middleware returns.
      return makeAssetResponseMutable(response, pathname);
    }
  }

  await next();
});

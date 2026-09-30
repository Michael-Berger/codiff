export const makeAssetResponseMutable = (response: Response, pathname?: string) => {
  const mutable = new Response(response.body, response);
  if (pathname?.startsWith('/__assets/')) {
    mutable.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    mutable.headers.delete('Pragma');
  }
  return mutable;
};

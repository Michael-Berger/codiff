import process from 'node:process';
import { URL } from 'node:url';

if (/\/cf\/bin\/cf$/.test(process.argv[1] ?? '') && process.argv.includes('deploy')) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    let target = 'request';
    try {
      const request = typeof input === 'object' && input !== null ? input : undefined;
      const method = init?.method ?? request?.method ?? 'GET';
      const url = new URL(request?.url ?? input);
      const path = url.pathname.replaceAll(/\/[^/]{25,}/g, '/[id]');
      target = `${method} ${url.hostname}${path}`;
    } catch {
      // Keep tracing from changing the request if the URL cannot be parsed.
    }

    try {
      const response = await originalFetch(input, init);
      if (!response.ok) {
        let codes = [];
        try {
          const body = await response.clone().json();
          codes = Array.isArray(body.errors) ? body.errors.map((error) => error.code) : [];
        } catch {
          // Non-JSON error responses have no Cloudflare error code.
        }
        process.stderr.write(
          `cf HTTP ${target}: ${response.status} codes=${JSON.stringify(codes)}\n`,
        );
      }
      return response;
    } catch (error) {
      process.stderr.write(`cf HTTP ${target}: ${error?.cause?.code ?? error?.name ?? 'failed'}\n`);
      throw error;
    }
  };
}

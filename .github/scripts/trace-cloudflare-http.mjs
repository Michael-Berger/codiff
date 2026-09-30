import { subscribe } from 'node:diagnostics_channel';
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const trace = (line) => {
  if (!process.env.RUNNER_TEMP) {
    return;
  }
  try {
    appendFileSync(`${process.env.RUNNER_TEMP}/cf-http.log`, `${line}\n`);
  } catch {
    // Diagnostics must never interrupt deployment.
  }
};

if (/\/cf\/bin\/cf$/.test(process.argv[1] ?? '') && process.argv.includes('deploy')) {
  trace('cf HTTP trace active');
  let fetchCount = 0;
  let requestCount = 0;
  subscribe('undici:request:headers', ({ request, response }) => {
    requestCount++;
    if (response.statusCode >= 400) {
      try {
        const url = new URL(request.path, request.origin);
        trace(
          `cf transport ${request.method} ${url.hostname}${url.pathname.replaceAll(/\/[^/]{25,}/g, '/[id]')}: ${response.statusCode}`,
        );
      } catch {
        trace(`cf transport response ${response.statusCode}`);
      }
    }
  });
  subscribe('undici:request:error', ({ error }) => {
    trace(`cf transport error ${error?.code ?? error?.name ?? 'failed'}`);
  });
  const originalExit = process.exit.bind(process);
  process.exit = (code) => {
    if (code && code !== 0) {
      trace(`cf exit ${code}: ${new Error().stack?.slice(0, 1800) ?? ''}`);
    }
    return originalExit(code);
  };
  process.on('exit', (code) =>
    trace(`cf exit event ${code}, fetch calls=${fetchCount}, transport responses=${requestCount}`),
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    fetchCount++;
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
        trace(`cf HTTP ${target}: ${response.status} codes=${JSON.stringify(codes)}`);
      }
      return response;
    } catch (error) {
      trace(`cf HTTP ${target}: ${error?.cause?.code ?? error?.name ?? 'failed'}`);
      throw error;
    }
  };
}

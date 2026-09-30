import { handleSharingApiRequest, type SharingEnv } from '@nkzw/codiff-service/api';
import { defineVoidFateLiveRoute } from 'void-fate/server';
import { fateServer } from './fate.ts';
import { fateLive, fateStream, live } from './live.ts';

export const handleApiRequest = (request: Request, env: SharingEnv, auth: unknown) =>
  fateLive.withContext({ env, stream: fateStream }, () =>
    handleSharingApiRequest(request, env, {
      auth,
      enforceDailyQuota: true,
      onUploadIntentUpdated: ({ changed, id, walkthroughSlug }) =>
        live.update('UploadIntent', id, {
          changed,
          eventId: `upload-intent:${id}:${walkthroughSlug}`,
        }),
    }),
  );

export const handleFateRequest = (request: Request, env: SharingEnv, auth: unknown) =>
  fateLive.withContext({ env, stream: fateStream }, () =>
    fateServer.handleRequest(request, { auth, env, request }),
  );

export const fateLiveRoute = defineVoidFateLiveRoute(fateStream);

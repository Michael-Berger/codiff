import { createVoidFateLive } from 'void-fate/server';
import { defineLiveStream } from 'void/live';

export const fateLive = createVoidFateLive();
export const { live } = fateLive;

type FateStream = ReturnType<typeof defineLiveStream>;
const registry = globalThis as typeof globalThis & {
  __codiffPublicFateStream?: FateStream;
};

export const fateStream =
  registry.__codiffPublicFateStream ??
  (registry.__codiffPublicFateStream = defineLiveStream({
    allowAnonymousControl: true,
    id: 'fate',
  }));

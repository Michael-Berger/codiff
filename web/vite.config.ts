import { resolve } from 'node:path';
import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';
import { voidReact } from '@void/react/plugin';
import { fate } from 'react-fate/vite';
import { defineConfig, lazyPlugins } from 'vite-plus';
import { voidPlugin } from 'void';

const codiffSourceConditions = [
  '@nkzw/codiff-source',
  'module',
  'browser',
  'development|production',
];
const workspacePackages = ['@nkzw/codiff-core', '@nkzw/codiff-service'];

export default defineConfig({
  build: { assetsDir: '__assets' },
  environments: {
    void_worker: {
      optimizeDeps: {
        exclude: ['@nkzw/fate/server', '@nkzw/fate/server/drizzle', 'void-fate/server'],
      },
    },
  },
  optimizeDeps: { exclude: workspacePackages },
  plugins: [
    ...(lazyPlugins(() => [
      babel({ presets: [reactCompilerPreset()] }),
      ...voidPlugin(),
      ...voidReact(),
    ]) ?? []),
    fate({
      module: './src/server/fate.ts',
      transport: 'void',
    }),
  ],
  resolve: {
    alias: [{ find: '@web', replacement: resolve(__dirname, '.') }],
    conditions: codiffSourceConditions,
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 6002 },
});

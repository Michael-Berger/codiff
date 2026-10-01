/** @vitest-environment jsdom */
import { expect, test } from 'vite-plus/test';
import { isNativeInputTarget } from '../lib/keyboard.ts';

test('recognizes Pierre input through a focused shadow host and read-only descendants', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const input = document.createElement('div');
  input.contentEditable = 'true';
  input.setAttribute('contenteditable', 'true');
  input.tabIndex = 0;
  const deletion = document.createElement('span');
  deletion.setAttribute('contenteditable', 'false');
  input.append(deletion);
  shadow.append(input);
  try {
    expect(isNativeInputTarget(host)).toBe(false);
    input.focus();
    expect(isNativeInputTarget(host)).toBe(true);
    expect(isNativeInputTarget(deletion)).toBe(true);
  } finally {
    host.remove();
  }
});

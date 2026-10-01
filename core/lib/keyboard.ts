type NativeInputEventTarget = EventTarget & {
  closest?: (selector: string) => Element | null;
  isContentEditable?: boolean;
  shadowRoot?: ShadowRoot | null;
};

export const isNativeInputTarget = (target: EventTarget | null): boolean => {
  const candidate = target as NativeInputEventTarget | null;
  return (
    candidate?.closest?.('input, select, textarea, [contenteditable="true"]') != null ||
    candidate?.isContentEditable === true ||
    (candidate?.shadowRoot?.activeElement != null &&
      isNativeInputTarget(candidate.shadowRoot.activeElement))
  );
};

const isMacPlatform = (platform = navigator.platform) => platform.toLowerCase().includes('mac');

export const isPrimaryModifier = (
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>,
  platform = navigator.platform,
) => (isMacPlatform(platform) ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);

export const isDiffSearchShortcut = (
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  platform = navigator.platform,
) => {
  if (event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f') {
    return false;
  }

  return isPrimaryModifier(event, platform);
};

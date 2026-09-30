// Void loads Cloudflare's global HTMLRewriter Element type alongside DOM types.
// Keep DOM operations available to browser code in the shared TypeScript project.
interface Element {
  append(...nodes: Array<Node | string>): void;
  prepend(...nodes: Array<Node | string>): void;
  remove(): void;
}

// Firefox exposes promise-based APIs on `browser`; Chrome/Edge MV3 expose the
// same promise-based APIs on `chrome`. Picking whichever exists is all we need,
// so we skip webextension-polyfill (no dependency, no bundler).
export const api = globalThis.browser ?? globalThis.chrome;

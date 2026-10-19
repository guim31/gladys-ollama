// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_PORT = 11434;

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

// Longest wait for an answer, in seconds. The scene action is granted 120 s
// by Gladys (connection wait included): the longest choice leaves a margin.
export const TIMEOUTS = ['30', '60', '90', '110'];

// How long Ollama keeps a model in memory after a question (`keep_alive`):
// `default` sends nothing (the server's own setting, 5 minutes unless
// OLLAMA_KEEP_ALIVE says otherwise), `-1` keeps it until unloaded.
export const KEEP_ALIVES = ['default', '0', '5m', '30m', '1h', '24h', '-1'];

export const DEFAULT_CONFIG = {
  url: '',
  api_key: '',
  default_model: '',
  timeout: '60',
  keep_alive: 'default',
  poll_interval: '60',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, port 11434 added), `host:port`, or a full URL (a reverse
 * proxy: `https://ollama.example.org`, its path kept).
 * @param {unknown} raw
 * @returns {string|null} base URL without trailing slash, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const typedScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(typedScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password || url.search || url.hash) {
    return null;
  }
  if (!typedScheme && !url.port) {
    url.port = String(DEFAULT_PORT);
  }
  // `/api` copied from a client configuration is the API root, not a prefix.
  const path = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typed = text('url');
  const keepAlive = pick('keep_alive', KEEP_ALIVES);
  return {
    url: parseServerUrl(typed),
    urlTyped: typed !== '',
    apiKey: text('api_key'),
    defaultModel: text('default_model'),
    timeoutMs: Number(pick('timeout', TIMEOUTS)) * 1000,
    // Ollama reads a number as seconds and a string as a duration.
    keepAlive:
      keepAlive === 'default'
        ? undefined
        : /^-?\d+$/.test(keepAlive)
          ? Number(keepAlive)
          : keepAlive,
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

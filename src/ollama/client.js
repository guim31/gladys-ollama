// -----------------------------------------------------------------------------
// Ollama REST API client (https://docs.ollama.com/api), on the global fetch.
//
// Read: GET /api/version, /api/tags (installed models), /api/ps (models in
// memory). Write: POST /api/chat with `stream: false`, and POST
// /api/generate without a prompt to load (`keep_alive` > 0) or unload
// (`keep_alive: 0`) a model.
//
// Ollama has no authentication of its own; the optional key is sent as a
// Bearer token for a reverse proxy in front of it. Errors carry a `kind`
// (ERROR_KINDS) the rest of the code translates; their message never holds
// the question, the answer or the key.
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  NOT_OLLAMA: 'not_ollama',
  MODEL_NOT_FOUND: 'model_not_found',
  HTTP: 'http',
});

export class OllamaError extends Error {
  constructor(kind, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'OllamaError';
    this.kind = kind;
    this.status = status;
  }
}

// Reads are small and quick: a server that takes longer is in trouble.
export const READ_TIMEOUT_MS = 10_000;
// Loading a model from disk can take a while on a small machine.
export const LOAD_TIMEOUT_MS = 60_000;

const MAX_SERVER_ERROR = 160;

export class OllamaClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL (src/config.js parseServerUrl)
   * @param {string} [options.apiKey] Bearer token for a reverse proxy
   * @param {typeof fetch} [options.fetch] HTTP seam (tests)
   */
  constructor({ url, apiKey = '', fetch: fetchImpl = globalThis.fetch }) {
    this.url = url;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async call(method, path, { body, timeoutMs = READ_TIMEOUT_MS } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    let response;
    try {
      response = await this.fetch(`${this.url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new OllamaError(
          ERROR_KINDS.TIMEOUT,
          `${method} ${path}: no answer within ${timeoutMs / 1000} s`,
          { cause: err },
        );
      }
      // fetch refuses redirects (`redirect: 'error'`): a proxy sending HTTP
      // to HTTPS is a wrong address, not a server that is down.
      if (/redirect/i.test(String(err?.cause?.message ?? err?.message))) {
        throw new OllamaError(ERROR_KINDS.NOT_OLLAMA, `${method} ${path}: redirected`, {
          cause: err,
        });
      }
      const code = err?.cause?.code ?? err?.code;
      throw new OllamaError(
        ERROR_KINDS.UNREACHABLE,
        `${method} ${path}: ${code ?? err?.message ?? 'network error'}`,
        { cause: err },
      );
    }
    let text;
    try {
      text = await response.text();
    } catch (err) {
      const kind = err?.name === 'TimeoutError' ? ERROR_KINDS.TIMEOUT : ERROR_KINDS.UNREACHABLE;
      throw new OllamaError(kind, `${method} ${path}: answer cut short`, { cause: err });
    }
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = undefined;
    }
    if (response.status === 401 || response.status === 403) {
      throw new OllamaError(ERROR_KINDS.AUTH, `${method} ${path}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    const serverError =
      data && typeof data.error === 'string' ? data.error.slice(0, MAX_SERVER_ERROR) : null;
    if (response.status === 404 && serverError && /model .*not found/i.test(serverError)) {
      throw new OllamaError(ERROR_KINDS.MODEL_NOT_FOUND, `${method} ${path}: ${serverError}`, {
        status: 404,
      });
    }
    // A reverse proxy whose Ollama is stopped: the server is down.
    if ([502, 503, 504].includes(response.status)) {
      throw new OllamaError(ERROR_KINDS.UNREACHABLE, `${method} ${path}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    if (!response.ok) {
      if (data === undefined || response.status === 404) {
        throw new OllamaError(
          ERROR_KINDS.NOT_OLLAMA,
          `${method} ${path}: HTTP ${response.status}, not an Ollama answer`,
          { status: response.status },
        );
      }
      throw new OllamaError(
        ERROR_KINDS.HTTP,
        `${method} ${path}: HTTP ${response.status}${serverError ? ` ${serverError}` : ''}`,
        { status: response.status },
      );
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new OllamaError(ERROR_KINDS.NOT_OLLAMA, `${method} ${path}: not an Ollama answer`, {
        status: response.status,
      });
    }
    return data;
  }

  /** @returns {Promise<string>} the server version, e.g. "0.12.6" */
  async version() {
    const data = await this.call('GET', '/api/version');
    if (typeof data.version !== 'string') {
      throw new OllamaError(ERROR_KINDS.NOT_OLLAMA, 'GET /api/version: no version');
    }
    return data.version;
  }

  /** @returns {Promise<Array<{ name: string, size: number }>>} installed models */
  async tags() {
    const data = await this.call('GET', '/api/tags');
    if (!Array.isArray(data.models)) {
      throw new OllamaError(ERROR_KINDS.NOT_OLLAMA, 'GET /api/tags: no model list');
    }
    return data.models
      .filter((model) => model && typeof model.name === 'string')
      .map((model) => ({ name: model.name, size: Number(model.size) || 0 }));
  }

  /**
   * @returns {Promise<Array<{ name: string, size: number, sizeVram: number, expiresAt: string|null }>>}
   *   models in memory
   */
  async ps() {
    const data = await this.call('GET', '/api/ps');
    if (!Array.isArray(data.models)) {
      throw new OllamaError(ERROR_KINDS.NOT_OLLAMA, 'GET /api/ps: no model list');
    }
    return data.models
      .filter((model) => model && typeof model.name === 'string')
      .map((model) => ({
        name: model.name,
        size: Number(model.size) || 0,
        sizeVram: Number(model.size_vram) || 0,
        expiresAt: typeof model.expires_at === 'string' ? model.expires_at : null,
      }));
  }

  /**
   * One question, one answer (`stream: false`).
   * @param {object} request
   * @param {string} request.model
   * @param {Array<{ role: string, content: string }>} request.messages
   * @param {object} [request.options] Ollama options (temperature, num_predict…)
   * @param {number|string} [request.keepAlive]
   * @param {number} request.timeoutMs
   * @returns {Promise<{ model: string, content: string, doneReason: string|null, durationNs: number }>}
   */
  async chat({ model, messages, options, keepAlive, timeoutMs }) {
    const body = { model, messages, stream: false, think: false };
    if (options && Object.keys(options).length > 0) {
      body.options = options;
    }
    if (keepAlive !== undefined) {
      body.keep_alive = keepAlive;
    }
    let data;
    try {
      data = await this.call('POST', '/api/chat', { body, timeoutMs });
    } catch (err) {
      // Older Ollama, or a model that cannot turn its reasoning off: ask again
      // without the switch (the reasoning is then stripped from the answer).
      if (err.kind === ERROR_KINDS.HTTP && /think/i.test(err.message)) {
        delete body.think;
        data = await this.call('POST', '/api/chat', { body, timeoutMs });
      } else {
        throw err;
      }
    }
    if (!data.message || typeof data.message.content !== 'string') {
      throw new OllamaError(ERROR_KINDS.NOT_OLLAMA, 'POST /api/chat: no message in the answer');
    }
    return {
      model: typeof data.model === 'string' ? data.model : model,
      content: data.message.content,
      doneReason: typeof data.done_reason === 'string' ? data.done_reason : null,
      durationNs: Number(data.total_duration) || 0,
    };
  }

  /** Load a model in memory, for `keepAlive` (the server's default when undefined). */
  async load(model, keepAlive) {
    const body = { model };
    if (keepAlive !== undefined) {
      body.keep_alive = keepAlive;
    }
    await this.call('POST', '/api/generate', { body, timeoutMs: LOAD_TIMEOUT_MS });
  }

  /** Free the memory a model holds. */
  async unload(model) {
    await this.call('POST', '/api/generate', {
      body: { model, keep_alive: 0 },
      timeoutMs: READ_TIMEOUT_MS,
    });
  }
}

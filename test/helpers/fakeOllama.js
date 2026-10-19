// -----------------------------------------------------------------------------
// A fake Ollama server behind a fake `fetch`, built on the real answers
// recorded from ollama/ollama 0.40.6 (test/fixtures/ollama/). Tests change its
// fields to play an outage, a missing model, a slow answer…
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/ollama/${name}.json`, import.meta.url), 'utf8'));

const json = (status, body) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' },
  });

export class FakeOllama {
  constructor({ url = 'http://192.0.2.20:11434', apiKey = '' } = {}) {
    this.url = url;
    this.apiKey = apiKey;
    this.version = fixture('version').version;
    this.tags = fixture('tags').models;
    this.ps = fixture('ps-empty').models;
    /** false: connection refused; 'timeout': never answers. */
    this.online = true;
    /** What /api/chat answers: a function of the request body. */
    this.reply = () => fixture('chat');
    this.requests = [];
    this.fetch = this.fetch.bind(this);
  }

  load(name) {
    const [loaded] = fixture('ps-loaded').models;
    this.ps = [...this.ps.filter((m) => m.name !== name), { ...loaded, name, model: name }];
  }

  async fetch(target, init = {}) {
    const url = new URL(target);
    const body = init.body ? JSON.parse(init.body) : undefined;
    this.requests.push({ method: init.method, path: url.pathname, body, headers: init.headers });
    if (!target.startsWith(this.url)) {
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    }
    if (this.online === false) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (this.online === 'timeout') {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }
    if (this.apiKey && init.headers?.authorization !== `Bearer ${this.apiKey}`) {
      return json(401, { error: 'unauthorized' });
    }
    const known = (name) => this.tags.some((m) => m.name === name || m.name === `${name}:latest`);
    switch (`${init.method} ${url.pathname}`) {
      case 'GET /api/version':
        return json(200, { version: this.version });
      case 'GET /api/tags':
        return json(200, { models: this.tags });
      case 'GET /api/ps':
        return json(200, { models: this.ps });
      case 'POST /api/chat': {
        if (!known(body.model)) {
          return json(404, { error: `model '${body.model}' not found` });
        }
        const answer = await this.reply(body);
        if (answer instanceof Response) {
          return answer;
        }
        this.load(body.model);
        return json(200, { ...answer, model: body.model });
      }
      case 'POST /api/generate': {
        if (!known(body.model)) {
          return json(404, { error: `model '${body.model}' not found` });
        }
        if (body.keep_alive === 0) {
          this.ps = this.ps.filter((m) => m.name !== body.model);
          return json(200, { model: body.model, response: '', done: true, done_reason: 'unload' });
        }
        this.load(body.model);
        return json(200, { model: body.model, response: '', done: true, done_reason: 'load' });
      }
      default:
        return json(404, '404 page not found');
    }
  }
}

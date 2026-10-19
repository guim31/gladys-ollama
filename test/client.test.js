// -----------------------------------------------------------------------------
// The Ollama client on the answers recorded from a real server (ollama/ollama
// 0.40.6, test/fixtures/ollama/), and its error kinds.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_KINDS, OllamaClient } from '../src/ollama/client.js';
import { FakeOllama } from './helpers/fakeOllama.js';

const client = (server, options = {}) =>
  new OllamaClient({ url: server.url, fetch: server.fetch, ...options });

test('reads the version, the installed models and the models in memory', async () => {
  const server = new FakeOllama();
  const ollama = client(server);
  assert.equal(await ollama.version(), '0.40.6');
  assert.deepEqual(await ollama.tags(), [
    { name: 'qwen2.5:0.5b', size: 397821319 },
    { name: 'smollm2:135m', size: 270898672 },
  ]);
  assert.deepEqual(await ollama.ps(), []);
  server.load('smollm2:135m');
  const [loaded] = await ollama.ps();
  assert.equal(loaded.name, 'smollm2:135m');
  assert.equal(typeof loaded.size, 'number');
  assert.match(loaded.expiresAt, /^2026-10-19T/);
});

test('chat returns the content, the model, the reason and the duration', async () => {
  const answer = await client(new FakeOllama()).chat({
    model: 'qwen2.5:0.5b',
    messages: [{ role: 'user', content: 'x' }],
    timeoutMs: 1000,
  });
  assert.deepEqual(answer, {
    model: 'qwen2.5:0.5b',
    content: 'Paris',
    doneReason: 'stop',
    durationNs: 2400732304,
  });
});

test('error kinds', async () => {
  const server = new FakeOllama();
  const kind = (promise) =>
    promise.then(
      () => assert.fail('should fail'),
      (err) => err.kind,
    );
  assert.equal(
    await kind(client(server).chat({ model: 'nope', messages: [], timeoutMs: 1000 })),
    ERROR_KINDS.MODEL_NOT_FOUND,
  );
  assert.equal(await kind(client(server).call('GET', '/api/nothing')), ERROR_KINDS.NOT_OLLAMA);
  assert.equal(
    await kind(new OllamaClient({ url: 'http://198.51.100.1', fetch: server.fetch }).version()),
    ERROR_KINDS.UNREACHABLE,
  );
  server.online = 'timeout';
  assert.equal(await kind(client(server).version()), ERROR_KINDS.TIMEOUT);
  server.online = false;
  assert.equal(await kind(client(server).version()), ERROR_KINDS.UNREACHABLE);

  const guarded = new FakeOllama({ apiKey: 'proxy-token' });
  assert.equal(await kind(client(guarded).version()), ERROR_KINDS.AUTH);
  assert.equal(await client(guarded, { apiKey: 'proxy-token' }).version(), '0.40.6');
});

test('a server error keeps the reason of Ollama, never the request', async () => {
  const server = new FakeOllama();
  server.reply = () =>
    new Response(JSON.stringify({ error: 'model requires more system memory' }), { status: 500 });
  const err = await client(server)
    .chat({
      model: 'smollm2:135m',
      messages: [{ role: 'user', content: 'secret question' }],
      timeoutMs: 1000,
    })
    .catch((e) => e);
  assert.equal(err.kind, ERROR_KINDS.HTTP);
  assert.match(err.message, /more system memory/);
  assert.doesNotMatch(err.message, /secret question/);
});

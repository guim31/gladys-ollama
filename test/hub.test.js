// -----------------------------------------------------------------------------
// The hub against the fake Ollama: device and states, the offline / back
// events, the questions and the model loads, the connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS } from '../src/devices.js';
import { TRIGGERS, cleanAnswer, parseTemperature, truncate } from '../src/hub.js';
import {
  FakeOllama,
  createAll,
  createWorld,
  deviceId,
  featureId,
  fixture,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('publishes the server as one device, with its first states', async (t) => {
  const { gladys, fake } = await world(t);
  assert.equal(fake.discoveredDevices.length, 1);
  const [device] = fake.discoveredDevices;
  assert.equal(device.external_id, deviceId(gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [{ name: 'OLLAMA_URL', value: 'http://192.0.2.20:11434' }]);
  assert.equal(fake.lastState(featureId(gladys, FEATURE_KEYS.ONLINE)), 1);
  assert.equal(fake.lastState(featureId(gladys, FEATURE_KEYS.INSTALLED)), 2);
  assert.equal(fake.lastState(featureId(gladys, FEATURE_KEYS.LOADED)), 0);
  assert.equal(fake.lastState(featureId(gladys, FEATURE_KEYS.MEMORY)), 0);
  assert.equal(fake.connectionStatus.connected, true);
});

test('no address: no device, a status asking for it', async (t) => {
  const { fake } = await world(t, { config: { language: 'fr' } });
  assert.deepEqual(fake.discoveredDevices, []);
  assert.equal(fake.connectionStatus.connected, false);
  assert.match(JSON.stringify(fake.connectionStatus), /Saisissez l'adresse/);
});

test('publishes only the changes, and everything again once the device is added', async (t) => {
  const w = await world(t);
  const count = () => w.fake.states.length;
  const before = count();
  await w.hub.refresh();
  assert.equal(count(), before, 'nothing changed, nothing sent');

  w.server.load('qwen2.5:0.5b');
  await w.hub.refresh();
  assert.equal(w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.LOADED)), 1);
  assert.equal(w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.MEMORY)), 365);
  assert.equal(count(), before + 2);

  const refreshes = w.fake.widgetRefreshes.length;
  await createAll(w);
  assert.equal(count(), before + 6, 'the four states again');
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);
});

test('sends the unchanged states again every 12 hours (heartbeat)', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  w.clock.advance(11 * 3600_000);
  await w.hub.refresh();
  assert.equal(w.fake.states.length, before);
  w.clock.advance(3600_000);
  await w.hub.refresh();
  assert.equal(w.fake.states.length, before + 4);
});

test('offline after two failed readings, back with the outage length', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', language: 'fr' } });
  const online = featureId(w.gladys, FEATURE_KEYS.ONLINE);
  w.server.online = false;
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 0, 'one failure is a blip');
  assert.equal(w.fake.lastState(online), 1);
  assert.equal(w.fake.connectionStatus.connected, false);

  w.clock.advance(15_000);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 1);
  const [offline] = w.fake.sceneEvents;
  assert.equal(offline.key ?? offline.event_key, TRIGGERS.OFFLINE);
  assert.match(JSON.stringify(offline), /ne répond pas/);
  assert.equal(w.fake.lastState(online), 0);
  assert.equal(
    w.fake.transports.at(-1).transport ?? w.fake.transports.at(-1)[0]?.transport,
    'unreachable',
  );

  w.clock.advance(60_000);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 1, 'one event per outage');

  w.server.online = true;
  w.clock.advance(5 * 60_000);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 2);
  const back = w.fake.sceneEvents[1];
  assert.equal(back.key ?? back.event_key, TRIGGERS.BACK);
  assert.match(JSON.stringify(back), /"downtime_minutes":6/);
  assert.equal(w.fake.lastState(online), 1);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('a refused key or a wrong address is a status, not an outage', async (t) => {
  const server = new FakeOllama({ apiKey: 'proxy-token' });
  const w = await world(t, { server });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(JSON.stringify(w.fake.connectionStatus), /API key/);
  w.clock.advance(60_000);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 0);

  await w.fake.configUpdated({ url: '192.0.2.20', api_key: 'proxy-token', language: 'en' });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(server.requests.at(-1).headers.authorization, 'Bearer proxy-token');
});

test('ask: the answer goes to the scene, with the model and the time', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', default_model: 'qwen2.5:0.5b' } });
  const ack = await w.fake.sceneAction('ask', { prompt: 'Quelle est la capitale de la France ?' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    response: 'Paris',
    model: 'qwen2.5:0.5b',
    duration_seconds: 2.4,
    truncated: false,
  });
  const request = w.server.requests.find((r) => r.path === '/api/chat').body;
  assert.equal(request.stream, false);
  assert.equal(request.think, false);
  assert.deepEqual(request.messages, [
    { role: 'user', content: 'Quelle est la capitale de la France ?' },
  ]);
  assert.equal(request.options.num_predict, 500);
  assert.equal('keep_alive' in request, false, 'the server setting by default');
});

test('ask: instructions, creativity, length and keep-alive reach Ollama', async (t) => {
  const w = await world(t, {
    config: { url: '192.0.2.20', default_model: 'qwen2.5:0.5b', keep_alive: '30m' },
  });
  await w.fake.sceneAction('ask', {
    prompt: 'Résume la météo',
    model: 'smollm2:135m',
    system: 'Une phrase.',
    temperature: '0.4',
    max_characters: 200,
  });
  const request = w.server.requests.find((r) => r.path === '/api/chat').body;
  assert.equal(request.model, 'smollm2:135m');
  assert.deepEqual(request.messages[0], { role: 'system', content: 'Une phrase.' });
  assert.deepEqual(request.options, { num_predict: 100, temperature: 0.4 });
  assert.equal(request.keep_alive, '30m');
});

test('ask: a long answer is cut cleanly, the reasoning removed', async (t) => {
  const server = new FakeOllama();
  const long = 'Il fait beau. '.repeat(20) + 'Prenez un parapluie quand même demain matin.';
  server.reply = () => ({
    ...fixture('chat'),
    message: { role: 'assistant', content: `<think>Je réfléchis…</think>\n${long}` },
  });
  const w = await world(t, {
    server,
    config: { url: '192.0.2.20', default_model: 'smollm2:135m' },
  });
  const ack = await w.fake.sceneAction('ask', { prompt: 'Météo ?', max_characters: 100 });
  const { response, truncated } = ack.data.outputs;
  assert.equal(truncated, true);
  assert.ok(response.length <= 100, response);
  assert.ok(response.startsWith('Il fait beau.'));
  assert.ok(response.endsWith('…'));
  assert.ok(!response.includes('think'));
});

test('ask: the only installed model is used when none is named', async (t) => {
  const server = new FakeOllama();
  server.tags = server.tags.slice(0, 1);
  const w = await world(t, { server });
  const ack = await w.fake.sceneAction('ask', { prompt: 'Bonjour' });
  assert.equal(ack.data.outputs.model, 'qwen2.5:0.5b');
});

test('ask: errors the user can act on', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', language: 'fr' } });
  let ack = await w.fake.sceneAction('ask', { prompt: 'Bonjour' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Quel modèle/);

  ack = await w.fake.sceneAction('ask', { prompt: 'Bonjour', model: 'llama3.2' });
  assert.match(ack.error, /ollama pull/);

  ack = await w.fake.sceneAction('ask', { prompt: '   ', model: 'smollm2:135m' });
  assert.match(ack.error, /question est vide/);

  w.server.online = 'timeout';
  ack = await w.fake.sceneAction('ask', { prompt: 'Bonjour', model: 'smollm2:135m' });
  assert.match(ack.error, /trop de temps/);

  w.server.online = true;
  w.server.reply = () => ({ ...fixture('chat'), message: { role: 'assistant', content: ' ' } });
  ack = await w.fake.sceneAction('ask', { prompt: 'Bonjour', model: 'smollm2:135m' });
  assert.match(ack.error, /réponse vide/);
});

test('ask: an Ollama that refuses the reasoning switch is asked again without it', async (t) => {
  const server = new FakeOllama();
  server.reply = (body) =>
    'think' in body
      ? new Response(JSON.stringify({ error: 'invalid think value' }), { status: 400 })
      : fixture('chat');
  const w = await world(t, {
    server,
    config: { url: '192.0.2.20', default_model: 'smollm2:135m' },
  });
  const ack = await w.fake.sceneAction('ask', { prompt: 'Bonjour' });
  assert.equal(ack.success, true, ack.error);
  assert.equal(server.requests.filter((r) => r.path === '/api/chat').length, 2);
});

test('load and unload a model', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', default_model: 'smollm2:135m' } });
  let ack = await w.fake.sceneAction('load_model', {});
  assert.deepEqual(ack.data.outputs, { model: 'smollm2:135m' });
  assert.equal(w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.LOADED)), 1);

  w.server.load('qwen2.5:0.5b');
  ack = await w.fake.sceneAction('unload_model', { model: 'qwen2.5:0.5b' });
  assert.deepEqual(ack.data.outputs, { unloaded: 1 });
  assert.deepEqual(
    w.server.ps.map((m) => m.name),
    ['smollm2:135m'],
  );

  w.server.load('qwen2.5:0.5b');
  ack = await w.fake.sceneAction('unload_model', {});
  assert.deepEqual(ack.data.outputs, { unloaded: 2 });
  ack = await w.fake.sceneAction('unload_model', { model: 'smollm2:135m' });
  assert.deepEqual(ack.data.outputs, { unloaded: 0 }, 'not in memory: not counted');
  await w.hub.refresh();
  assert.equal(w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.LOADED)), 0);
});

test('"Test the connection" lists the installed models', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', language: 'fr' } });
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.fr,
    'Ollama 0.40.6 répond. 2 modèle(s) installé(s), 0 en mémoire : qwen2.5:0.5b, smollm2:135m',
  );
  w.server.online = false;
  const failed = await w.fake.action('test_connection', {});
  assert.match(failed.data.message.en, /^Ollama: Ollama does not answer/);
});

test('a new address forgets the old server without firing events', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.hub.refresh();
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 1);
  w.server.online = true;
  w.server.url = 'http://198.51.100.5:11434';
  await w.fake.configUpdated({ url: '198.51.100.5', language: 'en' });
  assert.equal(w.fake.sceneEvents.length, 1);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('truncate, cleanAnswer, parseTemperature', () => {
  assert.deepEqual(truncate('court', 10), { text: 'court', truncated: false });
  const cut = truncate('Un. Deux trois quatre cinq six sept huit', 20);
  assert.equal(cut.truncated, true);
  assert.ok(cut.text.length <= 20);
  assert.equal(cleanAnswer('<think>a\nb</think>\n\nRéponse '), 'Réponse');
  assert.equal(cleanAnswer('<think>jamais fini'), '');
  assert.equal(parseTemperature('default'), undefined);
  assert.equal(parseTemperature('0,8'), 0.8);
  assert.equal(parseTemperature('5'), undefined);
});

test('"Unload right away" does not turn a load into an unload', async (t) => {
  const w = await world(t, {
    config: { url: '192.0.2.20', default_model: 'smollm2:135m', keep_alive: '0' },
  });
  await w.fake.sceneAction('load_model', {});
  const request = w.server.requests.find((r) => r.path === '/api/generate').body;
  assert.equal('keep_alive' in request, false);
  assert.equal(w.server.ps.length, 1);
});

test('an answer Ollama stopped at the length limit is marked as cut', async (t) => {
  const server = new FakeOllama();
  server.reply = () => ({
    ...fixture('chat'),
    done_reason: 'length',
    message: { role: 'assistant', content: 'Il était une fois un lama qui vivait dans les mont' },
  });
  const w = await world(t, {
    server,
    config: { url: '192.0.2.20', default_model: 'smollm2:135m' },
  });
  const { outputs } = (await w.fake.sceneAction('ask', { prompt: 'Une histoire' })).data;
  assert.equal(outputs.truncated, true);
  assert.equal(outputs.response, 'Il était une fois un lama qui vivait dans les…');
});

test('a reverse proxy answering 502 counts as offline', async (t) => {
  const server = new FakeOllama();
  const w = await world(t, { server });
  const real = server.fetch;
  server.fetch = async () => new Response('<html>Bad Gateway</html>', { status: 502 });
  w.hub.client.fetch = server.fetch;
  await w.hub.refresh();
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 1);
  w.hub.client.fetch = real;
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 2);
});

test('a new address is read at once, even while the old one is being read', async (t) => {
  const server = new FakeOllama();
  const w = await world(t, { server });
  let release;
  const slow = new Promise((resolve) => {
    release = resolve;
  });
  const real = server.fetch;
  w.hub.client.fetch = async (...args) => {
    await slow;
    return real(...args);
  };
  const pending = w.hub.refresh();
  server.url = 'http://198.51.100.5:11434';
  await w.fake.configUpdated({ url: '198.51.100.5', language: 'en' });
  assert.equal(w.hub.state.online, true, 'the new server was read');
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  release();
  await pending;
  assert.equal(w.fake.connectionStatus.connected, true);
});

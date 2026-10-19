// -----------------------------------------------------------------------------
// The dashboard widget: content valid for the core, within its budget, and
// its two buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { ACTIONS, formatSize } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, language = 'en') {
  const ack = await w.fake.widgetGet('ollama', { settings: {}, language });
  assert.equal(ack.success, true, ack.error);
  const data = ack.data.content;
  assert.deepEqual(validateWidgetContent(data), []);
  assert.ok(data.components.length <= 8, 'budget: 8 components');
  assert.ok(data.components.filter((c) => c.type === 'text').length <= 2, 'budget: 2 texts');
  for (const item of data.components.filter((c) => c.type === 'status').flatMap((c) => c.items)) {
    assert.ok(item.value !== undefined && String(item.value).length <= 40, item.label);
  }
  return data;
}

test('the server, the models in memory and the buttons', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', default_model: 'smollm2:135m' } });
  w.server.load('smollm2:135m');
  await w.hub.refresh();
  const data = await content(w);
  const values = data.components.filter((c) => c.type === 'value').map((c) => c.value);
  assert.deepEqual(values, [2, 1, 0.4]);
  const [status] = data.components.filter((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Ollama', 'Online · 0.40.6'],
      ['smollm2:135m', '365 MB · 6 min'],
    ],
  );
  const buttons = data.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => [b.action.key, b.icon]),
    [
      [ACTIONS.LOAD, 'check-circle'],
      [ACTIONS.UNLOAD, 'power'],
    ],
  );
});

test('the buttons load the default model and free the memory', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', default_model: 'smollm2:135m' } });
  let ack = await w.fake.widgetAction('ollama', ACTIONS.LOAD, {}, { settings: {} });
  assert.equal(ack.data.message.fr, 'smollm2:135m est chargé.');
  ack = await w.fake.widgetAction('ollama', ACTIONS.UNLOAD, {}, { settings: {} });
  assert.equal(ack.data.message.en, '1 model(s) unloaded.');
  assert.deepEqual(w.server.ps, []);
});

test('no default model: no load button; offline: no button at all', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20' } });
  let data = await content(w, 'fr');
  assert.deepEqual(
    data.components.filter((c) => c.type === 'button').map((b) => b.action.key),
    [ACTIONS.UNLOAD],
  );
  assert.equal(
    data.components.find((c) => c.type === 'status').items[1].label,
    'Aucun modèle en mémoire',
  );

  w.server.online = false;
  await w.hub.refresh();
  await w.hub.refresh();
  data = await content(w, 'fr');
  assert.equal(data.components.filter((c) => c.type === 'button').length, 0);
  assert.equal(data.components.find((c) => c.type === 'status').items[0].value, 'Injoignable');
});

test('no address: a single message', async (t) => {
  const w = await world(t, { config: {} });
  const data = await content(w, 'de');
  assert.equal(data.components.length, 1);
  assert.match(data.components[0].text, /Gib die Adresse/);
});

test('formatSize', () => {
  assert.equal(formatSize(365), '365 MB');
  assert.equal(formatSize(4700), '4.6 GB');
});

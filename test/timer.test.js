// -----------------------------------------------------------------------------
// The container reads the server on its own timer (should_poll: false, and a
// device created without should_poll is never polled by Gladys 5.2: #3198):
// proven here without ever calling onPoll.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS } from '../src/devices.js';
import { createWorld, featureId } from './helpers/world.js';

const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('the server is read at the configured interval, an outage confirmed 15 s later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({
    timers: true,
    config: { url: '192.0.2.20', poll_interval: '120' },
  });
  t.after(() => w.app.stop());
  const versionReads = () => w.server.requests.filter((r) => r.path === '/api/version').length;
  assert.equal(versionReads(), 1);

  t.mock.timers.tick(119_000);
  await settle();
  assert.equal(versionReads(), 1);
  w.server.load('smollm2:135m');
  t.mock.timers.tick(1_000);
  await settle();
  assert.equal(versionReads(), 2);
  assert.equal(w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.LOADED)), 1);

  w.server.online = false;
  t.mock.timers.tick(120_000);
  await settle();
  assert.equal(w.fake.sceneEvents.length, 0);
  t.mock.timers.tick(15_000);
  await settle();
  assert.equal(w.fake.sceneEvents.length, 1, 'the retry confirms the outage');
});

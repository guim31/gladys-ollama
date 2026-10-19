// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys and a fake Ollama server, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read the server with
// `world.hub.refresh()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { FakeOllama, fixture } from './fakeOllama.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL = 'http://192.0.2.20:11434';

/** A manual clock. */
export function createClock(start = Date.parse('2026-10-19T19:51:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {FakeOllama} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  server = new FakeOllama(),
  config = { url: '192.0.2.20', language: 'en' },
  devices = [],
  connect = true,
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: server.fetch,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server, app, hub: app.hub, clock };
}

export const deviceId = (gladys) => gladys.externalIds('server', 'ollama').device;
export const featureId = (gladys, key) => gladys.externalIds('server', 'ollama').feature(key);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { FakeOllama, fixture };

// -----------------------------------------------------------------------------
// One Gladys device: the Ollama server.
//
// Identity: a fixed id. One server per integration, and Ollama exposes no
// instance id: changing its address (an IP for a name, a port) keeps the
// device and its history.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - online: input/binary, 1 when the server answers, 0 once it failed two
//     readings in a row (a blip is not an outage);
//   - installed models, models in memory: counter-sensor/integer;
//   - memory used: data/size in megabytes, the sum of the models in memory
//     (RAM and VRAM: what `ollama ps` shows as SIZE).
//
// should_poll: false: the hub reads the server on its own timer, at the
// interval chosen in the configuration (see src/hub.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'server';
export const DEVICE_ID = 'ollama';
export const URL_PARAM = 'OLLAMA_URL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  INSTALLED: 'models_installed',
  LOADED: 'models_loaded',
  MEMORY: 'memory_used',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.INSTALLED]: 'Installed models',
    [FEATURE_KEYS.LOADED]: 'Models in memory',
    [FEATURE_KEYS.MEMORY]: 'Memory used',
  },
  fr: {
    [FEATURE_KEYS.ONLINE]: 'En ligne',
    [FEATURE_KEYS.INSTALLED]: 'Modèles installés',
    [FEATURE_KEYS.LOADED]: 'Modèles en mémoire',
    [FEATURE_KEYS.MEMORY]: 'Mémoire utilisée',
  },
  de: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.INSTALLED]: 'Installierte Modelle',
    [FEATURE_KEYS.LOADED]: 'Modelle im Speicher',
    [FEATURE_KEYS.MEMORY]: 'Belegter Speicher',
  },
  es: {
    [FEATURE_KEYS.ONLINE]: 'En línea',
    [FEATURE_KEYS.INSTALLED]: 'Modelos instalados',
    [FEATURE_KEYS.LOADED]: 'Modelos en memoria',
    [FEATURE_KEYS.MEMORY]: 'Memoria usada',
  },
};

const MB = 1024 * 1024;

/** Megabytes held in memory by the loaded models. */
export const memoryMb = (loaded) =>
  Math.round(loaded.reduce((total, model) => total + model.size, 0) / MB);

const counter = (key, value, max) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max,
  },
  value,
});

// Order = display order in Gladys. A value of null publishes nothing.
const FEATURES = [
  {
    key: FEATURE_KEYS.ONLINE,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.INPUT,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1,
    },
    value: (state) => (state.online === null ? null : state.online ? 1 : 0),
  },
  counter(FEATURE_KEYS.INSTALLED, (state) => state.models?.length ?? null, 1000),
  counter(FEATURE_KEYS.LOADED, (state) => state.loaded?.length ?? null, 100),
  {
    key: FEATURE_KEYS.MEMORY,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.DATA,
      type: DEVICE_FEATURE_TYPES.DATA.SIZE,
      unit: DEVICE_FEATURE_UNITS.MEGABYTE,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      // 1 TB: display bound only, the core never applies it on write.
      max: 1_000_000,
    },
    value: (state) => (state.loaded ? memoryMb(state.loaded) : null),
  },
];

/** External ids of the device and its features. */
export const deviceIds = (gladys) => gladys.externalIds(DEVICE_TYPE, DEVICE_ID);

/**
 * The discovery payload of the server.
 * @param {object} gladys SDK client
 * @param {string} url base URL of the server
 * @param {string} language feature names language
 */
export function buildDevice(gladys, url, language = 'en') {
  const ids = deviceIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: 'Ollama',
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: url }],
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature for a server state (null: nothing to publish).
 * @param {{ online: boolean|null, models: Array|null, loaded: Array|null }} state
 * @returns {Array<{ key: string, externalId: string, value: number|null }>}
 */
export function featureValues(gladys, state) {
  const ids = deviceIds(gladys);
  return FEATURES.map(({ key, value }) => ({
    key,
    externalId: ids.feature(key),
    value: value(state),
  }));
}

// -----------------------------------------------------------------------------
// The Ollama hub: the server is read on a timer of the container (the
// interval chosen in the configuration), its states published to Gladys when
// they change, the "offline" / "back" scene events fired on transitions; and
// the questions, loads and unloads of the scene actions and the widget.
//
// Gladys never polls the device (should_poll: false): the configurable
// interval goes up to 5 minutes, beyond the fixed list of the core scheduler,
// and the scene events must fire even when the device was not added.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, deviceIds, featureValues } from './devices.js';
import { ERROR_KINDS, OllamaClient } from './ollama/client.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'ollama-hub' });

export const WIDGET_KEY = 'ollama';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  OFFLINE: 'server_offline',
  BACK: 'server_back',
});

export const HUB_TIMINGS = {
  // A server that fails once is read again this soon, to tell a blip from an outage.
  retryMs: 15_000,
  // Failures in a row before the server counts as down (scene event).
  downAfterFailures: 2,
  // States that do not change are sent again this often, or Gladys shows
  // "no recent value" after 48 hours.
  heartbeatMs: 12 * 60 * 60_000,
  // After a question or a load, read the models in memory again this soon.
  afterActionMs: 1_000,
};

// What the scene action hands over: Gladys caps an output at 10 000 characters.
export const MAX_ANSWER_CHARACTERS = 10_000;
export const DEFAULT_ANSWER_CHARACTERS = 1000;
export const MIN_ANSWER_CHARACTERS = 50;

const DOWN_KINDS = new Set([ERROR_KINDS.UNREACHABLE, ERROR_KINDS.TIMEOUT]);

/** The reasoning some models write before their answer, in `<think>` tags. */
const THINKING = /<think>[\s\S]*?(<\/think>|$)/g;

/**
 * Cut an answer to `max` characters, at the end of a sentence when one ends in
 * the last third, else at a word; `…` marks the cut.
 * @returns {{ text: string, truncated: boolean }}
 */
export function truncate(text, max) {
  if (text.length <= max) {
    return { text, truncated: false };
  }
  const room = text.slice(0, max - 1);
  const sentence = Math.max(
    ...['. ', '! ', '? ', '.\n', '!\n', '?\n', '\n'].map((end) => room.lastIndexOf(end)),
  );
  if (sentence >= max * 0.66) {
    return { text: `${room.slice(0, sentence + 1).trimEnd()} …`.slice(0, max), truncated: true };
  }
  const word = room.lastIndexOf(' ');
  const cut = word >= max * 0.66 ? room.slice(0, word) : room;
  return { text: `${cut.trimEnd()}…`, truncated: true };
}

/** The answer as Gladys gets it: no reasoning, no blank edges. */
export const cleanAnswer = (content) => content.replace(THINKING, '').trim();

/** A number of characters typed in a scene (a number, or a string). */
export function parseMaxCharacters(raw) {
  const number = typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : raw;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    return DEFAULT_ANSWER_CHARACTERS;
  }
  return Math.min(MAX_ANSWER_CHARACTERS, Math.max(MIN_ANSWER_CHARACTERS, Math.round(number)));
}

/** A temperature typed in a scene: "0.7", "0,7", or empty for the model's own. */
export function parseTemperature(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'default') {
    return undefined;
  }
  const number = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(number) && number >= 0 && number <= 2 ? number : undefined;
}

export class OllamaHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {typeof fetch} [options.fetch] HTTP seam (tests)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, fetch, timers = true, timings, now }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.state = this.emptyState();
    /** Last value published per feature external id, and when. */
    this.published = new Map();
    this.heartbeatAt = 0;
    this.transport = null;
    this.connection = null;
    this.pollTimer = null;
    this.retryTimer = null;
    this.afterActionTimer = null;
    this.reading = null;
    this.stopped = false;
    /** Problems already logged as warnings, by key: repeats go to debug. */
    this.warned = new Set();
  }

  emptyState() {
    return {
      online: null,
      version: null,
      models: null,
      loaded: null,
      error: null,
      failures: 0,
      down: false,
      downSince: null,
    };
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (server connected, lost, back, user
  // commands). A problem that repeats every cycle is logged once at its own
  // level, then at debug until it clears. Never a question or an answer.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key) {
    this.warned.delete(key);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transport = null;
    this.connection = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const changed = !previous || previous.url !== config.url || previous.apiKey !== config.apiKey;
    if (changed) {
      this.client = config.url
        ? new OllamaClient({ url: config.url, apiKey: config.apiKey, fetch: this.fetch })
        : null;
      // Another server: forget what the previous one said, without events.
      this.state = this.emptyState();
      clearTimeout(this.retryTimer);
    }
    await this.publishDevices();
    await this.refresh();
    this.schedulePoll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.retryTimer);
    clearTimeout(this.afterActionTimer);
    await this.reading?.catch(() => {});
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.refresh();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  later(name, delay, run) {
    clearTimeout(this[name]);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this[name] = setTimeout(() => {
      run().catch((err) => this.problem(name, 'Reading failed', err, 'error'));
    }, delay);
    this[name].unref?.();
  }

  // --- Device ----------------------------------------------------------------

  async publishDevices() {
    // An empty list when no address is set: the Discovery tab shows nothing stale.
    const devices = this.config.url
      ? [buildDevice(this.gladys, this.config.url, this.config.language)]
      : [];
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** "Search" in the Discovery tab: publish the device again, read the server. */
  async rediscover() {
    await this.publishDevices();
    await this.refresh();
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (device.external_id !== deviceIds(this.gladys).device) {
      return;
    }
    await this.publishStates({ force: true });
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Reading the server ------------------------------------------------------

  /** Read the server and publish what changed. Concurrent calls share the read. */
  refresh() {
    if (!this.client) {
      return this.afterChanges(false);
    }
    // A read of a previous address is not shared: the new one is read now.
    if (this.reading?.client !== this.client) {
      const reading = this.read().finally(() => {
        if (this.reading === reading) {
          this.reading = null;
        }
      });
      reading.client = this.client;
      this.reading = reading;
    }
    return this.reading;
  }

  /** Gladys asks for a refresh (onPoll), a fallback: the timer does the work. */
  async pollDevice(device) {
    if (device.external_id === deviceIds(this.gladys).device) {
      await this.refresh();
    }
  }

  async read() {
    const client = this.client;
    let widgetChanged;
    try {
      const [version, models, loaded] = await Promise.all([
        client.version(),
        client.tags(),
        client.ps(),
      ]);
      if (client !== this.client) {
        return; // the address changed while reading
      }
      widgetChanged = await this.applySuccess({ version, models, loaded });
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client !== this.client) {
        return;
      }
      widgetChanged = await this.applyFailure(err);
    }
    await this.afterChanges(widgetChanged);
  }

  async applySuccess({ version, models, loaded }) {
    const state = this.state;
    const names = (list) => (list ?? []).map((model) => model.name).join('\n');
    let widgetChanged =
      state.online !== true ||
      state.error !== null ||
      state.version !== version ||
      names(state.models) !== names(models) ||
      names(state.loaded) !== names(loaded);
    if (state.down) {
      const downMinutes = Math.round((this.now() - state.downSince) / 60_000);
      logger.info(`Ollama answers again after ${downMinutes} min`);
      await this.fire(TRIGGERS.BACK, { downtime_minutes: downMinutes });
    } else if (state.error) {
      logger.info('Ollama: connection restored');
    } else if (state.online === null) {
      logger.info(`Ollama ${version} connected, ${models.length} model(s) installed`);
    }
    clearTimeout(this.retryTimer);
    this.state = {
      online: true,
      version,
      models,
      loaded,
      error: null,
      failures: 0,
      down: false,
      downSince: null,
    };
    await this.publishStates();
    return widgetChanged;
  }

  async applyFailure(err) {
    const state = this.state;
    const wasError = state.error?.kind;
    state.error = { kind: err.kind, message: err.message };
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Ollama: ${err.message}`);
    } else {
      logger.debug(`Ollama: ${err.message} (again)`);
    }
    // Only silence counts as down: a refused key or a wrong address is a
    // configuration problem, reported by the connection status.
    if (!DOWN_KINDS.has(err.kind)) {
      state.failures = 0;
      // Keeps the heartbeat of the last values going.
      await this.publishStates();
      return wasError !== err.kind;
    }
    state.failures += 1;
    if (state.failures === 1) {
      state.downSince = this.now();
      this.later('retryTimer', this.timings.retryMs, () => this.refresh());
    }
    if (!state.down && state.failures >= this.timings.downAfterFailures) {
      state.down = true;
      state.online = false;
      await this.fire(TRIGGERS.OFFLINE, {
        error: pick(ERROR_TEXT[err.kind], this.config.language),
      });
      await this.publishStates();
      return true;
    }
    await this.publishStates();
    return wasError !== err.kind;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishStates({ force = false } = {}) {
    const heartbeat = this.now() - this.heartbeatAt >= this.timings.heartbeatMs;
    const states = [];
    for (const { externalId, value } of featureValues(this.gladys, this.state)) {
      if (value === null || (!force && !heartbeat && this.published.get(externalId) === value)) {
        continue;
      }
      states.push({ device_feature_external_id: externalId, state: value });
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, state.state);
      }
      if (heartbeat || force) {
        this.heartbeatAt = this.now();
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged) {
    await this.publishTransport();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async publishTransport() {
    if (!this.client || this.state.online === null) {
      return;
    }
    const transport = this.state.down ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    if (this.transport === transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: deviceIds(this.gladys).device, transport },
      ]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transport refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (this.state.error) {
      return { connected: false, message: ERROR_TEXT[this.state.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  /** The client, or the reason there is none, in the configured language. */
  requireClient() {
    if (!this.client) {
      const status = this.connectionStatus();
      throw new Error(pick(status.message, this.config?.language));
    }
    return this.client;
  }

  /** An error of the client, as the user reads it. */
  userError(err) {
    if (!err.kind) {
      return err;
    }
    return new Error(pick(ERROR_TEXT[err.kind], this.config.language), { cause: err });
  }

  /**
   * The model a command uses: the one typed, else the default of the
   * configuration, else the only installed model.
   */
  modelOf(typed) {
    const model = (typeof typed === 'string' ? typed.trim() : '') || this.config.defaultModel;
    if (model) {
      return model;
    }
    if (this.state.models?.length === 1) {
      return this.state.models[0].name;
    }
    throw new Error(pick(ACTION_TEXT.noModel, this.config.language));
  }

  /** Read the models in memory again shortly (a question loads its model). */
  refreshSoon() {
    this.later('afterActionTimer', this.timings.afterActionMs, () => this.refresh());
  }

  /**
   * Ask a model one question.
   * @param {object} request
   * @param {string} request.prompt
   * @param {string} [request.model]
   * @param {string} [request.system]
   * @param {number} [request.temperature]
   * @param {number} [request.maxCharacters]
   * @returns {Promise<{ response: string, model: string, duration_seconds: number, truncated: boolean }>}
   */
  async ask({ prompt, model: typedModel, system, temperature, maxCharacters }) {
    const client = this.requireClient();
    const language = this.config.language;
    const question = typeof prompt === 'string' ? prompt.trim() : '';
    if (!question) {
      throw new Error(pick(ACTION_TEXT.noPrompt, language));
    }
    const model = this.modelOf(typedModel);
    const max = parseMaxCharacters(maxCharacters);
    const messages = [];
    if (typeof system === 'string' && system.trim()) {
      messages.push({ role: 'system', content: system.trim() });
    }
    messages.push({ role: 'user', content: question });
    // A token is three to four characters: this bounds the generation time
    // too, with room for the answer to end on its own before the cut.
    const options = { num_predict: Math.ceil(max / 2) };
    if (temperature !== undefined) {
      options.temperature = temperature;
    }
    const started = this.now();
    let answer;
    try {
      answer = await client.chat({
        model,
        messages,
        options,
        keepAlive: this.config.keepAlive,
        timeoutMs: this.config.timeoutMs,
      });
    } catch (err) {
      logger.warn(`Question to ${model} failed: ${err.message}`);
      throw this.userError(err);
    } finally {
      this.refreshSoon();
    }
    const text = cleanAnswer(answer.content);
    if (!text) {
      logger.warn(`Question to ${model}: empty answer`);
      throw new Error(pick(ACTION_TEXT.emptyAnswer, language));
    }
    let { text: response, truncated } = truncate(text, max);
    if (!truncated && answer.doneReason === 'length') {
      // Ollama stopped at num_predict, mid-sentence: cut cleanly there too.
      ({ text: response } = truncate(response, response.length - 1));
      truncated = true;
    }
    const seconds =
      Math.round(
        (answer.durationNs ? answer.durationNs / 1e9 : (this.now() - started) / 1000) * 10,
      ) / 10;
    // Lengths only: the question and the answer stay out of the logs.
    logger.info(
      `Question answered by ${answer.model} in ${seconds} s (${response.length} characters${truncated ? ', cut' : ''})`,
    );
    return { response, model: answer.model, duration_seconds: seconds, truncated };
  }

  /** Load a model in memory ahead of the questions. */
  async load(typedModel) {
    const client = this.requireClient();
    const model = this.modelOf(typedModel);
    try {
      // keep_alive 0 would unload at once: the server's own delay instead.
      await client.load(model, this.config.keepAlive === 0 ? undefined : this.config.keepAlive);
    } catch (err) {
      logger.warn(`Loading ${model} failed: ${err.message}`);
      throw this.userError(err);
    }
    logger.info(`Model ${model} loaded`);
    await this.refresh();
    return model;
  }

  /**
   * Free the memory of one model, or of every model in memory.
   * @returns {Promise<number>} the number of models unloaded
   */
  async unload(typedModel) {
    const client = this.requireClient();
    const typed = typeof typedModel === 'string' ? typedModel.trim() : '';
    let loaded;
    try {
      loaded = (await client.ps()).map((model) => model.name);
    } catch (err) {
      throw this.userError(err);
    }
    const inMemory = (name) => loaded.includes(name) || loaded.includes(`${name}:latest`);
    // A model typed is unloaded even when not seen in memory (a load may be
    // under way); only the ones that were in memory are counted.
    const models = typed ? [typed] : loaded;
    try {
      await Promise.all(models.map((model) => client.unload(model)));
    } catch (err) {
      logger.warn(`Unloading failed: ${err.message}`);
      throw this.userError(err);
    }
    const count = models.filter(inMemory).length;
    logger.info(models.length ? `Unloaded: ${models.join(', ')}` : 'No model to unload');
    this.refreshSoon();
    return count;
  }

  /** "Test the connection": read the server now, one line. */
  async testConnection() {
    await this.refresh();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!this.client) {
        message[language] = pick(this.connectionStatus().message, language);
      } else if (this.state.error) {
        message[language] = labelled(
          'Ollama',
          pick(ERROR_TEXT[this.state.error.kind], language),
          language,
        );
      } else if (!this.state.models || !this.state.loaded) {
        message[language] = pick(ERROR_TEXT[ERROR_KINDS.TIMEOUT], language);
      } else if (this.state.models.length === 0) {
        message[language] = `${text.ok(this.state.version)} ${text.none}`;
      } else {
        const names = this.state.models.map((model) => model.name);
        const list = names.length > 8 ? `${names.slice(0, 8).join(', ')}…` : names.join(', ');
        const counts = `${text.installed(names.length)}, ${text.loaded(this.state.loaded.length)}`;
        message[language] = `${text.ok(this.state.version)} ${labelled(counts, list, language)}`;
      }
    }
    return message;
  }
}

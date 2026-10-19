// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Ask Ollama" hands the answer to the next actions as an output
// (`{{<column>.<row>.response}}`): the scene then sends it by message, reads
// it aloud or tests it, with the core's own actions. "Load a model" warms a
// model before a question that must be quick; "Unload a model" frees the
// memory of a small server.
// -----------------------------------------------------------------------------

import { parseTemperature } from './hub.js';

export const SCENE_ACTIONS = {
  async ask(hub, { fields = {} }) {
    return hub.ask({
      prompt: fields.prompt,
      model: fields.model,
      system: fields.system,
      temperature: parseTemperature(fields.temperature),
      maxCharacters: fields.max_characters,
    });
  },

  async load_model(hub, { fields = {} }) {
    return { model: await hub.load(fields.model) };
  },

  async unload_model(hub, { fields = {} }) {
    return { unloaded: await hub.unload(fields.model) };
  },
};

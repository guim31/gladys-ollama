# Ollama for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
brings [Ollama](https://ollama.com), the local large language model server, to
Gladys scenes: ask a model a question with the scene information in it, and
hand its answer to the next actions (a message, a speaker, a condition). It
also follows the server. Everything stays on the local network: no cloud, no
account.

## Features

- **Scene action _Ask Ollama_**: a question (with scene variables), an
  optional model (the default one otherwise), optional instructions (system
  prompt), a creativity level (temperature) and a longest answer in
  characters. The outputs **Answer**, **Model used**, **Answer time** and
  **Answer cut** are available to the following actions. A long answer is cut
  cleanly at the end of a sentence; reasoning models are asked to answer
  without their reasoning, and `<think>` blocks are removed.
- **Scene actions _Load an Ollama model_** (warm a model before a question
  that must be quick) and **_Unload an Ollama model_** (one, or every model in
  memory).
- **One device "Ollama"**: online, installed models, models in memory, memory
  used (MB).
- **Scene triggers**: _Ollama is offline_ (two failed readings in a row, with
  the reason) and _Ollama is back online_ (with the length of the outage).
- **Dashboard widget** "Ollama": the server and its version, installed models,
  the models in memory with their size and the minutes before Ollama unloads
  them, the memory used, and two buttons: **Load model** (the default model)
  and **Free memory**.
- A **Test the connection** button that lists the installed models, a
  connection status that says what is wrong, and a transport badge (local or
  unreachable).
- Every text in English, French, German and Spanish.

Gladys already has an AI assistant through Gladys Plus (OpenAI, the core
`ai.ask` action). This integration does not replace it: it is the local,
private counterpart, usable without Gladys Plus.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions,
  action outputs).
- An **Ollama** server reachable from Gladys, with at least one model
  (`ollama pull llama3.2`). On another machine than Gladys, Ollama must listen
  on the network: `OLLAMA_HOST=0.0.0.0`. Ollama has no authentication: keep
  port 11434 inside your network, or put a reverse proxy with a Bearer token in
  front of it (the optional _API key_ field).

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-ollama` (or
   install **Ollama** from the catalog once it is listed).
2. In **Configuration**, enter the address of the server (`192.168.1.20`,
   port 11434 added; `host:port`; or the URL of a reverse proxy) and a default
   model, then press **Test the connection**.
3. In the **Discovery** tab, add the **Ollama** device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Every refresh interval (30 s to 5 min, 1 min by default), the server is read
  with `GET /api/version`, `GET /api/tags` (installed models) and
  `GET /api/ps` (models in memory). The device is published with
  `should_poll: false`: the container reads the server on its own timer, the
  interval goes beyond the list of the Gladys scheduler, and the scene events
  must fire even when the device was not added. Only the values that changed
  are sent, all of them again when the device is added, and every 12 hours.
- A question is `POST /api/chat` with `stream: false` and `think: false`
  (asked again without `think` if the server refuses it), the instructions as
  a `system` message, `options.temperature` and `options.num_predict` (half the
  longest answer in characters, which also bounds the generation time), and
  the configured `keep_alive`. The wait is configurable (30 to 110 s; Gladys
  grants the action 120 s).
- Loading is `POST /api/generate` with a model and no prompt; unloading the
  same with `keep_alive: 0`.
- The server is "offline" after two failed readings in a row (the second 15 s
  after the first), counting only silence (refused connection, timeout): a
  refused key or a wrong address is a configuration problem, shown in the
  connection status.
- Nothing is stored under `/data`. The questions and the answers never reach
  the logs (only the model, the time and the length of the answer); the API
  key neither.

## Checked on a real Ollama

On 19/10/2026 the integration was checked against a real Ollama server
(`ollama/ollama` 0.40.6, on processor, in Docker) with `qwen2.5:0.5b` and
`smollm2:135m`; its answers are the fixtures of the tests
(`test/fixtures/ollama/`). The Docker image of the integration was run with the
Gladys sandbox constraints (read-only root, all capabilities dropped, 256 MB,
bridge network). Not checked: the widget and the scene editor in a real
Gladys, a reverse proxy with a Bearer token (covered by the tests only), and
reasoning models (`<think>` blocks are covered by the tests only).

## Limitations

- One server per Gladys; one question, one answer (no conversation history).
- Text only: no images, no tool calls, no streaming.
- Gladys waits two minutes at most for a scene action, and caps an output at
  10,000 characters.
- Names ending in `.local` do not resolve inside the integration container:
  use IP addresses or names your DNS resolves.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and a fake Ollama (`test/helpers/fakeOllama.js`) built on answers recorded from
a real server. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Ollama](https://github.com/ollama/ollama) (MIT): the API, and the logo on the
  cover (`docs/logo.svg` of the Ollama repository, also on
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ollama-logo.svg)).
- Home Assistant's
  [`ollama`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/ollama)
  integration (Apache-2.0): the choice of settings (model, instructions,
  keep-alive); no code was copied.
- The architecture and the conformity tests follow
  [gladys-wled](https://github.com/guim31/gladys-wled) and
  [gladys-pihole](https://github.com/guim31/gladys-pihole).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Ollama. "Ollama"
and the Ollama logo belong to their owners.

## License

Apache-2.0

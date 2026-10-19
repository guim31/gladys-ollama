# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Scene action _Ask Ollama_: a question with scene variables, an optional
  model, instructions, creativity and longest answer; the answer, the model,
  the answer time and whether the answer was cut are handed to the next
  actions.
- Scene actions _Load an Ollama model_ and _Unload an Ollama model_.
- An "Ollama" device: online, installed models, models in memory, memory used.
- Scene triggers _Ollama is offline_ and _Ollama is back online_.
- Dashboard widget "Ollama": server, models in memory, memory used, _Load
  model_ and _Free memory_ buttons.
- _Test the connection_ lists the installed models.
- English, French, German and Spanish everywhere.

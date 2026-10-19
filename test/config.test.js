import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseServerUrl } from '../src/config.js';

test('parseServerUrl: bare host gets port 11434, a full URL is kept', () => {
  assert.equal(parseServerUrl('192.0.2.20'), 'http://192.0.2.20:11434');
  assert.equal(parseServerUrl(' ollama.lan:8080 '), 'http://ollama.lan:8080');
  assert.equal(parseServerUrl('http://192.0.2.20:11434/'), 'http://192.0.2.20:11434');
  assert.equal(parseServerUrl('http://192.0.2.20:11434/api'), 'http://192.0.2.20:11434');
  assert.equal(parseServerUrl('https://ai.example.org/ollama/'), 'https://ai.example.org/ollama');
  assert.equal(parseServerUrl('https://ai.example.org'), 'https://ai.example.org');
  assert.equal(parseServerUrl('http://user:pass@192.0.2.20'), null);
  assert.equal(parseServerUrl('ftp://192.0.2.20'), null);
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(undefined), null);
});

test('normalizeConfig: defaults and choices', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    urlTyped: false,
    apiKey: '',
    defaultModel: '',
    timeoutMs: 60_000,
    keepAlive: undefined,
    pollIntervalMs: 60_000,
    language: 'fr',
  });
  const config = normalizeConfig({
    url: 'not a url at all',
    default_model: ' llama3.2 ',
    timeout: '110',
    keep_alive: '-1',
    poll_interval: '7',
    language: 'it',
  });
  assert.equal(config.url, null);
  assert.equal(config.urlTyped, true);
  assert.equal(config.defaultModel, 'llama3.2');
  assert.equal(config.timeoutMs, 110_000);
  assert.equal(config.keepAlive, -1);
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ keep_alive: '30m' }).keepAlive, '30m');
  assert.equal(normalizeConfig({ keep_alive: '0' }).keepAlive, 0);
});

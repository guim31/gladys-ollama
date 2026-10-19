// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `ollama`.
//
// The use cases: is the server up, which models are in memory and how much
// memory they hold; free that memory (a small server shared with other
// services), or load the default model before a question that must be quick.
//
// Budget (8 components): three values (installed models, models in memory,
// memory used), one status list (the server, then each model in memory with
// its size and the minutes before Ollama unloads it) and two buttons. The
// figures are values, not bound to device features: the widget works before
// the device is added to Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { memoryMb } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ERROR_KINDS } from './ollama/client.js';
import { pick } from './texts.js';

// Action keys of the buttons: permanent once published.
export const ACTIONS = Object.freeze({
  LOAD: 'load_default',
  UNLOAD: 'unload_all',
});

// Status rows for the models in memory, the server row aside.
const MAX_MODEL_ROWS = 5;

export const TEXT = {
  noUrl: {
    en: 'Enter the address of your Ollama server in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Ollama dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Ollama-Servers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Ollama en la configuración de la integración.',
  },
  installed: { en: 'Installed', fr: 'Installés', de: 'Installiert', es: 'Instalados' },
  loaded: { en: 'In memory', fr: 'En mémoire', de: 'Im Speicher', es: 'En memoria' },
  memory: { en: 'Memory', fr: 'Mémoire', de: 'Speicher', es: 'Memoria' },
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  noneLoaded: {
    en: 'No model in memory',
    fr: 'Aucun modèle en mémoire',
    de: 'Kein Modell im Speicher',
    es: 'Ningún modelo en memoria',
  },
  kept: { en: 'kept', fr: 'gardé', de: 'gehalten', es: 'retenido' },
  loadDefault: {
    en: 'Load model',
    fr: 'Charger le modèle',
    de: 'Modell laden',
    es: 'Cargar modelo',
  },
  unloadAll: {
    en: 'Free memory',
    fr: 'Libérer la mémoire',
    de: 'Speicher freigeben',
    es: 'Liberar memoria',
  },
};

// Toasts after a tap (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    loaded: (model) => `${model} is loaded.`,
    unloaded: (count) => (count ? `${count} model(s) unloaded.` : 'No model was in memory.'),
  },
  fr: {
    loaded: (model) => `${model} est chargé.`,
    unloaded: (count) =>
      count ? `${count} modèle(s) déchargé(s).` : "Aucun modèle n'était en mémoire.",
  },
  de: {
    loaded: (model) => `${model} ist geladen.`,
    unloaded: (count) => (count ? `${count} Modell(e) entladen.` : 'Kein Modell war im Speicher.'),
  },
  es: {
    loaded: (model) => `${model} está cargado.`,
    unloaded: (count) =>
      count ? `${count} modelo(s) descargado(s).` : 'Ningún modelo estaba en memoria.',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** "1.2 GB" or "850 MB". */
export function formatSize(megabytes) {
  return megabytes >= 1000 ? `${(megabytes / 1024).toFixed(1)} GB` : `${megabytes} MB`;
}

function serverRow(state, language) {
  if (state.error && (state.down || state.online === null || !state.version)) {
    const unreachable = [ERROR_KINDS.UNREACHABLE, ERROR_KINDS.TIMEOUT].includes(state.error.kind);
    return {
      label: 'Ollama',
      icon: 'alert-triangle',
      value: t(unreachable ? TEXT.unreachable : TEXT.error, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (state.online) {
    return {
      label: 'Ollama',
      icon: 'cpu',
      value: fit(`${t(TEXT.online, language)} · ${state.version}`, 40),
      color: state.error ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    };
  }
  return {
    label: 'Ollama',
    icon: 'clock',
    value: t(TEXT.waiting, language),
    color: WIDGET_COLORS.NEUTRAL,
  };
}

function modelRow(model, now, language) {
  const parts = [formatSize(Math.round(model.size / (1024 * 1024)))];
  const expires = model.expiresAt ? Date.parse(model.expiresAt) : NaN;
  // Far in the future: kept until unloaded (keep_alive -1).
  if (Number.isFinite(expires) && expires > now && expires - now < 365 * 24 * 3600_000) {
    const minutes = Math.ceil((expires - now) / 60_000);
    parts.push(minutes >= 120 ? `${Math.round(minutes / 60)} h` : `${minutes} min`);
  } else if (Number.isFinite(expires) && expires > now) {
    parts.push(t(TEXT.kept, language));
  }
  return {
    label: fit(model.name, 40),
    icon: 'database',
    value: parts.join(' · '),
    color: WIDGET_COLORS.PRIMARY,
  };
}

/** The model the "Load model" button loads, null when there is none to offer. */
function defaultModel(hub) {
  try {
    return hub.modelOf('');
  } catch {
    return null;
  }
}

async function get(hub, { language = 'en' } = {}) {
  if (!hub.client) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: t(TEXT.noUrl, language) }],
    };
  }
  const { state } = hub;
  const components = [];
  if (state.models && state.loaded) {
    components.push(
      {
        type: 'value',
        value: state.models.length,
        label: t(TEXT.installed, language),
        icon: 'package',
      },
      {
        type: 'value',
        value: state.loaded.length,
        label: t(TEXT.loaded, language),
        icon: 'layers',
        color: WIDGET_COLORS.PRIMARY,
      },
      {
        type: 'value',
        value: Math.round((memoryMb(state.loaded) / 1024) * 10) / 10,
        unit: 'GB',
        label: t(TEXT.memory, language),
        icon: 'hard-drive',
      },
    );
  }
  const items = [serverRow(state, language)];
  if (state.loaded && !state.down) {
    const now = hub.now();
    items.push(...state.loaded.slice(0, MAX_MODEL_ROWS).map((m) => modelRow(m, now, language)));
    if (state.loaded.length === 0) {
      items.push({
        label: t(TEXT.noneLoaded, language),
        icon: 'moon',
        value: '—',
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
  }
  components.push({ type: 'status', items });
  if (state.online && !state.down) {
    const model = defaultModel(hub);
    if (model) {
      components.push({
        type: 'button',
        label: t(TEXT.loadDefault, language),
        // Already in memory: the check mark says so (never the style:
        // `primary` is invisible in dark mode).
        icon: state.loaded?.some((m) => m.name === model || m.name === `${model}:latest`)
          ? 'check-circle'
          : 'play',
        style: 'secondary',
        action: { key: ACTIONS.LOAD },
      });
    }
    components.push({
      type: 'button',
      label: t(TEXT.unloadAll, language),
      icon: 'power',
      style: 'secondary',
      action: { key: ACTIONS.UNLOAD },
    });
  }
  return { ttl_seconds: 60, components };
}

async function action(hub, { actionKey }) {
  const done = (render) =>
    Object.fromEntries(Object.entries(DONE_TEXT).map(([lang, text]) => [lang, render(text)]));
  if (actionKey === ACTIONS.LOAD) {
    const model = await hub.load('');
    return { message: done((text) => fit(text.loaded(model), 200)) };
  }
  if (actionKey === ACTIONS.UNLOAD) {
    const count = await hub.unload('');
    return { message: done((text) => text.unloaded(count)) };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};

// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors. Four languages, the four of the Gladys interface; German says "du",
// Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './ollama/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Ollama server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Ollama dans la configuration.",
    de: 'Gib die Adresse deines Ollama-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Ollama en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.20:11434',
    fr: 'Adresse incomprise, ex. http://192.168.1.20:11434',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.20:11434',
    es: 'Dirección no válida, p. ej. http://192.168.1.20:11434',
  },
};

// One short explanation per error kind (src/ollama/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Ollama does not answer: check the address, and OLLAMA_HOST=0.0.0.0 on the server',
    fr: "Ollama ne répond pas : vérifiez l'adresse, et OLLAMA_HOST=0.0.0.0 sur le serveur",
    de: 'Ollama antwortet nicht: Prüfe die Adresse und OLLAMA_HOST=0.0.0.0 auf dem Server',
    es: 'Ollama no responde: compruebe la dirección y OLLAMA_HOST=0.0.0.0 en el servidor',
  },
  [ERROR_KINDS.TIMEOUT]: {
    en: 'Ollama took too long to answer',
    fr: 'Ollama a mis trop de temps à répondre',
    de: 'Ollama hat zu lange für die Antwort gebraucht',
    es: 'Ollama ha tardado demasiado en responder',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'access refused: check the API key',
    fr: "accès refusé : vérifiez la clé d'API",
    de: 'Zugriff verweigert: Prüfe den API-Schlüssel',
    es: 'acceso denegado: compruebe la clave de API',
  },
  [ERROR_KINDS.NOT_OLLAMA]: {
    en: 'no Ollama server at this address',
    fr: 'aucun serveur Ollama à cette adresse',
    de: 'kein Ollama-Server unter dieser Adresse',
    es: 'no hay ningún servidor Ollama en esta dirección',
  },
  [ERROR_KINDS.MODEL_NOT_FOUND]: {
    en: 'model not installed: run "ollama pull" with its name on the server',
    fr: 'modèle non installé : lancez « ollama pull » avec son nom sur le serveur',
    de: 'Modell nicht installiert: Führe „ollama pull“ mit seinem Namen auf dem Server aus',
    es: 'modelo no instalado: ejecute «ollama pull» con su nombre en el servidor',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Ollama refused the request, see the logs',
    fr: 'Ollama a refusé la requête, voir les logs',
    de: 'Ollama hat die Anfrage abgelehnt, sieh in den Protokollen nach',
    es: 'Ollama ha rechazado la solicitud, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version) => `Ollama ${version} answers.`,
    installed: (count) => `${count} model(s) installed`,
    loaded: (count) => `${count} in memory`,
    none: 'No model installed: run "ollama pull" on the server.',
  },
  fr: {
    ok: (version) => `Ollama ${version} répond.`,
    installed: (count) => `${count} modèle(s) installé(s)`,
    loaded: (count) => `${count} en mémoire`,
    none: 'Aucun modèle installé : lancez « ollama pull » sur le serveur.',
  },
  de: {
    ok: (version) => `Ollama ${version} antwortet.`,
    installed: (count) => `${count} Modell(e) installiert`,
    loaded: (count) => `${count} im Speicher`,
    none: 'Kein Modell installiert: Führe „ollama pull“ auf dem Server aus.',
  },
  es: {
    ok: (version) => `Ollama ${version} responde.`,
    installed: (count) => `${count} modelo(s) instalado(s)`,
    loaded: (count) => `${count} en memoria`,
    none: 'Ningún modelo instalado: ejecute «ollama pull» en el servidor.',
  },
};

// Errors of the scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  noModel: {
    en: 'Which model? Type its name in the action, or a default model in the configuration.',
    fr: "Quel modèle ? Saisissez son nom dans l'action, ou un modèle par défaut dans la configuration.",
    de: 'Welches Modell? Gib seinen Namen in der Aktion ein oder ein Standardmodell in der Konfiguration.',
    es: '¿Qué modelo? Escriba su nombre en la acción o un modelo predeterminado en la configuración.',
  },
  noPrompt: {
    en: 'The question is empty.',
    fr: 'La question est vide.',
    de: 'Die Frage ist leer.',
    es: 'La pregunta está vacía.',
  },
  emptyAnswer: {
    en: 'Ollama returned an empty answer.',
    fr: 'Ollama a renvoyé une réponse vide.',
    de: 'Ollama hat eine leere Antwort geliefert.',
    es: 'Ollama ha devuelto una respuesta vacía.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

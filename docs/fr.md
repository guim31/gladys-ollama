# Ollama

[Ollama](https://ollama.com) fait tourner des modèles de langage (Llama, Mistral, Qwen,
Gemma…) sur votre propre machine. Cette intégration permet à vos scènes Gladys de leur poser
des questions, avec les informations de la scène dans la question, et d'utiliser la réponse dans
les actions suivantes : l'envoyer par message, la faire lire à voix haute, la tester dans une
condition. Tout reste sur votre réseau : pas de compte, pas de cloud.

Elle suit aussi le serveur : en ligne ou non, modèles installés, modèles en mémoire et mémoire
occupée, avec un widget de tableau de bord et deux déclencheurs de scène.

Gladys a déjà un assistant IA via Gladys Plus (OpenAI). Cette intégration en est l'équivalent
local : gratuit, privé, et aussi rapide que votre matériel.

## Ce qu'il faut

- Gladys 5.1 ou plus récent.
- Un serveur Ollama sur votre réseau, avec au moins un modèle (`ollama pull llama3.2`, par
  exemple). Un petit modèle (1 à 3 milliards de paramètres) répond en quelques secondes sur un
  processeur récent ; une carte graphique rend utilisables les modèles plus gros.
- Si Ollama tourne sur une autre machine que Gladys, il doit accepter le réseau : lancez-le avec
  `OLLAMA_HOST=0.0.0.0` (voir la
  [FAQ d'Ollama](https://docs.ollama.com/faq#how-do-i-configure-ollama-server)). Ollama n'a pas
  de mot de passe : gardez le port 11434 à l'intérieur de votre réseau.

## Mise en place

1. Dans Gladys, ouvrez **Intégrations**, cherchez **Ollama** et installez-la.
2. Dans **Configuration**, renseignez :
   - **Adresse** : l'adresse IP ou le nom du serveur, ex. `192.168.1.20` (le port 11434 est
     ajouté), `192.168.1.20:8080`, ou l'URL complète d'un proxy inverse
     (`https://ai.example.org`) ;
   - **Clé d'API (facultative)** : seulement pour un proxy inverse qui demande un jeton Bearer ;
   - **Modèle par défaut** : le modèle utilisé quand une action de scène n'en nomme aucun, ex.
     `llama3.2` ;
   - **Attente maximale d'une réponse** : de 30 à 110 secondes (60 par défaut) ;
   - **Garder le modèle en mémoire** : combien de temps Ollama garde le modèle après une
     question ou un chargement. Plus long : réponses plus rapides, mais la mémoire reste prise ;
   - **Intervalle de rafraîchissement** : fréquence de lecture de l'état du serveur (une minute
     par défaut) ;
   - **Langue des noms de fonctionnalités** : les noms donnés aux fonctionnalités et les textes
     des événements de scène et des erreurs.
3. Enregistrez, puis appuyez sur **Tester la connexion** : elle affiche la version d'Ollama et
   les modèles installés, avec leur nom exact.
4. Dans l'onglet **Découverte**, ajoutez l'appareil **Ollama** à Gladys.

## L'appareil Ollama

| Fonctionnalité       | Signification                                                      |
| -------------------- | ------------------------------------------------------------------ |
| `En ligne`           | 1 quand le serveur répond, 0 après deux lectures en échec de suite |
| `Modèles installés`  | nombre de modèles sur le serveur                                   |
| `Modèles en mémoire` | nombre de modèles chargés, prêts à répondre                        |
| `Mémoire utilisée`   | mémoire occupée par les modèles chargés, en mégaoctets             |

## Tableau de bord

Le widget **Ollama** affiche le serveur (en ligne, version), le nombre de modèles installés, les
modèles en mémoire avec leur taille et les minutes avant qu'Ollama ne les décharge, et la
mémoire utilisée. Deux boutons :

- **Charger le modèle** : met le modèle par défaut en mémoire, pour que la question suivante
  soit rapide (une coche quand il l'est déjà) ;
- **Libérer la mémoire** : décharge tous les modèles en mémoire.

## Scènes

### Déclencheurs

- **Ollama est hors ligne** : le serveur ne répond plus (deux lectures en échec de suite, à
  15 secondes d'écart). Variable : la raison.
- **Ollama est de retour** : le serveur répond de nouveau. Variable : la durée de la panne, en
  minutes.

### Actions

- **Demander à Ollama** : pose une question à un modèle.
  - **Question** : tapez `{{` pour insérer des informations de la scène, ex. la température
    d'un capteur ou une valeur du déclencheur ;
  - **Modèle** : vide pour le modèle par défaut ;
  - **Consigne** : comment le modèle doit répondre, ex. « Réponds en une phrase courte, en
    français. » ;
  - **Créativité** : le réglage du modèle, ou de précise (0) à très créative (1,2) ;
  - **Réponse la plus longue** : en caractères (1000 par défaut, 10 000 au plus). Une réponse
    plus longue est coupée à la fin d'une phrase (ou d'un mot), marquée par `…`.

  Ses résultats sont disponibles pour les actions suivantes : **Réponse**, **Modèle utilisé**,
  **Temps de réponse** (secondes) et **Réponse coupée** (oui/non). Dans une action **Envoyer un
  message**, tapez `{{` et choisissez **Réponse**. Quand la question échoue (serveur hors ligne,
  modèle non installé, trop long), la réponse est vide et la scène continue.

- **Charger un modèle Ollama** : met un modèle en mémoire à l'avance (vide : le modèle par
  défaut). Résultat : le modèle chargé.
- **Décharger un modèle Ollama** : libère la mémoire d'un modèle (vide : tous les modèles en
  mémoire). Résultat : le nombre de modèles déchargés.

### Idées de scènes

- **Briefing du matin** : à 7 h, **Demander à Ollama** « En deux phrases chaleureuses, résume
  la journée : température extérieure `{{…}}`, météo `{{…}}`. », puis envoyez la **Réponse**
  sur votre téléphone.
- **Alerte lisible** : quand la prise du lave-linge passe sous 5 W, demandez « Écris un message
  court et drôle pour dire que la lessive est finie. » et utilisez **Parler sur une enceinte**
  avec la **Réponse**.
- **Libérer la mémoire la nuit** : à 1 h, **Décharger un modèle Ollama** avec un modèle vide,
  pour que le serveur soit libre pour ses autres tâches.
- **Surveiller le serveur** : sur **Ollama est hors ligne**, envoyez-vous un message avec la
  raison.

## Dépannage

- **« Ollama ne répond pas »** : vérifiez l'adresse et le port (11434), que le serveur est
  démarré et qu'il écoute sur le réseau (`OLLAMA_HOST=0.0.0.0`). Avec Docker, le port doit être
  publié.
- **« modèle non installé »** : le nom doit être exactement celui listé par **Tester la
  connexion** (`ollama list` sur le serveur). Installez-le avec `ollama pull <nom>`.
- **« Ollama a mis trop de temps à répondre »** : la première question après un moment charge
  le modèle depuis le disque. Utilisez **Charger un modèle Ollama** à l'avance, gardez le modèle
  plus longtemps en mémoire, augmentez l'attente maximale, ou choisissez un modèle plus petit.
- **« accès refusé »** : le proxy inverse a refusé la clé d'API.
- Problèmes et idées : [tickets GitHub](https://github.com/guim31/gladys-ollama/issues).

## Limites

- Une question, une réponse : l'action ne garde aucun historique de conversation entre deux
  exécutions.
- Texte seulement : pas d'image dans la question, pas d'appel d'outils.
- Gladys attend une action deux minutes au plus : un très gros modèle sur un simple processeur
  peut ne pas tenir. La réponse est limitée à 10 000 caractères.
- Les modèles à raisonnement (DeepSeek-R1, Qwen3…) sont priés de répondre sans leur
  raisonnement ; s'il en reste, il est retiré de la réponse.
- Les questions et les réponses ne vont jamais dans les logs de l'intégration.
- Testée contre un vrai serveur Ollama 0.40 avec de petits modèles (qwen2.5 0.5B, SmolLM2 135M).
- Sans lien avec Ollama.

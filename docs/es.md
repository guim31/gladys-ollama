# Ollama

[Ollama](https://ollama.com) ejecuta modelos de lenguaje (Llama, Mistral, Qwen, Gemma…) en su
propia máquina. Esta integración permite que sus escenas de Gladys les hagan preguntas, con la
información de la escena en la pregunta, y usen la respuesta en las acciones siguientes:
enviarla por mensaje, leerla en voz alta, comprobarla en una condición. Todo se queda en su red:
sin cuenta, sin nube.

También sigue el servidor: en línea o no, modelos instalados, modelos en memoria y memoria
ocupada, con un widget del panel y dos desencadenantes de escena.

Gladys ya tiene un asistente de IA con Gladys Plus (OpenAI). Esta integración es su equivalente
local: gratuito, privado y tan rápido como su equipo.

## Requisitos

- Gladys 5.1 o posterior.
- Un servidor Ollama en su red, con al menos un modelo (`ollama pull llama3.2`, por ejemplo).
  Un modelo pequeño (de 1 a 3 mil millones de parámetros) responde en pocos segundos en un
  procesador reciente; una tarjeta gráfica hace utilizables los modelos más grandes.
- Si Ollama se ejecuta en otra máquina que Gladys, debe aceptar la red: inícielo con
  `OLLAMA_HOST=0.0.0.0` (consulte las
  [preguntas frecuentes de Ollama](https://docs.ollama.com/faq#how-do-i-configure-ollama-server)).
  Ollama no tiene contraseña: mantenga el puerto 11434 dentro de su red.

## Configuración

1. En Gladys, abra **Integraciones**, busque **Ollama** e instálela.
2. En **Configuración**, rellene:
   - **Dirección**: la dirección IP o el nombre del servidor, p. ej. `192.168.1.20` (se añade
     el puerto 11434), `192.168.1.20:8080`, o la URL completa de un proxy inverso
     (`https://ai.example.org`);
   - **Clave de API (opcional)**: solo para un proxy inverso que pida un token Bearer;
   - **Modelo predeterminado**: el modelo que se usa cuando una acción de escena no indica
     ninguno, p. ej. `llama3.2`;
   - **Espera máxima de una respuesta**: de 30 a 110 segundos (60 por defecto);
   - **Mantener el modelo en memoria**: cuánto tiempo guarda Ollama el modelo tras una pregunta
     o una carga. Más tiempo: respuestas más rápidas, pero la memoria sigue ocupada;
   - **Intervalo de actualización**: con qué frecuencia se lee el estado del servidor (un minuto
     por defecto);
   - **Idioma de los nombres de funciones**: los nombres de las funciones y los textos de los
     eventos de escena y de los errores.
3. Guarde y pulse **Probar la conexión**: muestra la versión de Ollama y los modelos instalados,
   con su nombre exacto.
4. En la pestaña **Descubrimiento**, añada el dispositivo **Ollama** a Gladys.

## El dispositivo Ollama

| Función              | Significado                                                          |
| -------------------- | -------------------------------------------------------------------- |
| `En línea`           | 1 cuando el servidor responde, 0 tras dos lecturas fallidas seguidas |
| `Modelos instalados` | número de modelos en el servidor                                     |
| `Modelos en memoria` | número de modelos cargados, listos para responder                    |
| `Memoria usada`      | memoria ocupada por los modelos cargados, en megabytes               |

## Panel

El widget **Ollama** muestra el servidor (en línea, versión), el número de modelos instalados,
los modelos en memoria con su tamaño y los minutos antes de que Ollama los descargue, y la
memoria usada. Dos botones:

- **Cargar modelo**: carga el modelo predeterminado en memoria, para que la siguiente pregunta
  sea rápida (una marca de verificación cuando ya lo está);
- **Liberar memoria**: descarga todos los modelos en memoria.

## Escenas

### Desencadenantes

- **Ollama está fuera de línea**: el servidor deja de responder (dos lecturas fallidas seguidas,
  con 15 segundos de diferencia). Variable: el motivo.
- **Ollama vuelve a estar en línea**: el servidor responde de nuevo. Variable: la duración de la
  caída, en minutos.

### Acciones

- **Preguntar a Ollama**: hace una pregunta a un modelo.
  - **Pregunta**: escriba `{{` para insertar información de la escena, p. ej. la temperatura de
    un sensor o un valor del desencadenante;
  - **Modelo**: vacío para el modelo predeterminado;
  - **Instrucciones**: cómo debe responder el modelo, p. ej. «Responde en una frase corta, en
    español.»;
  - **Creatividad**: el ajuste del modelo, o de precisa (0) a muy creativa (1,2);
  - **Respuesta más larga**: en caracteres (1000 por defecto, 10 000 como máximo). Una respuesta
    más larga se corta al final de una frase (o de una palabra), marcada con `…`.

  Sus resultados están disponibles para las acciones siguientes: **Respuesta**, **Modelo
  usado**, **Tiempo de respuesta** (segundos) y **Respuesta cortada** (sí/no). En una acción
  **Enviar mensaje**, escriba `{{` y elija **Respuesta**. Cuando la pregunta falla (servidor
  fuera de línea, modelo no instalado, demasiado largo), la respuesta está vacía y la escena
  continúa.

- **Cargar un modelo de Ollama**: carga un modelo en memoria por adelantado (vacío: el modelo
  predeterminado). Resultado: el modelo cargado.
- **Descargar un modelo de Ollama**: libera la memoria de un modelo (vacío: todos los modelos en
  memoria). Resultado: el número de modelos descargados.

### Ideas de escenas

- **Resumen matinal**: a las 7:00, **Preguntar a Ollama** «En dos frases amables, resume el día:
  temperatura exterior `{{…}}`, tiempo `{{…}}`.» y envíe la **Respuesta** a su teléfono.
- **Alerta legible**: cuando el enchufe de la lavadora baje de 5 W, pregunte «Escribe un mensaje
  corto y divertido para decir que la colada ha terminado.» y use **Hablar en un altavoz** con la
  **Respuesta**.
- **Liberar la memoria por la noche**: a la 1:00, **Descargar un modelo de Ollama** con el modelo
  vacío, para que el servidor quede libre para sus otras tareas.
- **Vigilar el servidor**: con **Ollama está fuera de línea**, envíese un mensaje con el motivo.

## Solución de problemas

- **«Ollama no responde»**: compruebe la dirección y el puerto (11434), que el servidor está en
  marcha y que escucha en la red (`OLLAMA_HOST=0.0.0.0`). Con Docker, el puerto debe estar
  publicado.
- **«modelo no instalado»**: el nombre debe ser exactamente el que lista **Probar la conexión**
  (`ollama list` en el servidor). Instálelo con `ollama pull <nombre>`.
- **«Ollama ha tardado demasiado en responder»**: la primera pregunta tras un rato carga el
  modelo desde el disco. Use antes **Cargar un modelo de Ollama**, mantenga el modelo más tiempo
  en memoria, aumente la espera máxima o elija un modelo más pequeño.
- **«acceso denegado»**: el proxy inverso ha rechazado la clave de API.
- Problemas e ideas: [issues de GitHub](https://github.com/guim31/gladys-ollama/issues).

## Limitaciones

- Una pregunta, una respuesta: la acción no guarda ningún historial de conversación entre dos
  ejecuciones.
- Solo texto: ninguna imagen en la pregunta, ninguna llamada a herramientas.
- Gladys espera una acción dos minutos como máximo: un modelo muy grande en un simple procesador
  puede no caber. La respuesta está limitada a 10 000 caracteres.
- A los modelos de razonamiento (DeepSeek-R1, Qwen3…) se les pide responder sin su
  razonamiento; si queda algo, se retira de la respuesta.
- Las preguntas y las respuestas nunca van a los registros de la integración.
- Probada con un servidor Ollama 0.40 real y modelos pequeños (qwen2.5 0.5B, SmolLM2 135M).
- Sin relación con Ollama.

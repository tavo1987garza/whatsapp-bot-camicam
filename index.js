// file: index.js
// Node >=18, ES Modules ("type": "module")

import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import NodeCache from 'node-cache';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import cors from 'cors';

dotenv.config();

/* =========================
   Config base
========================= */
const app = express();
const PORT = process.env.PORT || 3000;
const CRM_BASE_URL = process.env.CRM_BASE_URL || "https://camicam-crm-d78af2926170.herokuapp.com";
const ALLOWED_ORIGIN = (process.env.CORS_ORIGIN || "https://camicam-crm-d78af2926170.herokuapp.com")
  .split(",").map(s=>s.trim()).filter(Boolean);
const WABA_VERSION = process.env.WABA_VERSION || "v21.0";
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WABA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Cotizador
const COTIZADOR_URL = "https://cotizador-cami-cam-209c7f6faca2.herokuapp.com/";
const COTIZADOR_VIDEO_URL = process.env.COTIZADOR_VIDEO_URL || "https://filesamples.com/samples/video/mp4/sample_640x360.mp4";

const REQUIRED_ENVS = [
  'WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_ACCESS_TOKEN','VERIFY_TOKEN',
  'OPENAI_API_KEY','AWS_REGION','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','S3_BUCKET_NAME'
];
const missing = REQUIRED_ENVS.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Faltan envs:', missing.join(', '));
  process.exit(1);
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGIN.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origen no permitido'), false);
  },
}));
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));

/* =========================
   AWS S3
========================= */
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const s3 = new AWS.S3();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/* =========================
   OpenAI (fallback NLU/short)
========================= */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const responseCache = new NodeCache({ stdTTL: 3600 });

/* =========================
   Estado y utilidades
========================= */
const antiDuplicateCache = new NodeCache({ stdTTL: 120 });
const normalizeText = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const toHttps = (url) => (url?.startsWith('http://') ? url.replace(/^http:\/\//i, 'https://') : url);
const delay = (ms) => new Promise(r => setTimeout(r, ms));

const formatFechaEnEspanol = (fechaStrDDMMYYYY) => {
  const [dia, mes, anio] = fechaStrDDMMYYYY.split("/");
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${dia} de ${meses[Number(mes)-1]} ${anio}`;
};
const parseFecha = (dateString) => {
  const s = (dateString || "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\s*(?:de\s+)?([a-záéíóú]+)\s*(?:de\s+)?(\d{4})$/i);
  if (!m) return null;
  const day = m[1].padStart(2,"0");
  const monthMap = {
    enero:"01",febrero:"02",marzo:"03",abril:"04",mayo:"05",junio:"06",
    julio:"07",agosto:"08",septiembre:"09",setiembre:"09",octubre:"10",noviembre:"11",diciembre:"12"
  };
  const month = monthMap[normalizeText(m[2])];
  if (!month) return null;
  return `${day}/${month}/${m[3]}`;
};
const isValidDate = (ddmmyyyy) => {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(ddmmyyyy)) return false;
  const [d,m,y] = ddmmyyyy.split('/').map(Number);
  const dt = new Date(y, m-1, d);
  return dt.getFullYear()===y && (dt.getMonth()+1)===m && dt.getDate()===d;
};
const isValidDateExtended = (s) => {
  const f = parseFecha(s);
  return !!(f && isValidDate(f));
};
const isValidFutureDate = (s) => {
  const f = parseFecha(s);
  if (!f || !isValidDate(f)) return false;
  const [d,m,y] = f.split('/').map(Number);
  const inDate = new Date(y, m-1, d);
  const today = new Date(); today.setHours(0,0,0,0);
  return inDate >= today;
};
const isWithinTwoYears = (s) => {
  const f = parseFecha(s);
  if (!f || !isValidDate(f)) return false;
  const [d,m,y] = f.split('/').map(Number);
  const inDate = new Date(y, m-1, d);
  const today = new Date(); today.setHours(0,0,0,0);
  const max = new Date(today); max.setFullYear(max.getFullYear()+2);
  return inDate <= max;
};
const toISO = (ddmmyyyy) => {
  const [d,m,y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
};

const shouldSkipDuplicateSend = (to, payloadKey) => {
  const key = `${to}::${payloadKey}`.slice(0, 512);
  if (antiDuplicateCache.get(key)) return true;
  antiDuplicateCache.set(key, true);
  return false;
};

/* =========================
   CRM helpers
========================= */
async function getContext(from) {
  try {
    const { data } = await axios.get(`${CRM_BASE_URL}/leads/context`, {
      params: { telefono: from }, timeout: 5000
    });
    return data?.context || null;
  } catch (e) {
    console.error("Error getting context:", e.message);
    return null;
  }
}
async function saveContext(from, context) {
  try {
    await axios.post(`${CRM_BASE_URL}/leads/context`, {
      telefono: from,
      context: { ...context, lastActivity: new Date().toISOString() }
    }, { timeout: 5000 });
  } catch (e) {
    console.error("Error saving context:", e.message);
  }
}
async function reportMessageToCRM(to, message, tipo = "enviado") {
  try {
    await axios.post(`${CRM_BASE_URL}/recibir_mensaje`, {
      plataforma: "WhatsApp", remitente: to, mensaje: message, tipo
    }, { timeout: 7000 });
  } catch (e) {
    console.error("CRM report error:", e.response?.data || e.message);
  }
}
async function reportEventToCRM(to, eventName, meta = {}) {
  const payload = `EVENT:${eventName}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}`;
  await reportMessageToCRM(to, payload, "enviado");
}
async function checkAvailability(dateYYYYMMDD) {
  try {
    const { data } = await axios.get(`${CRM_BASE_URL}/calendario/check`, {
      params: { fecha: dateYYYYMMDD }, timeout: 7000
    });
    return !!data?.available;
  } catch (e) {
    console.error("CRM disponibilidad error:", e.message);
    return false;
  }
}

/* =========================
   WhatsApp API helpers
========================= */
const WABA_URL = `https://graph.facebook.com/${WABA_VERSION}/${PHONE_ID}/messages`;
const WABA_HEADERS = { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' };
const wabaReady = () => Boolean(PHONE_ID && WABA_TOKEN);

async function sendWhatsAppMessage(to, text) {
  try {
    if (!wabaReady() || !text) return;
    if (shouldSkipDuplicateSend(to, `text:${text}`)) return;
    const { data } = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp', to, type: 'text', text: { body: text }
    }, { headers: WABA_HEADERS, timeout: 15000 });
    console.log("WA text ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, text, "enviado");
  } catch (e) {
    console.error("WA text error:", e.response?.data || e.message);
  }
}
async function sendImageMessage(to, imageUrl, caption = undefined) {
  try {
    if (!wabaReady()) return;
    const link = toHttps(imageUrl);
    if (!link) return;
    if (shouldSkipDuplicateSend(to, `image:${link}:${caption||''}`)) return;
    const { data } = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp', to, type: 'image',
      image: { link, ...(caption ? { caption } : {}) }
    }, { headers: WABA_HEADERS, timeout: 20000 });
    console.log("WA image ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, link, "enviado_imagen");
  } catch (e) {
    console.error("WA image error:", e.response?.data || e.message);
  }
}
async function sendWhatsAppVideo(to, videoUrl, caption = undefined) {
  try {
    if (!wabaReady()) return;
    const link = toHttps(videoUrl);
    if (!link) return;
    if (shouldSkipDuplicateSend(to, `video:${link}:${caption||''}`)) return;
    const { data } = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp', to, type: 'video',
      video: { link, ...(caption ? { caption } : {}) }
    }, { headers: WABA_HEADERS, timeout: 30000 });
    console.log("WA video ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, link, "enviado_video");
  } catch (e) {
    console.error("WA video error:", e.response?.data || e.message);
  }
}
async function sendInteractiveMessage(to, body, buttons) {
  try {
    if (!wabaReady()) return;
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      recipient_type: 'individual',
      interactive: {
        type: 'button',
        body: { text: body },
        action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) }
      }
    };
    if (shouldSkipDuplicateSend(to, `interactive:${body}:${JSON.stringify(buttons)}`)) return;
    const { data } = await axios.post(WABA_URL, payload, { headers: WABA_HEADERS, timeout: 20000 });
    console.log("WA interactive ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, `${body}\n\n${buttons.map(b=>`• ${b.title}`).join("\n")}`, "enviado");
  } catch (e) {
    console.error("WA interactive error:", e.response?.data || e.message);
  }
}
async function activateTypingIndicator() { /* no-op */ }
async function deactivateTypingIndicator() { /* no-op */ }
async function sendMessageWithTypingWithState(from, message, delayMs, expectedStateSnapshot) {
  await activateTypingIndicator(from);
  await delay(delayMs);
  const ctx = await getContext(from); // por qué: respetar estado persistido
  if ((ctx?.estado || null) === expectedStateSnapshot) {
    await sendWhatsAppMessage(from, message);
  }
  await deactivateTypingIndicator(from);
}

/* =========================
   FAQs puntuales (para intenciones)
========================= */
const AGB_IMAGE = "https://cami-cam.com/wp-content/uploads/2023/07/audio1.jpg";

/* =========================
   Contexto (persistente en CRM)
========================= */
async function ensureContext(from) {
  let context = await getContext(from);
  if (!context) {
    context = {
      estado: "Contacto Inicial",
      tipoEvento: null,
      paqueteRecomendado: null,
      fecha: null,
      fechaISO: null,
      lugar: null,
      serviciosSeleccionados: "",
      mediosEnviados: [],
      upsellSuggested: false,
      lastActivity: new Date().toISOString()
    };
    await saveContext(from, context);
  }
  return context;
}

/* =========================
   Detección de intención (regex + LLM fallback)
========================= */
const INTENTS = {
  GREETING: 'greeting',
  PRICE: 'price',
  DATE: 'date',
  HOURS: 'hours',
  WHAT_IS_AGB: 'what_is_agb',
  WHAT_IS: 'what_is',
  OKAY: 'okay',
  HELP: 'help',
  BUTTON_COTIZADOR: 'button_cotizador',
  BUTTON_CONF_PAXV: 'button_confirm_paquete_xv',
  UNKNOWN: 'unknown',
};

function detectIntentRegex(text) {
  const t = normalizeText(text);
  if (/^(hola|buen[oa]s|holi|hey|que onda)\b/.test(t)) return INTENTS.GREETING;
  if (/\b(precio|cuan?to(?:s)? vale|cuan?to(?:s)? cuesta|tarifa|costo)s?\b/.test(t)) return INTENTS.PRICE;
  if (/(^|\s)(ok|okay|va|sale|entendido|perfecto)(\s|$)/.test(t)) return INTENTS.OKAY;
  if (/\b(ayuda|no se|no entiendo|como funciona|instrucciones)\b/.test(t)) return INTENTS.HELP;
  if (/\b(hora|horas|duraci[oó]n|cu[aá]ntas horas)\b/.test(t)) return INTENTS.HOURS;
  if (/\b(audio\s*guest\s*book|ag[bc]\b|libreta de audio|tel[eé]fono de mensajes)\b/.test(t)) return INTENTS.WHAT_IS_AGB;
  if (/que es|que incluye|como es|como funciona/.test(t)) return INTENTS.WHAT_IS;
  if (/cotizador|personalizar|coti(z|s)ador web|\bweb\b/.test(t)) return INTENTS.BUTTON_COTIZADOR;
  if (/^paquete mis xv$|^paquete de xv$|^mis xv$/.test(t)) return INTENTS.BUTTON_CONF_PAXV;
  // Fecha “similar” (captura 20/05/2026 o 20 de mayo 2026)
  if (isValidDateExtended(text)) return INTENTS.DATE;
  return INTENTS.UNKNOWN;
}

async function detectIntent(text) {
  const viaRegex = detectIntentRegex(text);
  if (viaRegex !== INTENTS.UNKNOWN) return viaRegex;

  // Fallback LLM barato (opcional, robustez para frases raras)
  try {
    const prompt = `Clasifica la intención del usuario para un bot de eventos.
Texto: "${text}"
Clases: greeting, price, date, hours, what_is_agb, what_is, okay, help, button_cotizador, button_confirm_paquete_xv, unknown
Responde SOLO una clase.`;
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0, max_tokens: 5
    });
    const label = normalizeText(resp.choices?.[0]?.message?.content || "unknown");
    const map = {
      'greeting': INTENTS.GREETING, 'price': INTENTS.PRICE, 'date': INTENTS.DATE, 'hours': INTENTS.HOURS,
      'what_is_agb': INTENTS.WHAT_IS_AGB, 'what_is': INTENTS.WHAT_IS, 'okay': INTENTS.OKAY,
      'help': INTENTS.HELP, 'button_cotizador': INTENTS.BUTTON_COTIZADOR,
      'button_confirm_paquete_xv': INTENTS.BUTTON_CONF_PAXV, 'unknown': INTENTS.UNKNOWN
    };
    return map[label] || INTENTS.UNKNOWN;
  } catch {
    return INTENTS.UNKNOWN;
  }
}

/* =========================
   Flujos y helpers
========================= */
async function solicitarFecha(from, context) {
  await sendMessageWithTypingWithState(
    from,
    "Indícame la fecha de tu evento.\n\nFormato: DD/MM/AAAA o '20 de marzo 2026' 📆",
    400,
    context.estado
  );
  context.estado = "EsperandoFecha";
  await saveContext(from, context);
}

async function solicitarLugar(from, context) {
  await sendMessageWithTypingWithState(
    from,
    "Para continuar, necesito el nombre de tu salón o lugar del evento 🏢",
    400,
    context.estado
  );
}

async function handleLugar(from, userText, context) {
  context.lugar = userText;
  context.estado = "Finalizando";
  await saveContext(from, context);

  await sendMessageWithTypingWithState(from, "¡Excelente! Aquí tienes la información para separar tu fecha:", 200, "Finalizando");
  await delay(600);

  await sendMessageWithTypingWithState(from, "💰 *ANTICIPO:* $500 MXN", 200, "Finalizando");
  await sendMessageWithTypingWithState(from, "El resto se paga el día del evento.", 200, "Finalizando");
  await delay(600);

  await sendImageMessage(from, "https://cami-cam.com/wp-content/uploads/2025/03/Datos-Transferencia-1.jpeg", "Datos para transferencia: 722969010494399671");
  await delay(600);

  await sendMessageWithTypingWithState(from, "Después de tu depósito:", 200, "Finalizando");
  await sendMessageWithTypingWithState(from, "1. Te pido tus datos completos", 200, "Finalizando");
  await sendMessageWithTypingWithState(from, "2. Llenamos el contrato", 200, "Finalizando");
  await sendMessageWithTypingWithState(from, "3. Te envío foto del contrato firmado", 200, "Finalizando");
  await delay(600);

  await sendMessageWithTypingWithState(from, "❓ *Preguntas frecuentes:*", 200, "Finalizando");
  await sendMessageWithTypingWithState(from, "https://cami-cam.com/preguntas-frecuentes/", 200, "Finalizando");
  await delay(400);

  await sendMessageWithTypingWithState(from, "Cualquier duda, con toda confianza.\n\nSoy Gustavo González, a tus órdenes 😀", 200, "Finalizando");

  context.estado = "Finalizado";
  await saveContext(from, context);
}

async function flujoXVDespuesDeFechaOK(from, context, pretty) {
  await sendMessageWithTypingWithState(from, `¡Perfecto!\n\n*${pretty}* DISPONIBLE 👏👏👏`, 200, context.estado);
  await delay(800);

  await sendMessageWithTypingWithState(from, "El paquete que estamos promocionando es:", 200, context.estado);
  await delay(400);

  await sendImageMessage(from, "https://cami-cam.com/wp-content/uploads/2025/04/Paq-Mis-XV-Inform.jpg");
  await delay(800);

  await sendMessageWithTypingWithState(from, "🎁 *PROMOCIÓN EXCLUSIVA:* Al contratar este paquete te llevas sin costo el servicio de *'Audio Guest Book'*", 200, context.estado);
  await delay(800);

  await sendImageMessage(from, AGB_IMAGE, "Audio Guest Book - Incluido gratis en tu paquete");
  await delay(600);

  await sendInteractiveMessage(from, "¿Te interesa este *PAQUETE MIS XV* o prefieres armar un paquete a tu gusto?", [
    { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
    { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" }
  ]);

  context.estado = "EsperandoDecisionPaquete";
  await saveContext(from, context);
}

async function handleConfirmarPaqueteXV(from, context) {
  context.serviciosSeleccionados = "PAQUETE MIS XV";
  context.estado = "EsperandoLugar";
  await saveContext(from, context);
  await solicitarLugar(from, context);
}

async function handleCotizadorPersonalizado(from, context) {
  context.estado = "EnviandoACotizador";
  await saveContext(from, context);

  await reportEventToCRM(from, 'cotizador_web_click', { origin: context.tipoEvento || 'desconocido' });

  await sendMessageWithTypingWithState(from, "¡Perfecto! Te explico cómo usar nuestro cotizador online:", 200, "EnviandoACotizador");
  await delay(800);

  await sendWhatsAppVideo(from, COTIZADOR_VIDEO_URL, "Video explicativo del cotizador");
  await delay(1200);

  await sendMessageWithTypingWithState(from, "🎛️ *COTIZADOR ONLINE*\nSelecciona servicios, ve precios en tiempo real y arma tu paquete.", 200, "EnviandoACotizador");
  await delay(600);

  await sendMessageWithTypingWithState(from, `🌐 Accede aquí: ${COTIZADOR_URL}`, 200, "EnviandoACotizador");
  await delay(600);

  context.estado = "EsperandoLugar";
  await saveContext(from, context);
  await solicitarLugar(from, context);
}

/* =========================
   NLU → Respuestas por intención
========================= */
async function handleIntent(from, context, intent, rawText) {
  switch (intent) {
    case INTENTS.GREETING:
      await reportEventToCRM(from, 'intent_greeting');
      // Reorienta a lo pendiente
      if (context.estado === "EsperandoFecha") {
        await sendWhatsAppMessage(from, "¡Hola! 😊 Continuemos: envíame la *fecha de tu evento* (DD/MM/AAAA).");
      } else if (context.estado === "EsperandoLugar") {
        await sendWhatsAppMessage(from, "¡Hola! 😊 ¿Nombre del *salón o lugar* del evento?");
      } else {
        await sendWhatsAppMessage(from, "¡Hola! ¿En qué te ayudo? Puedo revisar fecha o enviarte el cotizador.");
      }
      return true;

    case INTENTS.OKAY:
      await reportEventToCRM(from, 'intent_ok');
      // Nudge corto sin cambiar estado
      if (context.estado === "EsperandoFecha") {
        await sendWhatsAppMessage(from, "Perfecto. Cuando gustes, envía la *fecha* (DD/MM/AAAA).");
      } else if (context.estado === "EsperandoDecisionPaquete") {
        await sendWhatsAppMessage(from, "¿Prefieres *PAQUETE MIS XV* o *COTIZADOR WEB*?");
      }
      return true;

    case INTENTS.PRICE:
      await reportEventToCRM(from, 'intent_price', { estado: context.estado, tipo: context.tipoEvento });
      await sendWhatsAppMessage(from, "Los *precios* los ves en tiempo real en nuestro *Cotizador Web*.");
      await sendMessageWithTypingWithState(from, `🌐 ${COTIZADOR_URL}`, 300, (await getContext(from))?.estado || context.estado);
      // Re-pregunta lo pendiente
      if (context.estado === "EsperandoFecha") {
        await sendWhatsAppMessage(from, "Antes revisemos *disponibilidad*: ¿qué fecha tienes? 📆");
      }
      return true;

    case INTENTS.HOURS:
      await reportEventToCRM(from, 'intent_hours', { tipo: context.tipoEvento });
      await sendWhatsAppMessage(from, "⏱️ Referencias: *Cabina* 3h, *Letras* 5h. Detalles completos en el *Cotizador Web* o al confirmar el paquete.");
      if (context.estado === "EsperandoFecha") {
        await sendWhatsAppMessage(from, "Envíame tu *fecha* para validar disponibilidad. 📆");
      }
      return true;

    case INTENTS.WHAT_IS_AGB:
      await reportEventToCRM(from, 'intent_what_is_agb');
      await sendWhatsAppMessage(from, "El *Audio Guest Book* es un teléfono donde tus invitados dejan mensajes de voz; te lo entregamos en archivo de audio.");
      await sendImageMessage(from, AGB_IMAGE, "Audio Guest Book");
      if (context.estado === "EsperandoFecha") {
        await sendWhatsAppMessage(from, "¿Me compartes la *fecha* del evento? 📆");
      } else if (context.estado === "EsperandoDecisionPaquete") {
        await sendInteractiveMessage(from, "¿Cómo seguimos?", [
          { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
          { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" }
        ]);
      }
      return true;

    case INTENTS.WHAT_IS:
      await reportEventToCRM(from, 'intent_what_is');
      await sendWhatsAppMessage(from, "¡Te explico! Dime qué servicio te interesa y te doy detalles. Si quieres precios y opciones, usa el *Cotizador Web*.");
      await sendMessageWithTypingWithState(from, `🌐 ${COTIZADOR_URL}`, 300, (await getContext(from))?.estado || context.estado);
      if (context.estado === "EsperandoFecha") {
        await sendWhatsAppMessage(from, "Mientras, ¿cuál es la *fecha* de tu evento? 📆");
      }
      return true;

    case INTENTS.BUTTON_COTIZADOR:
      await reportEventToCRM(from, 'intent_button_like_cotizador');
      await handleCotizadorPersonalizado(from, context);
      return true;

    case INTENTS.BUTTON_CONF_PAXV:
      await reportEventToCRM(from, 'intent_button_like_confirm_paquete_xv');
      await handleConfirmarPaqueteXV(from, context);
      return true;

    case INTENTS.DATE:
      // No interceptamos aquí; dejamos al manejador de fecha.
      return false;

    case INTENTS.HELP:
      await reportEventToCRM(from, 'intent_help');
      await sendWhatsAppMessage(from, "Puedo ayudarte a *revisar fecha*, mostrarte el *paquete* o llevarte al *Cotizador Web*.");
      await sendInteractiveMessage(from, "Elige una opción:", [
        { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
        { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" }
      ]);
      return true;

    default:
      return false;
  }
}

/* =========================
   Tipo de evento (igual que antes)
========================= */
async function handleTipoEvento(from, msgLower, context) {
  if (msgLower.includes("boda") || msgLower.includes("evento_boda")) {
    context.tipoEvento = "Boda";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¡Felicidades por tu boda! ❤️ Hagamos un día inolvidable.");
    await sendInteractiveMessage(from, "¿Cómo quieres continuar?", [
      { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" },
      { id: "armar_paquete", title: "Ver opciones" }
    ]);
    context.estado = "EsperandoConfirmacionPaquete";
    await saveContext(from, context);
    return true;
  }

  if (msgLower.includes("xv") || msgLower.includes("quince")) {
    context.tipoEvento = "XV";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¡Felicidades! ✨ Hagamos unos XV espectaculares.");
    await solicitarFecha(from, context);
    return true;
  }

  context.tipoEvento = "Otro";
  await saveContext(from, context);
  await sendWhatsAppMessage(from, "¡Excelente! ✨ Hagamos tu evento único.");
  await sendInteractiveMessage(from, "¿Cómo quieres continuar?", [
    { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" },
    { id: "armar_paquete", title: "Ver opciones" }
  ]);
  context.estado = "EsperandoConfirmacionPaquete";
  await saveContext(from, context);
  return true;
}

/* =========================
   Handler principal (con NLU)
========================= */
async function handleUserMessage(from, userText, messageLower) {
  let context = await ensureContext(from);

  // Atajo inicial “Paquete mis XV” + evento
  if (
    (context.estado === "Contacto Inicial" || context.estado === "EsperandoTipoEvento") &&
    /(^|\s)paquete\s+mis\s+xv(\s|$)/i.test(userText)
  ) {
    await reportEventToCRM(from, 'trigger_paquete_xv', { text: userText });
    context.tipoEvento = "XV";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¡Felicidades! ✨ Hagamos unos XV espectaculares.");
    await solicitarFecha(from, context);
    return true;
  }

  // Botones/acciones equivalentes por texto
  if (messageLower === "cotizador_personalizado") {
    await handleCotizadorPersonalizado(from, context);
    return true;
  }
  if (messageLower === "confirmar_paquete_xv") {
    await handleConfirmarPaqueteXV(from, context);
    return true;
  }
  if (messageLower.includes("armar_paquete") || messageLower.includes("armar mi paquete")) {
    await handleCotizadorPersonalizado(from, context);
    return true;
  }

  // Detección de intención (ANTES de la lógica de formato inválido)
  const intent = await detectIntent(userText);
  const handledByIntent = await handleIntent(from, context, intent, userText);
  if (handledByIntent) return true;

  // Inicio
  if (context.estado === "Contacto Inicial") {
    await sendWhatsAppMessage(from, "¡Hola! 👋 Soy *Cami-Bot*, a tus órdenes.");
    await sendWhatsAppMessage(from, "¿Qué tipo de evento tienes? (Boda, XV, cumpleaños...)");
    context.estado = "EsperandoTipoEvento";
    await saveContext(from, context);
    return true;
  }

  // Tipo evento
  if (["EsperandoTipoEvento","EsperandoSubtipoOtroEvento"].includes(context.estado)) {
    await handleTipoEvento(from, messageLower, context);
    return true;
  }

  // Confirmación genérica
  if (context.estado === "EsperandoConfirmacionPaquete") {
    await sendInteractiveMessage(from, "¿Cómo quieres continuar?", [
      { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
      { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" }
    ]);
    return true;
  }

  // Fecha (con validaciones)
  if (context.estado === "EsperandoFecha") {
    if (!isValidDateExtended(userText)) {
      // Importante: ya hicimos NLU. Si llegó aquí, realmente no envió fecha.
      await sendWhatsAppMessage(from, "Para seguir, envíame la *fecha* en formato DD/MM/AAAA o '20 de mayo 2026' 📆");
      return true;
    }
    if (!isValidFutureDate(userText)) {
      await sendWhatsAppMessage(from, "Esa fecha ya pasó. Indica una futura, por favor. 📆");
      return true;
    }
    if (!isWithinTwoYears(userText)) {
      await sendWhatsAppMessage(from, "Agenda abierta hasta 2 años. Indica otra fecha dentro de ese rango. 📆");
      return true;
    }

    const ddmmyyyy = parseFecha(userText);
    const iso = toISO(ddmmyyyy);
    const ok = await checkAvailability(iso);
    const pretty = formatFechaEnEspanol(ddmmyyyy);

    if (!ok) {
      await sendWhatsAppMessage(from, `😔 Lo siento, *${pretty}* no está disponible.`);
      context.estado = "Finalizado";
      await saveContext(from, context);
      return true;
    }

    context.fecha = pretty;
    context.fechaISO = iso;

    if ((context.tipoEvento || "").toLowerCase() === "xv") {
      await saveContext(from, context);
      await flujoXVDespuesDeFechaOK(from, context, pretty);
      return true;
    }

    context.estado = "EsperandoDecisionPaquete";
    await saveContext(from, context);
    await sendInteractiveMessage(from, `*${pretty}* DISPONIBLE 👏👏👏\n¿Cómo quieres continuar?`, [
      { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" },
      { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" }
    ]);
    return true;
  }

  // Esperando decisión (XV)
  if (context.estado === "EsperandoDecisionPaquete") {
    await sendInteractiveMessage(from, "Elige una opción:", [
      { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
      { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" }
    ]);
    return true;
  }

  // Lugar
  if (context.estado === "EsperandoLugar") {
    await handleLugar(from, userText, context);
    return true;
  }

  if (context.estado === "Finalizado") return true;

  // Fallback breve
  await sendWhatsAppMessage(from, "¿Deseas revisar *fecha*, ver el *PAQUETE MIS XV* o ir al *COTIZADOR WEB*?");
  await sendInteractiveMessage(from, "Puedo ayudarte con:", [
    { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
    { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" }
  ]);
  return true;
}

/* =========================
   Rutas HTTP
========================= */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value || {};
    const message = entry?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;

    // IMAGEN entrante
    if (message.type === "image") {
      try {
        const mediaId = message.image.id;
        const meta = await axios.get(`https://graph.facebook.com/${WABA_VERSION}/${mediaId}`, { headers: { Authorization: `Bearer ${WABA_TOKEN}` } });
        const directUrl = meta.data.url;
        const bin = await axios.get(directUrl, { headers: { Authorization: `Bearer ${WABA_TOKEN}` }, responseType: 'arraybuffer' });
        const key = `${uuidv4()}.jpg`;
        const up = await s3.upload({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: key,
          Body: bin.data,
          ContentType: 'image/jpeg'
        }).promise();
        await axios.post(`${CRM_BASE_URL}/recibir_mensaje`, {
          plataforma: "WhatsApp", remitente: from, mensaje: up.Location, tipo: "recibido_imagen"
        });
      } catch (e) {
        console.error("Imagen entrante error:", e.message);
      }
      return res.sendStatus(200);
    }

    // VIDEO entrante
    if (message.type === "video") {
      try {
        const mediaId = message.video.id;
        const meta = await axios.get(`https://graph.facebook.com/${WABA_VERSION}/${mediaId}`, { headers: { Authorization: `Bearer ${WABA_TOKEN}` } });
        const directUrl = meta.data.url;
        const bin = await axios.get(directUrl, { headers: { Authorization: `Bearer ${WABA_TOKEN}` }, responseType: 'arraybuffer' });
        const key = `${uuidv4()}.mp4`;
        const up = await s3.upload({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: key,
          Body: bin.data,
          ContentType: 'video/mp4'
        }).promise();
        await axios.post(`${CRM_BASE_URL}/recibir_mensaje`, {
          plataforma: "WhatsApp", remitente: from, mensaje: up.Location, tipo: "recibido_video"
        });
      } catch (e) {
        console.error("Video entrante error:", e.message);
      }
      return res.sendStatus(200);
    }

    // TEXTO/INTERACTIVE entrante
    let userMessage = "";
    if (message.text?.body) userMessage = message.text.body;
    else if (message.interactive?.button_reply) userMessage = message.interactive.button_reply.title || message.interactive.button_reply.id;
    else if (message.interactive?.list_reply) userMessage = message.interactive.list_reply.title || message.interactive.list_reply.id;

    try {
      await axios.post(`${CRM_BASE_URL}/recibir_mensaje`, {
        plataforma: "WhatsApp", remitente: from, mensaje: userMessage
      });
    } catch (e) {
      console.error("CRM texto error:", e.message);
    }

    const buttonReply = message?.interactive?.button_reply?.id || '';
    const listReply = message?.interactive?.list_reply?.id || '';
    const messageLower = normalizeText(buttonReply || listReply || userMessage);

    const handled = await handleUserMessage(from, userMessage, messageLower);
    if (handled) return res.sendStatus(200);

    return res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e.message);
    return res.sendStatus(500);
  }
});

app.get('/', async (_req, res) => {
  res.send('¡Servidor OK! 🚀');
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.post('/upload_imagen', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió archivo en 'imagen'" });
    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) return res.status(500).json({ error: "Falta S3_BUCKET_NAME" });
    const nombreArchivo = `${uuidv4()}_${req.file.originalname}`;
    const up = await s3.upload({
      Bucket: bucket, Key: nombreArchivo, Body: req.file.buffer,
      ContentType: req.file.mimetype || 'application/octet-stream'
    }).promise();
    return res.json({ url: up.Location });
  } catch (e) {
    console.error("upload_imagen error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/enviar_mensaje', async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;
    if (!telefono || !mensaje) return res.status(400).json({ error: 'Faltan datos' });
    await sendWhatsAppMessage(telefono, mensaje);
    res.json({ ok: true });
  } catch (e) {
    console.error("enviar_mensaje error:", e.message);
    res.status(500).json({ error: 'Error al enviar a WhatsApp' });
  }
});

app.post('/enviar_imagen', async (req, res) => {
  try {
    const { telefono, imageUrl, caption } = req.body;
    if (!telefono || !imageUrl) return res.status(400).json({ error: 'Faltan datos (telefono, imageUrl)' });
    await sendImageMessage(telefono, imageUrl, caption);
    res.json({ ok: true });
  } catch (e) {
    console.error("enviar_imagen error:", e.message);
    res.status(500).json({ error: 'Error al enviar imagen' });
  }
});

app.post('/enviar_video', async (req, res) => {
  try {
    const { telefono, videoUrl, caption } = req.body;
    if (!telefono || !videoUrl) return res.status(400).json({ error: 'Faltan datos (telefono, videoUrl)' });
    await sendWhatsAppVideo(telefono, videoUrl, caption);
    res.json({ ok: true });
  } catch (e) {
    console.error("enviar_video error:", e.message);
    res.status(500).json({ error: 'Error al enviar video' });
  }
});

/* =========================
   Server
========================= */
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});

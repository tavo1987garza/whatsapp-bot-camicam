// =====================================
// file: bot/index.js
// =====================================
import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import NodeCache from 'node-cache';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import cors from 'cors';
import crypto from 'crypto';
console.log('=== BOT CAMI-CAM INICIADO ===');

dotenv.config();

/* ===== Configuración global ===== */
const app = express();
const PORT = process.env.PORT || 3001;
const CRM_BASE_URL = process.env.CRM_BASE_URL || "https://crm.cami-cam.com";
const ALLOWED_ORIGIN = (process.env.CORS_ORIGIN || "https://crm.cami-cam.com,https://cotizador-cami-cam-209c7f6faca2.herokuapp.com")
  .split(',').map(s => s.trim()).filter(Boolean);
const WABA_VERSION = process.env.WABA_VERSION || "v21.0";
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WABA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const COTIZADOR_URL = (process.env.COTIZADOR_URL || "https://cotizador-cami-cam-209c7f6faca2.herokuapp.com/").replace(/\/+$/, '');
const COTIZADOR_VIDEO_URL = process.env.COTIZADOR_VIDEO_URL || "https://filesamples.com/samples/video/mp4/sample_640x360.mp4";
const COTIZADOR_SECRET = process.env.COTIZADOR_SECRET;
const COTIZADOR_SHORT_API = `${COTIZADOR_URL}/api/short`;

const REQUIRED_ENVS = [
  'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'VERIFY_TOKEN',
  'OPENAI_API_KEY', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME',
  'COTIZADOR_SECRET'
];
const missing = REQUIRED_ENVS.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Faltan variables de entorno:', missing.join(', '));
  process.exit(1);
}

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGIN.includes(origin)) return cb(null, true);
    return cb(new Error('CORS no permitido'), false);
  }
}));
app.use(express.json({ limit: '1mb' }));

/* ===== AWS S3 ===== */
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const s3 = new AWS.S3();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/* ===== OpenAI (caché) ===== */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const responseCache = new NodeCache({ stdTTL: 3600 });

/* ===== Utils ===== */
const antiDuplicateCache = new NodeCache({ stdTTL: 120 });
const normalizeText = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const toHttps = (u) => u?.startsWith('http://') ? u.replace(/^http:\/\//i, 'https://') : u;
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const formatFechaEnEspanol = (ddmmyyyy) => {
  const [d, m, y] = ddmmyyyy.split('/');
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${d} de ${meses[+m - 1]} ${y}`;
};
const parseFecha = (s) => {
  const t = (s || "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-záéíóú]+)\s*(?:de\s+)?(\d{4})$/i);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const map = {
    enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
    julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
    noviembre: "11", diciembre: "12"
  };
  const month = map[normalizeText(m[2])];
  if (!month) return null;
  return `${day}/${month}/${m[3]}`;
};
const isValidDate = (ddmmyyyy) => {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(ddmmyyyy)) return false;
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
};
const isValidDateExtended = (s) => {
  const f = parseFecha(s);
  return !!(f && isValidDate(f));
};
const isValidFutureDate = (s) => {
  const f = parseFecha(s);
  if (!f || !isValidDate(f)) return false;
  const [d, m, y] = f.split('/').map(Number);
  const inDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return inDate >= today;
};
const isWithinTwoYears = (s) => {
  const f = parseFecha(s);
  if (!f || !isValidDate(f)) return false;
  const [d, m, y] = f.split('/').map(Number);
  const inDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const max = new Date(today);
  max.setFullYear(max.getFullYear() + 2);
  return inDate <= max;
};
const toISO = (ddmmyyyy) => {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
};
const shouldSkipDuplicateSend = (to, key) => {
  const k = `${to}::${key}`.slice(0, 512);
  if (antiDuplicateCache.get(k)) return true;
  antiDuplicateCache.set(k, true);
  return false;
};

/* ===== CRM helpers ===== */
async function getContext(from) {
  try {
    const { data } = await axios.get(`${CRM_BASE_URL}/leads/context`, { params: { telefono: from }, timeout: 5000 });
    return data?.context || null;
  } catch (e) {
    console.error("getContext:", e.message);
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
    console.error("saveContext:", e.message);
  }
}
async function reportMessageToCRM(to, message, tipo = "recibido") {
  try {
    await axios.post(`${CRM_BASE_URL}/recibir_mensaje`, {
      plataforma: "WhatsApp",
      remitente: to,
      mensaje: message,
      tipo
    }, { timeout: 7000 });
  } catch (e) {
    console.error("CRM report:", e.response?.data || e.message);
  }
}
async function reportEventToCRM(to, eventName, meta = {}) {
  const payload = `EVENT:${eventName}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}`;
  await reportMessageToCRM(to, payload, "enviado");
}
async function checkAvailability(dateYYYYMMDD) {
  try {
    const { data } = await axios.get(`${CRM_BASE_URL}/calendario/check`, { params: { fecha: dateYYYYMMDD }, timeout: 7000 });
    return !!data?.available;
  } catch (e) {
    console.error("disponibilidad:", e.message);
    return false;
  }
}

/* ===== CRM: obtener ID por teléfono ===== */
async function getLeadIdByPhone(phone) {
  try {
    const { data } = await axios.get(`${CRM_BASE_URL}/lead_id`, {
      params: { telefono: phone },
      timeout: 5000
    });
    return data?.id || null;
  } catch (e) {
    if (e.response?.status === 404) {
      console.warn(`Lead no encontrado para ${phone}`);
    } else {
      console.error("getLeadIdByPhone:", e.message);
    }
    return null;
  }
}

// ===== CRM: actualizar estado (solo para estados no-seguimiento) =====
async function updateLeadStatusByPhone(phone, newStatus) {
  const validStates = ["Contacto Inicial", "En proceso", "Cliente", "No cliente"];
  if (!validStates.includes(newStatus)) {
    console.error("Estado inválido para actualización directa:", newStatus);
    return;
  }

  try {
    const leadId = await getLeadIdByPhone(phone);
    if (!leadId) return;

    await axios.post(`${CRM_BASE_URL}/cambiar_estado_lead`, {
      id: leadId,
      estado: newStatus
    }, { timeout: 5000 });

    console.log(`✅ Estado actualizado: ${phone} → ${newStatus}`);
  } catch (e) {
    console.error("updateLeadStatusByPhone:", e.message);
  }
}

// ===== CRM: enviar evento de seguimiento específico =====
async function reportFollowUpType(to, tipoEvento) {
  let seguimientoType;
  if ((tipoEvento || "").toLowerCase().includes("xv")) {
    seguimientoType = "XV";
  } else if ((tipoEvento || "").toLowerCase().includes("boda") || (tipoEvento || "").toLowerCase().includes("wedding")) {
    seguimientoType = "Boda";
  } else {
    seguimientoType = "Otro";
  }
  await reportMessageToCRM(to, `EVENT:lead_seguimiento ${seguimientoType}`, "enviado");
}

/* ===== WhatsApp helpers ===== */
const WABA_URL = `https://graph.facebook.com/${WABA_VERSION}/${PHONE_ID}/messages`;
const WABA_HEADERS = { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' };
const wabaReady = () => Boolean(PHONE_ID && WABA_TOKEN);

async function sendWhatsAppMessage(to, text) {
  try {
    if (!wabaReady() || !text) return;
    if (shouldSkipDuplicateSend(to, `text:${text}`)) return;
    const { data } = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    }, { headers: WABA_HEADERS, timeout: 15000 });
    console.log("WA text ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, text, "enviado");
  } catch (e) {
    console.error("WA text:", e.response?.data || e.message);
  }
}
async function sendImageMessage(to, imageUrl, caption) {
  try {
    if (!wabaReady()) return;
    const link = toHttps(imageUrl);
    if (!link) return;
    if (shouldSkipDuplicateSend(to, `image:${link}:${caption || ''}`)) return;
    const { data } = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link, ...(caption ? { caption } : {}) }
    }, { headers: WABA_HEADERS, timeout: 20000 });
    console.log("WA image ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, link, "enviado_imagen");
  } catch (e) {
    console.error("WA image:", e.response?.data || e.message);
  }
}
async function sendWhatsAppVideo(to, videoUrl, caption) {
  try {
    if (!wabaReady()) return;
    const link = toHttps(videoUrl);
    if (!link) return;
    if (shouldSkipDuplicateSend(to, `video:${link}:${caption || ''}`)) return;
    const { data } = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: { link, ...(caption ? { caption } : {}) }
    }, { headers: WABA_HEADERS, timeout: 30000 });
    console.log("WA video ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, link, "enviado_video");
  } catch (e) {
    console.error("WA video:", e.response?.data || e.message);
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
        action: {
          buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } }))
        }
      }
    };
    if (shouldSkipDuplicateSend(to, `interactive:${body}:${JSON.stringify(buttons)}`)) return;
    const { data } = await axios.post(WABA_URL, payload, { headers: WABA_HEADERS, timeout: 20000 });
    console.log("WA interactive ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, `${body}\n\n${buttons.map(b => `• ${b.title}`).join("\n")}`, "enviado");
  } catch (e) {
    console.error("WA interactive:", e.response?.data || e.message);
  }
}
async function activateTypingIndicator() { /* no-op */ }
async function deactivateTypingIndicator() { /* no-op */ }
async function sendMessageWithTypingWithState(from, message, ms, expectedState) {
  await activateTypingIndicator(from);
  await delay(ms);
  const ctx = await getContext(from);
  if ((ctx?.estado || null) === expectedState) await sendWhatsAppMessage(from, message);
  await deactivateTypingIndicator(from);
}

/* ===== Contexto inicial ===== */


async function ensureContext(from) {
  let context = await getContext(from);
  // Si no hay contexto o es null, crea uno nuevo
  if (!context || typeof context !== 'object') {
    context = {
      estado: "Contacto Inicial",
      tipoEvento: null,
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

/* ===== Intents ===== */
const INTENTS = {
  GREETING: 'greeting',
  PRICE: 'price',
  DATE: 'date',
  HOURS: 'hours',
  WHAT_IS_AGB: 'what_is_agb',
  BUTTON_ARMAR: 'button_armar',
  BUTTON_CONF_PAXV: 'button_confirm_paquete_xv',
  BUTTON_CONF_PAWED: 'button_confirm_paquete_wedding',
  OKAY: 'okay',
  UNKNOWN: 'unknown'
};

function detectIntentRegex(text) {
  const t = normalizeText(text);
  if (/^(hola|buen[oa]s|holi|hey|que onda)\b/.test(t)) return INTENTS.GREETING;
  if (/\b(precio|cuan?to\s+cuesta|cuan?to\s+vale|tarifa|costo)\b/.test(t)) return INTENTS.PRICE;
  if (/\b(hora|horas|duraci[oó]n|cu[aá]ntas horas)\b/.test(t)) return INTENTS.HOURS;
  if (/\baudio\s*guest\s*book|libro de (audio|voz)|tel[eé]fono de mensajes\b/.test(t)) return INTENTS.WHAT_IS_AGB;
  if (/\barmar mi paquete\b|\bpersonalizar\b|\bcotizador\b/.test(t)) return INTENTS.BUTTON_ARMAR;
  if (/^paquete\s+mis\s+xv$/i.test(t)) return INTENTS.BUTTON_CONF_PAXV;
  if (/^paquete\s+wedding$|^paquete\s+boda$/i.test(t)) return INTENTS.BUTTON_CONF_PAWED;
  if (isValidDateExtended(text)) return INTENTS.DATE;
  return INTENTS.UNKNOWN;
}
async function detectIntent(t) {
  return detectIntentRegex(t);
}

/* ===== Shortlinks ===== */
function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function signP64(p64, secret) {
  const mac = crypto.createHmac('sha256', secret).update(p64).digest();
  return b64u(mac);
}

async function buildCotizadorShortLinkStateful({ tipoEvento, fechaISO, telefono }) {
  const eventoNorm = String(tipoEvento || 'OTRO').toUpperCase();
  const e = eventoNorm.includes('XV') ? 'XV' : eventoNorm.includes('BODA') ? 'BODA' : 'OTRO';
  const f = String(fechaISO || '');
  const s = f ? 3 : 2;
  const p = String(telefono || '');
  const t = Date.now();
  const body = { e, f, p, s, t };

  try {
    const { data } = await axios.post(COTIZADOR_SHORT_API, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Short-Sign': crypto.createHmac('sha256', COTIZADOR_SECRET).update(Buffer.from(JSON.stringify(body), 'utf8')).digest('hex')
      },
      timeout: 5000
    });
    if (data?.ok && data?.id) {
      return `${COTIZADOR_URL}/s/${data.id}`;
    }
    throw new Error('Bad short API response');
  } catch (e) {
    console.warn('[shortlink stateful] fallo, usando fallback stateless:', e.message);
    // Fallback stateless no implementado aquí (opcional)
    return `${COTIZADOR_URL}/?evento=${encodeURIComponent(tipoEvento || 'OTRO')}&fecha=${encodeURIComponent(fechaISO || '')}`;
  }
}

/* ===== Flujos específicos ===== */
const AGB_IMAGE = "https://cami-cam.com/wp-content/uploads/2023/07/audio1.jpg";

async function solicitarFecha(from, context) {
  await sendMessageWithTypingWithState(
    from,
    "Indíqueme la fecha de su evento.\n\nFormato: DD/MM/AAAA o '20 de mayo 2026' 📆",
    300,
    context.estado
  );
  context.estado = "EsperandoFecha";
  await saveContext(from, context);
}


async function solicitarLugar(from, context) {
  await sendMessageWithTypingWithState(
    from,
    "Para continuar, necesito el nombre de su salón o lugar del evento 🏢",
    300,
    context.estado
  );
}

async function handleLugar(from, userText, context) {
  context.lugar = userText;
  context.estado = "Finalizando";
  await saveContext(from, context);

  await sendMessageWithTypingWithState(from, "¡Excelente! Aquí tiene la información para separar su fecha:", 200, "Finalizando");
  await delay(500);
  await sendMessageWithTypingWithState(from, "💰 *ANTICIPO:* $500 MXN", 200, "Finalizando");
  await sendMessageWithTypingWithState(from, "El resto se paga el día del evento.", 200, "Finalizando");
  await delay(500);
  await sendImageMessage(from, "https://cami-cam.com/wp-content/uploads/2025/03/Datos-Transferencia-1.jpeg", "Datos para transferencia: 722969010494399671");
  await delay(500);
  await sendMessageWithTypingWithState(from, "Después de su depósito:\n1) Le pido sus datos\n2) Llenamos el contrato\n3) Le envío foto del contrato firmado", 200, "Finalizando");
  await delay(400);
  await sendMessageWithTypingWithState(from, "❓ *Preguntas frecuentes:*\nhttps://cami-cam.com/preguntas-frecuentes/", 200, "Finalizando");
  await delay(300);
  await sendMessageWithTypingWithState(from, "Cualquier duda, con confianza.\nSoy Gustavo González 😀", 200, "Finalizando");

  context.estado = "Finalizado";
  await saveContext(from, context);
}

/* ===== Flujo unificado post-disponibilidad ===== */
async function flujoPaquetePostFechaOK(from, context, pretty, tipoEvento) {
  const esXV = tipoEvento.toLowerCase() === "xv";
  const esBoda = tipoEvento.toLowerCase() === "boda";
  const nombrePaquete = esXV ? "PAQUETE MIS XV" : esBoda ? "PAQUETE WEDDING" : "PAQUETE PERSONALIZADO";

  await sendMessageWithTypingWithState(from, `¡Perfecto!\n\n*${pretty}* DISPONIBLE 👏👏👏`, 200, context.estado);
  await delay(600);
  await sendMessageWithTypingWithState(from, `El paquete que estamos promocionando es el *"${nombrePaquete}"*`, 200, context.estado);
  await delay(300);
  await sendImageMessage(from, "https://cami-cam.com/wp-content/uploads/2025/04/Paq-Mis-XV-Inform.jpg");
  await delay(600);
  await sendMessageWithTypingWithState(from, `🎁 *PROMO:* Al contratar este paquete le regalamos el servicio de *"AUDIO GUEST BOOK"*`, 200, context.estado);
  await delay(600);
  await sendWhatsAppVideo(from, COTIZADOR_VIDEO_URL, "Video: ¿Qué es el Audio Guest Book?");
  await delay(400);

  let mensajeAGB;
  if (esXV) {
    mensajeAGB = "Es un teléfono retro que ponemos afuera de la cabina. Sus invitados levantan la bocina y se escucha la voz de la quinceañera diciendo algo así: '¡Hola! Bienvenidos a mi fiesta de quince años, por favor deja tu mensaje después del tono'. Los invitados dejarán sus mejores deseos, y después les haremos llegar todos los audios generados. Será un gran recuerdo escucharlos nuevamente después de un tiempo.";
  } else if (esBoda) {
    mensajeAGB = "Es un teléfono retro que ponemos afuera de la cabina. Sus invitados levantan la bocina y escuchan la voz de los novios diciendo algo así: '¡Hola! Bienvenidos a nuestra boda, por favor deja tu mensaje después del tono'. Los invitados grabarán sus mejores deseos, y después les haremos llegar todos los audios. Será un hermoso recuerdo para revivir ese día.";
  } else {
    mensajeAGB = "Es un teléfono retro donde sus invitados dejan mensajes de voz personalizados. Les entregamos todos los audios al final del evento. ¡Un recuerdo único!";
  }

  await sendMessageWithTypingWithState(from, mensajeAGB, 200, context.estado);
  await delay(500);

  await sendInteractiveMessage(from, "¿Le interesa este paquete o prefiere armar uno a su gusto?", [
    { id: esXV ? "confirmar_paquete_xv" : "confirmar_paquete_wedding", title: `✅ ${nombrePaquete}` },
    { id: "armar_mi_paquete", title: "🧩 ARMAR MI PAQUETE" }
  ]);

  context.estado = "EsperandoDecisionPaquete";
  await saveContext(from, context);
}

/* ===== Manejo de decisiones del usuario ===== */
async function handleArmarMiPaquete(from, context) {
  await reportFollowUpType(from, context.tipoEvento); // ✅ Nuevo
  context.estado = "EnviandoACotizador";
  await saveContext(from, context);
  await reportEventToCRM(from, 'cotizador_web_click', { origin: context.tipoEvento || 'desconocido' });

  await sendMessageWithTypingWithState(from, "¡Perfecto! Le explico cómo usar nuestro cotizador online:", 200, "EnviandoACotizador");
  await delay(600);
  await sendWhatsAppVideo(from, COTIZADOR_VIDEO_URL, "Video explicativo del cotizador");
  await delay(900);

  const shortUrl = await buildCotizadorShortLinkStateful({
    tipoEvento: context.tipoEvento || 'OTRO',
    fechaISO: context.fechaISO || '',
    telefono: from
  });

  await sendMessageWithTypingWithState(
    from,
    "🧩 *ARMAR MI PAQUETE*\nAbra este enlace corto. Si ya tenemos su fecha, lo llevamos directo al Paso 3:",
    200,
    "EnviandoACotizador"
  );
  await sendMessageWithTypingWithState(from, shortUrl, 200, "EnviandoACotizador");
  await delay(400);

  context.estado = "EsperandoLugar";
  await saveContext(from, context);
  await solicitarLugar(from, context);
}
async function handleConfirmarPaqueteXV(from, context) {
  await reportFollowUpType(from, context.tipoEvento); // ✅ Nuevo
  context.serviciosSeleccionados = "PAQUETE MIS XV";
  context.estado = "EsperandoLugar";
  await saveContext(from, context);
  await solicitarLugar(from, context);
}

async function handleConfirmarPaqueteWedding(from, context) {
  await reportFollowUpType(from, context.tipoEvento); // ✅ Nuevo
  context.serviciosSeleccionados = "PAQUETE WEDDING";
  context.estado = "EsperandoLugar";
  await saveContext(from, context);
  await solicitarLugar(from, context);
}

/* ===== Manejo de intents ===== */
async function handleIntent(from, context, intent) {
  switch (intent) {
    case INTENTS.BUTTON_ARMAR:
      await reportEventToCRM(from, 'intent_button_armar_mi_paquete');
      await handleArmarMiPaquete(from, context); return true;
    case INTENTS.BUTTON_CONF_PAXV:
      await reportEventToCRM(from, 'intent_button_confirm_paquete_xv');
      await handleConfirmarPaqueteXV(from, context); return true;
    case INTENTS.BUTTON_CONF_PAWED:
      await reportEventToCRM(from, 'intent_button_confirm_paquete_wedding');
      await handleConfirmarPaqueteWedding(from, context); return true;
    case INTENTS.PRICE:
      await reportEventToCRM(from, 'intent_price', { estado: context.estado, tipo: context.tipoEvento });
      await sendWhatsAppMessage(from, "Los *precios* los ve en tiempo real en *ARMAR MI PAQUETE*.");
      await sendMessageWithTypingWithState(from, `Ingrese con el botón 🧩 *ARMAR MI PAQUETE*`, 200, (await getContext(from))?.estado || context.estado);
      if (context.estado === "EsperandoFecha") await sendWhatsAppMessage(from, "Antes revisemos *disponibilidad*: ¿qué fecha tiene? 📆");
      return true;
    case INTENTS.WHAT_IS_AGB:
      await reportEventToCRM(from, 'intent_what_is_agb');
      await sendWhatsAppMessage(from, "El *Audio Guest Book* es un teléfono donde sus invitados dejan mensajes de voz; se lo entregamos en un archivo de audio.");
      await sendImageMessage(from, AGB_IMAGE, "Audio Guest Book");
      return true;
    default: return false;
  }
}


/* ===== Tipo de evento ===== */
async function handleTipoEvento(from, msgLower, context) {
  console.log('🔍 Detectando tipo evento con texto:', msgLower); // ← Agrega esto para debug
  
  if (msgLower.includes("boda") || msgLower.includes("wedding") || msgLower.includes("casamiento")) {
    context.tipoEvento = "Boda";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¡Felicidades por su boda! ❤️");
    await sendInteractiveMessage(from, "¿Cómo quiere continuar?", [
      { id: "armar_mi_paquete", title: "🧩 ARMAR MI PAQUETE" },
      { id: "confirmar_paquete_wedding", title: "✅ PAQUETE WEDDING" }
    ]);
    context.estado = "EsperandoConfirmacionPaquete";
    await saveContext(from, context);
    return true;
  }
  
  if (msgLower.includes("xv") || msgLower.includes("quince") || msgLower.includes("15") || msgLower.includes("fiesta de quince")) {
    context.tipoEvento = "XV";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¡Felicidades! ✨ Hagamos unos XV espectaculares.");
    await solicitarFecha(from, context);
    return true;
  }
  
  context.tipoEvento = "Otro";
  await saveContext(from, context);
  await sendWhatsAppMessage(from, "¡Excelente! ✨ Hagamos su evento único.");
  await sendInteractiveMessage(from, "¿Cómo quiere continuar?", [
    { id: "armar_mi_paquete", title: "🧩 ARMAR MI PAQUETE" }
  ]);
  context.estado = "EsperandoConfirmacionPaquete";
  await saveContext(from, context);
  return true;
}

/* ===== Manejador principal de mensajes ===== */
async function handleUserMessage(from, userText, messageLower) {
  let context = await ensureContext(from);

  // Atajos iniciales: solo al inicio
  if (["Contacto Inicial", "EsperandoTipoEvento"].includes(context.estado)) {
    if (/^paquete\s+mis\s+xv$/i.test(userText.trim())) {
      await reportMessageToCRM(from, 'EVENT:trigger_paquete_xv', 'enviado');
      context.tipoEvento = "XV";
      await saveContext(from, context);
      await sendWhatsAppMessage(from, "¡Felicidades! ✨ Hagamos unos XV espectaculares.");
      await solicitarFecha(from, context);
      return true;
    }
    if (/^paquete\s+wedding$|^paquete\s+boda$/i.test(userText.trim())) {
      await reportMessageToCRM(from, 'EVENT:trigger_paquete_wedding', 'enviado');
      context.tipoEvento = "Boda";
      await saveContext(from, context);
      await sendWhatsAppMessage(from, "¡Felicidades por su boda! ❤️");
      await solicitarFecha(from, context);
      return true;
    }
  }

  // Botones/acciones
  if (messageLower === "armar_mi_paquete") { await handleArmarMiPaquete(from, context); return true; }
  if (messageLower === "confirmar_paquete_xv") { await handleConfirmarPaqueteXV(from, context); return true; }
  if (messageLower === "confirmar_paquete_wedding") { await handleConfirmarPaqueteWedding(from, context); return true; }

  // Intents libres
  const intent = await detectIntent(userText);
  if (await handleIntent(from, context, intent)) return true;

  // Saludo / inicio
  if (context.estado === "Contacto Inicial") {
    await sendWhatsAppMessage(from, "¡Hola! 👋 Soy el Nuevo *Cami-Bot*, a sus órdenes.");
    await sendWhatsAppMessage(from, "¿Qué tipo de evento tiene? (Boda, XV, cumpleaños...)");
    context.estado = "EsperandoTipoEvento";
    await saveContext(from, context);
    return true;
  }

  // Tipo de evento
  if (["EsperandoTipoEvento", "EsperandoSubtipoOtroEvento"].includes(context.estado)) {
    await handleTipoEvento(from, messageLower, context);
    return true;
  }

  // Confirmación paquete
  if (context.estado === "EsperandoConfirmacionPaquete") {
    await sendInteractiveMessage(from, "¿Cómo quiere continuar?", [
      { id: "armar_mi_paquete", title: "🧩 ARMAR MI PAQUETE" }
    ]);
    return true;
  }

  // Fecha
  if (context.estado === "EsperandoFecha") {
    if (!isValidDateExtended(userText)) {
      await sendWhatsAppMessage(from, "Para seguir, envíeme la *fecha* en formato DD/MM/AAAA o '20 de mayo 2026' 📆");
      return true;
    }
    if (!isValidFutureDate(userText)) {
      await sendWhatsAppMessage(from, "Esa fecha ya pasó. Indique una futura, por favor. 📆");
      return true;
    }
    if (!isWithinTwoYears(userText)) {
      await sendWhatsAppMessage(from, "Agenda abierta hasta 2 años. Indique otra fecha dentro de ese rango. 📆");
      return true;
    }

    const ddmmyyyy = parseFecha(userText);
    const iso = toISO(ddmmyyyy);
    const ok = await checkAvailability(iso);
    const pretty = formatFechaEnEspanol(ddmmyyyy);

    if (!ok) {
      await sendWhatsAppMessage(from, `😔 Lo siento, *${pretty}* no está disponible.`);
      await updateLeadStatusByPhone(from, "No cliente"); // ✅ Estado: No cliente
      context.estado = "Finalizado";
      await saveContext(from, context);
      return true;
    }

    context.fecha = pretty;
    context.fechaISO = iso;
    await saveContext(from, context);
    await updateLeadStatusByPhone(from, "En proceso"); // ✅ Estado: En proceso

    if ((context.tipoEvento || "").toLowerCase() === "xv") {
      await flujoPaquetePostFechaOK(from, context, pretty, "XV");
      return true;
    } else if ((context.tipoEvento || "").toLowerCase() === "boda") {
      await flujoPaquetePostFechaOK(from, context, pretty, "Boda");
      return true;
    } else {
      await sendInteractiveMessage(from, "¿Cómo quiere continuar?", [
        { id: "armar_mi_paquete", title: "🧩 ARMAR MI PAQUETE" },
        { id: "confirmar_paquete_wedding", title: "✅ PAQUETE WEDDING" }
      ]);
      context.estado = "EsperandoDecisionPaquete";
      await saveContext(from, context);
      return true;
    }
  }

  if (context.estado === "EsperandoDecisionPaquete") {
    await sendInteractiveMessage(from, "Elige una opción:", [
      { id: "armar_mi_paquete", title: "🧩 ARMAR MI PAQUETE" },
      { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
      { id: "confirmar_paquete_wedding", title: "✅ PAQUETE WEDDING" },
    ]);
    return true;
  }

  if (context.estado === "EsperandoLugar") {
    await handleLugar(from, userText, context);
    return true;
  }

  if (context.estado === "Finalizado") return true;

  await sendWhatsAppMessage(from, "¿Desea revisar *fecha*, ver un paquete o *ARMAR MI PAQUETE*?");
  await sendInteractiveMessage(from, "Puedo ayudarle con:", [
    { id: "armar_mi_paquete", title: "🧩 ARMAR MI PAQUETE" },
    { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
    { id: "confirmar_paquete_wedding", title: "✅ PAQUETE WEDDING" }
  ]);
  return true;
}

/* ===== HTTP endpoints ===== */
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

    // Manejo de multimedia (imagen/video)
    if (message.type === "image" || message.type === "video") {
      const mediaType = message.type;
      try {
        const mediaId = message[mediaType].id;
        const meta = await axios.get(`https://graph.facebook.com/${WABA_VERSION}/${mediaId}`, {
          headers: { Authorization: `Bearer ${WABA_TOKEN}` }
        });
        const directUrl = meta.data.url;
        const bin = await axios.get(directUrl, {
          headers: { Authorization: `Bearer ${WABA_TOKEN}` },
          responseType: 'arraybuffer'
        });
        const key = `${uuidv4()}.${mediaType === 'image' ? 'jpg' : 'mp4'}`;
        const up = await s3.upload({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: key,
          Body: bin.data,
          ContentType: mediaType === 'image' ? 'image/jpeg' : 'video/mp4'
        }).promise();
        await axios.post(`${CRM_BASE_URL}/recibir_mensaje`, {
          plataforma: "WhatsApp",
          remitente: from,
          mensaje: up.Location,
          tipo: `recibido_${mediaType}`
        });
      } catch (e) {
        console.error(`${mediaType} entrante:`, e.message);
      }
      return res.sendStatus(200);
    }

    // Mensaje de texto o botón
    let userMessage = "";
    if (message.text?.body) {
      userMessage = message.text.body;
    } else if (message.interactive?.button_reply) {
      userMessage = message.interactive.button_reply.title || message.interactive.button_reply.id;
    } else if (message.interactive?.list_reply) {
      userMessage = message.interactive.list_reply.title || message.interactive.list_reply.id;
    }

    await reportMessageToCRM(from, userMessage, "recibido");

    const buttonReply = message?.interactive?.button_reply?.id || '';
    const listReply = message?.interactive?.list_reply?.id || '';
    const messageLower = normalizeText(buttonReply || listReply || userMessage);

    await handleUserMessage(from, userMessage, messageLower);
    return res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e.message);
    return res.sendStatus(500);
  }
});

app.get('/', (_req, res) => res.send('¡Servidor OK! 🚀'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Endpoints para envío manual desde CRM
app.post('/upload_imagen', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió archivo en 'imagen'" });
    const up = await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `${uuidv4()}_${req.file.originalname}`,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || 'application/octet-stream'
    }).promise();
    return res.json({ url: up.Location });
  } catch (e) {
    console.error("upload_imagen:", e.message);
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
    console.error("enviar_mensaje:", e.message);
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
    console.error("enviar_imagen:", e.message);
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
    console.error("enviar_video:", e.message);
    res.status(500).json({ error: 'Error al enviar video' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bot de WhatsApp ejecutándose en puerto ${PORT}`);
});
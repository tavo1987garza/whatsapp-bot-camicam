// Código Camibot Funciona pefecto, est alimpio y ordenado
// Saluda, segmenta por tipo de evento y genera cotizaciones, (Falta pulir)  
// file: index.js
// Node >=18, ES Modules en package.json ("type": "module")

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
   Configuración base
========================= */
const app = express();
const PORT = process.env.PORT || 3000;
const CRM_BASE_URL = process.env.CRM_BASE_URL || "https://camicam-crm-d78af2926170.herokuapp.com";
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || "https://camicam-crm-d78af2926170.herokuapp.com";
const WABA_VERSION = process.env.WABA_VERSION || "v21.0";
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WABA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

/* =========================
   AWS S3
========================= */
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const s3 = new AWS.S3();
const upload = multer({ storage: multer.memoryStorage() });

/* =========================
   OpenAI
========================= */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =========================
   Estado y cachés
========================= */
const userContext = {}; // { [from]: {...} }
const responseCache = new NodeCache({ stdTTL: 3600 });
const antiDuplicateCache = new NodeCache({ stdTTL: 120 }); // evita reenvíos iguales en 2 min

/* =========================
   Utilidades
========================= */
const delay = ms => new Promise(r => setTimeout(r, ms));
const nowMs = () => Date.now();

const normalizeText = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

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

const contarLetras = (texto) => (texto || "").replace(/[^a-zA-ZÁÉÍÓÚáéíóúÑñ]/g,"").length;

// Anti-duplicado por usuario + hash simple
const shouldSkipDuplicateSend = (to, payloadKey) => {
  const key = `${to}::${payloadKey}`;
  if (antiDuplicateCache.get(key)) return true;
  antiDuplicateCache.set(key, true);
  return false;
};

/* =========================
   CRM helpers - AGREGAR PERSISTENCIA
========================= */
async function getContextFromDB(from) {
  try {
    const { data } = await axios.get(`${CRM_BASE_URL}/leads/context`, {
      params: { telefono: from },
      timeout: 5000
    });
    return data?.context || null;
  } catch (e) {
    console.error("Error getting context from DB:", e.message);
    return null;
  }
}

async function saveContextToDB(from, context) {
  try {
    await axios.post(`${CRM_BASE_URL}/leads/context`, {
      telefono: from,
      context: {
        ...context,
        lastActivity: new Date().toISOString()
      }
    }, { timeout: 5000 });
  } catch (e) {
    console.error("Error saving context to DB:", e.message);
  }
}

// Función mejorada que usa memoria + BD como fallback
async function ensureContext(from) {
  // Primero intenta desde memoria (más rápido)
  if (userContext[from]) {
    return userContext[from];
  }
  
  // Si no está en memoria, busca en BD
  const contextFromDB = await getContextFromDB(from);
  if (contextFromDB) {
    userContext[from] = contextFromDB;
    return contextFromDB;
  }
  
  // Si no existe en ningún lado, crea nuevo contexto
  const newContext = {
    estado: "Contacto Inicial",
    tipoEvento: null,
    paqueteRecomendado: null,
    fecha: null,
    fechaISO: null,
    lugar: null,
    serviciosSeleccionados: "",
    mediosEnviados: new Set(),
    upsellSuggested: false,
    suggestScrapbookVideo: false,
    lastActivity: new Date().toISOString()
  };
  
  userContext[from] = newContext;
  await saveContextToDB(from, newContext);
  return newContext;
}

// Función para guardar contexto (ambos lugares)
async function saveContext(from, context) {
  userContext[from] = context;
  await saveContextToDB(from, {
    ...context,
    mediosEnviados: Array.from(context.mediosEnviados || []) // Convertir Set a Array para JSON
  });
}

async function reportMessageToCRM(to, message, tipo = "enviado") {
  try {
    await axios.post(`${CRM_BASE_URL}/recibir_mensaje`, {
      plataforma: "WhatsApp",
      remitente: to,
      mensaje: message,
      tipo
    }, { timeout: 7000 });
  } catch (e) {
    console.error("CRM report error:", e.response?.data || e.message);
  }
}

async function checkAvailability(dateYYYYMMDD) {
  try {
    const { data } = await axios.get(`${CRM_BASE_URL}/calendario/check`, { params: { fecha: dateYYYYMMDD }, timeout: 7000 });
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
const WABA_HEADERS = {
  Authorization: `Bearer ${WABA_TOKEN}`,
  'Content-Type': 'application/json'
};

async function sendWhatsAppMessage(to, text) {
  try {
    if (shouldSkipDuplicateSend(to, `text:${text}`)) return; // evita spam accidental
    const { data } = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    }, { headers: WABA_HEADERS, timeout: 10000 });
    console.log("WA text ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, text, "enviado");
  } catch (e) {
    console.error("WA text error:", e.response?.data || e.message);
  }
}

async function sendImageMessage(to, imageUrl, caption = undefined) {
  try {
    if (shouldSkipDuplicateSend(to, `image:${imageUrl}:${caption||""}`)) return;
    const { data } = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) }
    }, { headers: WABA_HEADERS, timeout: 15000 });
    console.log("WA image ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, imageUrl, "enviado_imagen");
  } catch (e) {
    console.error("WA image error:", e.response?.data || e.message);
  }
}

async function sendWhatsAppVideo(to, videoUrl, caption = undefined) {
  try {
    if (shouldSkipDuplicateSend(to, `video:${videoUrl}:${caption||""}`)) return;
    const { data } = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: { link: videoUrl, ...(caption ? { caption } : {}) }
    }, { headers: WABA_HEADERS, timeout: 20000 });
    console.log("WA video ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, videoUrl, "enviado_video");
  } catch (e) {
    console.error("WA video error:", e.response?.data || e.message);
  }
}

async function sendInteractiveMessage(to, body, buttons) {
  try {
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
    const { data } = await axios.post(WABA_URL, payload, { headers: WABA_HEADERS, timeout: 15000 });
    console.log("WA interactive ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, `${body}\n\n${buttons.map(b=>`• ${b.title}`).join("\n")}`, "enviado");
  } catch (e) {
    console.error("WA interactive error:", e.response?.data || e.message);
  }
}

// Indicador "typing": lo dejo como no-op seguro (para evitar errores de API)
async function activateTypingIndicator() { /* no-op */ }
async function deactivateTypingIndicator() { /* no-op */ }

async function sendMessageWithTypingWithState(from, message, delayMs, expectedState) {
  await activateTypingIndicator(from);
  await delay(delayMs);
  const context = await ensureContext(from);
  if (context.estado === expectedState) {
    await sendWhatsAppMessage(from, message);
  }
  await deactivateTypingIndicator(from);
}

/* =========================
   NUEVO: Flujo específico para "Info Paquete Mis XV"
========================= */
async function handlePaqueteMisXVFlow(from, context) {
  context.tipoEvento = "XV";
  context.paqueteRecomendado = "PAQUETE MIS XV";
  context.estado = "EsperandoFechaPaqueteXV";
  
  await sendMessageWithTypingWithState(
    from, 
    "¡Excelente! Para verificar disponibilidad del *PAQUETE MIS XV*, necesito la fecha de tu evento.\n\nFormato: DD/MM/AAAA 📆",
    500, 
    context.estado
  );
  
  await saveContext(from, context);
}

async function handleFechaPaqueteXV(from, userText, context) {
  if (!isValidDateExtended(userText)) {
    await sendMessageWithTypingWithState(from, "Formato inválido. Usa DD/MM/AAAA o '20 de mayo 2025'.", 200, context.estado);
    return false;
  }
  
  if (!isValidFutureDate(userText)) {
    await sendMessageWithTypingWithState(from, "Esa fecha ya pasó. Indica una futura.", 200, context.estado);
    return false;
  }
  
  if (!isWithinTwoYears(userText)) {
    await sendMessageWithTypingWithState(from, "Agenda abierta hasta 2 años. Indica otra fecha dentro de ese rango.", 200, context.estado);
    return false;
  }

  const ddmmyyyy = parseFecha(userText);
  const iso = toISO(ddmmyyyy);
  const ok = await checkAvailability(iso);
  const pretty = formatFechaEnEspanol(ddmmyyyy);

  if (!ok) {
    await sendMessageWithTypingWithState(from, `😔 Lo siento, *${pretty}* no está disponible.`, 200, context.estado);
    context.estado = "Finalizado";
    await saveContext(from, context);
    return false;
  }

  context.fecha = pretty;
  context.fechaISO = iso;
  context.estado = "MostrandoPaqueteXV";
  await saveContext(from, context);

  // Mostrar información del paquete MIS XV
  await sendMessageWithTypingWithState(from, `¡Perfecto!\n\n*${pretty}* DISPONIBLE 👏👏👏`, 200, context.estado);
  await delay(1000);
  await sendMessageWithTypingWithState(from, "El paquete que estamos promocionando es el *PAQUETE MIS XV*", 200, context.estado);
  await delay(500);
  
  // Enviar imagen del paquete MIS XV
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/04/Paq-Mis-XV-Inform.jpg");
  await delay(1000);
  
  await sendMessageWithTypingWithState(from, "🎁 *PROMOCIÓN EXCLUSIVA:* Al contratar este paquete te llevas sin costo el servicio de *'Audio Guest Book'*", 200, context.estado);
  await delay(1000);
  
  // Enviar información del Audio Guest Book
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2023/07/audio1.jpg", "Audio Guest Book - Incluido gratis en tu paquete");
  await delay(1000);
  
  await sendMessageWithTypingWithState(from, "¿Te interesa este *PAQUETE MIS XV* o prefieres armar un paquete a tu gusto?", 200, context.estado);
  await delay(500);
  
  // Enviar imagen de servicios
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/04/Servicios.png", "Nuestros servicios disponibles");
  await delay(500);
  
  await sendInteractiveMessage(from, "Elige una opción:", [
    { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
    { id: "armar_paquete", title: "🎛️ ARMAR MI PAQUETE" }
  ]);
  
  context.estado = "EsperandoDecisionPaqueteXV";
  await saveContext(from, context);
  return true;
}

/* =========================
   Catálogo, media, FAQs
========================= */
const PRICES = {
  "cabina de fotos": 3500,
  "cabina 360": 3500,
  "lluvia de mariposas": 2500,
  "carrito de shots con alcohol": 2800,
  "carrito de shots sin alcohol": 2200,
  "niebla de piso": 3000,
  "lluvia metálica": 2000, // normalizado
  "scrapbook": 1300,
  "audio guest book": 2000,
  "letras gigantes": 400 // por letra
};

const CHISPEROS_TIERS = { 2:1000, 4:1500, 6:2000, 8:2500, 10:3000 };

const mediaMapping = {
  "cabina de fotos": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-2.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-3.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-4.jpg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-multicolor-2.jpeg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Blanca.mp4",
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Rosa.mp4",
      "http://cami-cam.com/wp-content/uploads/2025/03/cabina-multicolor.mp4"
    ]
  },
  "cabina 360": {
    images: ["http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg"],
    videos: ["http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Rosa.mp4"]
  },
  "lluvia de mariposas": { images: ["http://cami-cam.com/wp-content/uploads/2023/07/lluvia1.jpg"], videos: [] },
  "carrito de shots con alcohol": { images: ["http://cami-cam.com/wp-content/uploads/2023/07/carrito1.jpg"], videos: [] },
  "carrito de shots sin alcohol": { images: ["http://cami-cam.com/wp-content/uploads/2023/07/carrito1.jpg"], videos: [] },
  "niebla de piso": { images: ["http://cami-cam.com/wp-content/uploads/2023/07/niebla1.jpg"], videos: [] },
  "scrapbook": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-4.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-3.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-2.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-5.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-7.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-6.jpeg"
    ],
    videos: ["http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook.mp4"]
  },
  "audio guest book": { images: ["http://cami-cam.com/wp-content/uploads/2023/07/audio1.jpg"], videos: [] },
  "letras gigantes": {
    images: ["http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"],
    videos: ["http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"]
  },
  "chisperos": { images: ["http://cami-cam.com/wp-content/uploads/2023/07/chisperos1.jpg"], videos: [] }
};

const faqs = [
  { re: /hacen contrato|contrato/i, answer: "📄 ¡Sí! Una vez que se acredite el anticipo, llenamos el contrato y te enviamos una foto." },
  { re: /con cuanto tiempo separo mi fecha|separar/i, answer: "⏰ Puedes separar tu fecha en cualquier momento, siempre y cuando esté disponible." },
  { re: /2026/i, answer: "📆 Claro, tenemos agenda para 2025 y 2026. ¡Consulta sin compromiso!" },
  { re: /flete|cu[aá]nto se cobra de flete/i, answer: "🚚 El flete varía según la ubicación. Compárteme tu salón y lo calculamos." },
  { re: /c[oó]mo reviso si tienen mi fecha|disponible/i, answer: "🔎 Dime la fecha de tu evento y reviso disponibilidad al momento." },
  { re: /ubicaci[oó]n|d[oó]nde est[aá]n|ubican|oficinas/i, answer: "📍 Col. Independencia, Monterrey. Cubrimos hasta 30 km a la redonda." },
  { re: /pago|m[eé]todo de pago|tarjeta|efectivo/i, answer: "💳 Aceptamos transferencia, depósito y efectivo." },
  { re: /servicios|que servicios manejas/i, answer: "🎉 Estos son nuestros servicios:", image: "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg" },
  { re: /anticipo|separ(a|o)r/i, answer: "⏰ Separa con $500, el resto el día del evento. Tras acreditarse te envío contrato firmado." },
  { re: /dep[oó]sito|transferencia|datos/i, answer: "722969010494399671", image: "http://cami-cam.com/wp-content/uploads/2025/03/Datos-Transferencia-1.jpeg" },
  { re: /cabina de fotos|que incluye la cabina de fotos/i, answer: "📸 Cabina de fotos: 3h de servicio, iluminación profesional, fondo personalizado y props.", images: mediaMapping["cabina de fotos"].images, videos: mediaMapping["cabina de fotos"].videos },
  { re: /scrapbook|que es el scrapbook/i, answer: "📚 Scrapbook: tus invitados pegan una foto y escriben un mensaje. Recuerdo único.", images: mediaMapping["scrapbook"].images, videos: mediaMapping["scrapbook"].videos }
];

/* =========================
   Context helpers
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
   Normalización de servicios
========================= */
function normalizeServicesInput(raw) {
  // Por qué: reducir ambigüedad y mapear sinónimos a llaves de PRICES
  let s = " " + raw + " ";
  s = s.replace(/\s+/g, " ");

  // cantidades delante -> detrás
  s = s.replace(/\b(\d+)\s+letras(?:\s*gigantes)?\b/gi, 'letras gigantes $1');
  s = s.replace(/\b(\d+)\s+chisperos?\b/gi, 'chisperos $1');

  // lluvia metálica (variantes)
  s = s.replace(/lluvia m[eé]talica/gi, 'lluvia metálica');

  // carrito de shots sin variante → marcar para preguntar luego (no removemos texto aquí)
  // cabina no específica
  // se maneja a nivel flujo

  return s.trim();
}

/* =========================
   FAQs
========================= */
async function handleFAQs(from, userMessage) {
  for (const f of faqs) {
    if (f.re.test(userMessage)) {
      await sendWhatsAppMessage(from, f.answer + " 😊");
      if (f.image) await sendImageMessage(from, f.image);
      if (f.images?.length) for (const img of f.images) await sendImageMessage(from, img);
      if (f.videos?.length) for (const vid of f.videos) await sendWhatsAppVideo(from, vid);
      return true;
    }
  }
  return false;
}

/* =========================
   Sugerencias upsell
========================= */
function checkUpsellSuggestions(context) {
  const s = normalizeText(context.serviciosSeleccionados);
  const has = (x)=> s.includes(normalizeText(x));
  const available = ["cabina de fotos","cabina 360","lluvia de mariposas","carrito de shots con alcohol","carrito de shots sin alcohol","niebla de piso","lluvia metálica","scrapbook","audio guest book","letras gigantes","chisperos"];
  let count = 0; available.forEach(a=>{ if (has(a)) count++; });

  const suggestions = [];
  if (has("cabina de fotos") && !has("scrapbook")) {
    suggestions.push("👉 Sugerencia: agrega *Scrapbook* para un recuerdo increíble. Escribe: *Agregar scrapbook*");
    context.suggestScrapbookVideo = true;
    context.upsellSuggested = true;
  } else if (count === 2) {
    suggestions.push("¡Tip! Con 3 servicios obtienes 30% y con 4, 40% de descuento.");
    context.upsellSuggested = true;
  }
  return suggestions;
}

/* =========================
   Cotizador
========================= */
function calculateQuotation(servicesCSV) {
  const items = servicesCSV.split(",").map(x=>x.trim()).filter(Boolean);
  let subtotal = 0, serviceCount = 0;
  const details = [];
  const recognized = new Set();

  for (const svc of items) {
    // chisperos N
    const mCh = svc.match(/^chisperos(?:\s+(\d+))?$/i);
    if (mCh) {
      const qty = Number(mCh[1]||0);
      if (!qty) return { error:true, needsInput:"chisperos", details:["🔸 *Chisperos*: indica cantidad (par)."], subtotal:0, discountPercent:0, discountAmount:0, total:0, servicesRecognized:[] };
      if (qty % 2 !== 0 || !CHISPEROS_TIERS[qty]) { details.push(`🔸 Chisperos: cantidad inválida (${qty})`); continue; }
      subtotal += CHISPEROS_TIERS[qty];
      serviceCount++; recognized.add("chisperos");
      details.push(`🔸 *${qty} Chisperos*: $${CHISPEROS_TIERS[qty].toLocaleString()}`);
      continue;
    }

    // letras gigantes N
    const mL = svc.match(/^letras(?:\s*gigantes)?(?:\s+(\d+))?$/i);
    if (mL) {
      const qty = Number(mL[1]||0);
      if (!qty) { details.push("🔸 *Letras gigantes*: falta cantidad"); continue; }
      const price = qty * PRICES["letras gigantes"];
      subtotal += price; serviceCount++; recognized.add("letras gigantes");
      details.push(`🔸 *${qty} Letras Gigantes* (5h): $${price.toLocaleString()}`);
      continue;
    }

    // lluvia metálica (normalizada)
    if (/^lluvia m[eé]talica|^lluvia metálica$/i.test(svc)) {
      subtotal += PRICES["lluvia metálica"]; serviceCount++; recognized.add("lluvia metálica");
      details.push(`🔸 *Lluvia Metálica*: $${PRICES["lluvia metálica"].toLocaleString()}`);
      continue;
    }

    // carrito de shots variantes exactas
    if (/^carrito de shots (con|sin) alcohol$/i.test(svc)) {
      const key = svc.toLowerCase();
      subtotal += PRICES[key]; serviceCount++; recognized.add(key);
      details.push(`🔸 *${key.replace(/\b\w/g,c=>c.toUpperCase())}*: $${PRICES[key].toLocaleString()}`);
      continue;
    }

    // cabina de fotos / cabina 360 / otros simples
    const key = Object.keys(PRICES).find(k => k === svc.toLowerCase());
    if (key) {
      const isCabina = key === "cabina de fotos" || key === "cabina 360";
      const name = isCabina ? `${key} (3 horas)` : key;
      subtotal += PRICES[key]; serviceCount++; recognized.add(key);
      details.push(`🔸 *${name.charAt(0).toUpperCase()+name.slice(1)}*: $${PRICES[key].toLocaleString()}`);
      continue;
    }

    // no reconocido
    details.push(`🔸 ${svc}: servicio no reconocido`);
  }

  // descuentos
  let discountPercent = 0;
  if (serviceCount === 1) {
    const only = Array.from(recognized)[0] || "";
    if (only.startsWith("letras gigantes")) {
      // No cae aquí porque recognized guarda sin cantidad
      discountPercent = 10;
    } else if (only === "chisperos") {
      discountPercent = 0;
    } else {
      discountPercent = 10;
    }
  } else if (serviceCount === 2) discountPercent = 25;
  else if (serviceCount === 3) discountPercent = 30;
  else if (serviceCount >= 4) discountPercent = 40;

  const discountAmount = subtotal * (discountPercent/100);
  const total = subtotal - discountAmount;

  return {
    error:false,
    subtotal, discountPercent, discountAmount, total,
    details,
    servicesRecognized: Array.from(recognized)
  };
}

async function actualizarCotizacion(from, context, header = "*PAQUETE PERSONALIZADO*") {
  const cot = calculateQuotation(context.serviciosSeleccionados);
  const detalles = `${header}\n\n${cot.details.join("\n")}`;
  const resumen = `Subtotal: $${cot.subtotal.toLocaleString()}\nDescuento (${cot.discountPercent}%): -$${cot.discountAmount.toLocaleString()}\n\n*TOTAL: $${cot.total.toLocaleString()}*`;

  // media por servicio (una sola vez por servicio)
  for (const s of cot.servicesRecognized) {
    if (!mediaMapping[s]) continue;
    context.mediosEnviados = context.mediosEnviados || new Set();
    if (context.mediosEnviados.has(s)) continue;
    for (const img of (mediaMapping[s].images||[])) { await sendImageMessage(from, img); await delay(500); }
    for (const vid of (mediaMapping[s].videos||[])) { await sendWhatsAppVideo(from, vid); await delay(500); }
    context.mediosEnviados.add(s);
  }

  await sendMessageWithTypingWithState(from, detalles, 1000, context.estado);
  await delay(500);
  await sendMessageWithTypingWithState(from, resumen, 1000, context.estado);

  const upsell = checkUpsellSuggestions(context);
  if (upsell.length) {
    await delay(500);
    await sendMessageWithTypingWithState(from, upsell.join("\n"), 1000, context.estado);
    if (context.suggestScrapbookVideo) {
      const v = mediaMapping["scrapbook"]?.videos?.[0];
      if (v) await sendWhatsAppVideo(from, v);
      context.suggestScrapbookVideo = false;
    }
  }

  const titulo = context.paqueteRecomendado?.paquete || "Paquete Sugerido";
  await delay(500);
  await sendInteractiveMessage(from, `¿Continuamos con *${titulo}* o con tu *Paquete Personalizado*?`, [
    { id: "si_me_interesa_sugerido", title: titulo },
    { id: "si_me_interesa", title: "PAQ. PERSONALIZADO" },
    { id: "modificar_cotizacion", title: "Modificar Cotización" }
  ]);

  context.estado = "EsperandoDudas";
}

/* =========================
   Flujos de evento/paquete
========================= */
function getOtherEventPackageRecommendation(msgLower) {
  if (/cumplea|birthday|\b\d+\b|numero|n[uú]meros/.test(msgLower)) {
    return {
      paquete: "PAQUETE NÚMEROS",
      descripcion: "Números gigantes 1.20m, LED programable. Incluye 2 números por $600 + flete.",
      media: mediaMapping["letras gigantes"]
    };
  }
  if (/revelaci[oó]n|baby|oh baby|girl|boy/.test(msgLower)) {
    return {
      paquete: "PAQUETE REVELACIÓN",
      descripcion: "Letras decorativas para reveal (BABY / OH BABY / GIRL BOY).",
      media: mediaMapping["letras gigantes"]
    };
  }
  if (/propuesta|c[aá]sate|marry me|pedir matrimonio/.test(msgLower)) {
    return {
      paquete: "PAQUETE MARRY ME",
      descripcion: "Letras románticas MARRY ME para una propuesta inolvidable.",
      media: mediaMapping["letras gigantes"]
    };
  }
  if (/graduaci[oó]n|grad|class|gen\b/.test(msgLower)) {
    return {
      paquete: "PAQUETE GRADUACIÓN",
      descripcion: "Letras para GRAD/CLASS (e.g., CLASS 2025).",
      media: mediaMapping["letras gigantes"]
    };
  }
  return {
    paquete: "OTRO PAQUETE",
    descripcion: "Cuéntame un poco más para recomendarte la mejor opción.",
    media: { images: ["http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg"], videos: [] }
  };
}

async function handleTipoEvento(from, msgLower, context) {
  if (msgLower.includes("boda") || msgLower.includes("evento_boda")) {
    context.tipoEvento = "Boda";
    context.paqueteRecomendado = { paquete: "PAQUETE WEDDING" };

    await sendMessageWithTypingWithState(from, "¡Felicidades por tu boda! ❤️ Hagamos un día inolvidable.", 500, context.estado);
    await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/04/Servicios.png");
    await sendMessageWithTypingWithState(from, "¿Armas tu paquete o ves el *Paquete WEDDING*?", 500, context.estado);
    await sendInteractiveMessage(from, "Elige una opción:", [
      { id: "armar_paquete", title: "Armar mi paquete" },
      { id: "paquete_wedding", title: "Paquete WEDDING" }
    ]);
    context.estado = "EsperandoConfirmacionPaquete";
    return true;
  }

  if (msgLower.includes("xv") || msgLower.includes("quince")) {
    context.tipoEvento = "XV";
    context.paqueteRecomendado = { paquete: "PAQUETE MIS XV" };

    await sendMessageWithTypingWithState(from, "¡Felicidades! ✨ Hagamos unos XV espectaculares.", 500, context.estado);
    await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/04/Servicios.png");
    await sendMessageWithTypingWithState(from, "¿Armas tu paquete o ves *Paquete MIS XV*?", 500, context.estado);
    await sendInteractiveMessage(from, "Elige una opción:", [
      { id: "armar_paquete", title: "Armar mi paquete" },
      { id: "paquete_xv", title: "Paquete MIS XV" }
    ]);
    context.estado = "EsperandoConfirmacionPaquete";
    return true;
  }

  const rec = getOtherEventPackageRecommendation(msgLower);
  context.paqueteRecomendado = rec;

  await sendMessageWithTypingWithState(from, "¡Excelente! ✨ Hagamos tu evento único.", 500, context.estado);
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/04/Servicios.png");
  await sendMessageWithTypingWithState(from, `¿Armas tu paquete o ves *${rec.paquete}*?`, 500, context.estado);
  await sendInteractiveMessage(from, "Elige una opción:", [
    { id: "armar_paquete", title: "Armar mi paquete" },
    { id: "paquete_otro", title: rec.paquete }
  ]);
  context.estado = "EsperandoConfirmacionPaquete";
  return true;
}

/* =========================
   OpenAI fallback
========================= */
function construirContexto() {
  return `
Eres un agente de ventas de "Camicam Photobooth".
Servicios y precios:
- Cabina de fotos: $3,500
- Cabina 360: $3,500
- Lluvia de mariposas: $2,500
- Carrito de shots con alcohol: $2,800
- Carrito de shots sin alcohol: $2,200
- Letras gigantes: $400 c/u
- Niebla de piso: $3,000
- Lluvia metálica: $2,000
- Scrapbook: $1,300
- Audio Guest Book: $2,000
- Chisperos (pares): 2=$1,000; 4=$1,500; 6=$2,000; 8=$2,500; 10=$3,000
Zona: centro de Monterrey y área metropolitana (25–30 km).
Responde breve, profesional y cercana.
`.trim();
}

async function aiShortReply(query) {
  const prompt = `${construirContexto()}\n\nCliente: "${query}"\nResponde breve y clara (máx 2 líneas).`;
  const key = normalizeText(prompt);
  const cached = responseCache.get(key);
  if (cached) return cached;
  const resp = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "Eres un asesor de ventas amable. Responde breve, natural y útil." },
      { role: "user", content: prompt }
    ],
    temperature: 0.6,
    max_tokens: 100
  });
  const out = resp.choices?.[0]?.message?.content?.trim() || "Con gusto te apoyo. ¿Podrías darme un poco más de detalle?";
  responseCache.set(key, out);
  return out;
}


/* =========================
   Handlers de flujo principal - VERSIÓN ORGANIZADA Y MODULAR
========================= */

// Función auxiliar para solicitar fecha (reutilizable)
async function solicitarFecha(from, context, mensajePersonalizado = null) {
  const mensaje = mensajePersonalizado || 
    "De acuerdo. Indícame la fecha de tu evento.\n\nFormato: DD/MM/AAAA o '20 de marzo 2025' 📆";
  
  await sendMessageWithTypingWithState(from, mensaje, 500, context.estado);
  context.estado = "EsperandoFecha";
  await saveContext(from, context);
}

/* ========================== */
/* 1. HANDLER PRINCIPAL */
/* ========================== */

async function handleUserMessage(from, userText, messageLower) {
  const context = await ensureContext(from);

  /* ==================== */
  /* DETECCIÓN INICIAL */
  /* ==================== */
  
  // 1.1 Flujo específico para "Info Paquete Mis XV" (ALTA PRIORIDAD)
  if (messageLower.includes("info paquete mis xv")) {
    await handlePaqueteMisXVFlow(from, context);
    return true;
  }

  // 1.2 FAQs (solo si no interrumpe flujos sensibles)
  const estadosSensibles = [
    "EsperandoServicios", "EsperandoFecha", "EsperandoLugar", 
    "EsperandoCantidadLetras", "EsperandoCantidadChisperos", "EsperandoDudas",
    "EsperandoTipoCabina", "ConfirmarAgregarCabinaCambio", 
    "EsperandoTipoCarritoShots", "ConfirmarAgregarCarritoShotsCambio",
    "EsperandoFechaPaqueteXV", "EsperandoDecisionPaqueteXV"
  ];
  
  if (!estadosSensibles.includes(context.estado)) {
    if (await handleFAQs(from, userText)) return true;
  }

  /* ========================== */
  /* MANEJO POR ESTADO ACTUAL */
  /* ========================== */
  
  switch (context.estado) {
    
    /* ==================== */
    /* FLUJO PAQUETE MIS XV */
    /* ==================== */
    case "EsperandoFechaPaqueteXV":
      return await handleFechaPaqueteXV(from, userText, context);

    case "EsperandoDecisionPaqueteXV":
      return await handleDecisionPaqueteXV(from, userText, messageLower, context);

    /* ======================== */
    /* FLUJO PRINCIPAL DEL BOT */
    /* ======================== */
    
    // Estados iniciales
    case "Contacto Inicial":
      return await handleContactoInicial(from, context);

    case "EsperandoTipoEvento":
    case "EsperandoSubtipoOtroEvento":
      return await handleTipoEvento(from, messageLower, context);

    case "EsperandoConfirmacionPaquete":
      return await handleConfirmacionPaquete(from, messageLower, context);

    // Estados de cotización
    case "EsperandoServicios":
      return await handleServicios(from, userText, messageLower, context);

    case "EsperandoCantidadLetras":
      return await handleCantidadLetras(from, userText, context);

    case "EsperandoCantidadChisperos":
      return await handleCantidadChisperos(from, userText, context);

    case "EsperandoTipoCabina":
      return await handleTipoCabina(from, messageLower, context);

    case "ConfirmarAgregarCabinaCambio":
      return await handleConfirmarCabinaCambio(from, messageLower, context);

    case "EsperandoTipoCarritoShots":
      return await handleTipoCarritoShots(from, messageLower, context);

    case "ConfirmarAgregarCarritoShotsCambio":
      return await handleConfirmarCarritoShotsCambio(from, messageLower, context);

    case "EsperandoDudas":
      return await handleDudas(from, userText, messageLower, context);

    case "ConfirmandoLetras":
      return await handleConfirmandoLetras(from, messageLower, context);

    // Estados de finalización
    case "EsperandoFecha":
      return await handleFecha(from, userText, context);

    case "EsperandoLugar":
      return await handleLugar(from, userText, context);

    case "Finalizado":
      return await handleFinalizado(from, context, userText);

    default:
      return await handleEstadoDesconocido(from, context, userText);
  }
}

/* ========================== */
/* 2. HANDLERS FLUJO PAQUETE MIS XV */
/* ========================== */

async function handleDecisionPaqueteXV(from, userText, messageLower, context) {
  if (messageLower.includes("confirmar_paquete_xv") || 
      normalizeText(userText).includes("paquete mis xv") ||
      normalizeText(userText).includes("si me interesa")) {
    
    context.estado = "EsperandoLugar";
    await saveContext(from, context);
    await sendMessageWithTypingWithState(
      from,
      "Para continuar, necesito el nombre de tu salón o lugar del evento 🏢",
      500,
      context.estado
    );
    return true;
  }
  
  if (messageLower.includes("armar_paquete") || normalizeText(userText).includes("armar mi paquete")) {
    context.estado = "EsperandoServicios";
    await saveContext(from, context);
    await sendMessageWithTypingWithState(
      from,
      "Perfecto. Escribe los servicios separados por comas.\nEj.: cabina de fotos, cabina 360, 6 letras gigantes, 4 chisperos, carrito de shots con alcohol, lluvia metálica, niebla de piso, scrapbook, audio guest book",
      500,
      context.estado
    );
    return true;
  }
  
  // Si no entendió, repetir opciones
  await sendMessageWithTypingWithState(from, "No entendí tu respuesta. Elige una opción:", 200, context.estado);
  await sendInteractiveMessage(from, "Elige:", [
    { id: "confirmar_paquete_xv", title: "✅ PAQUETE MIS XV" },
    { id: "armar_paquete", title: "🎛️ ARMAR MI PAQUETE" }
  ]);
  return true;
}

/* ========================== */
/* 3. HANDLERS ESTADOS INICIALES */
/* ========================== */

async function handleContactoInicial(from, context) {
  await sendMessageWithTypingWithState(from, "¡Hola! 👋 Soy *Cami-Bot*, a tus órdenes.", 200, "Contacto Inicial");
  await sendMessageWithTypingWithState(from, "¿Qué tipo de evento tienes? (Boda, XV, cumpleaños...)", 300, "Contacto Inicial");
  context.estado = "EsperandoTipoEvento";
  await saveContext(from, context);
  return true;
}

async function handleConfirmacionPaquete(from, messageLower, context) {
  // Manejo de botones de paquetes
  const handlers = {
    "paquete_wedding": async () => {
      await sendMessageWithTypingWithState(from, "Información del *Paquete WEDDING*:", 300, context.estado);
      await sendWhatsAppVideo(from, mediaMapping["cabina de fotos"].videos[0]);
      for (const img of mediaMapping["cabina de fotos"].images.slice(0,4)) { 
        await sendImageMessage(from, img); 
        await delay(300); 
      }
      await sendInteractiveMessage(from, "¿Te interesa el *PAQUETE WEDDING* o armas tu paquete?", [
        { id: "si_me_interesa", title: "PAQUETE WEDDING" },
        { id: "armar_paquete", title: "Armar mi paquete" }
      ]);
    },
    
    "paquete_xv": async () => {
      await sendMessageWithTypingWithState(from, "Información del *Paquete Mis XV*:", 300, context.estado);
      await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/04/Paq-Mis-XV-Inform.jpg");
      await sendWhatsAppMessage(from, "Visita nuestro sitio para más detalles:");
      await sendWhatsAppMessage(from, "https://cami-cam.com/paquete-mis-xv/");
      await sendWhatsAppVideo(from, mediaMapping["cabina de fotos"].videos[0]);
      for (const img of mediaMapping["cabina de fotos"].images.slice(0,4)) { 
        await sendImageMessage(from, img); 
        await delay(300); 
      }
      await sendInteractiveMessage(from, "¿Te interesa *PAQUETE MIS XV* o armas tu paquete?", [
        { id: "si_me_interesa", title: "PAQUETE MIS XV" },
        { id: "armar_paquete", title: "Armar mi paquete" }
      ]);
    },
    
    "paquete_otro": async () => {
      const rec = context.paqueteRecomendado;
      if (rec) {
        for (const img of rec.media?.images || []) { 
          await sendImageMessage(from, img); 
          await delay(250); 
        }
        for (const vid of rec.media?.videos || []) { 
          await sendWhatsAppVideo(from, vid); 
          await delay(250); 
        }
        await sendMessageWithTypingWithState(from, `🎉 *${rec.paquete}*\n${rec.descripcion}`, 300, context.estado);
        await sendInteractiveMessage(from, `¿Te interesa *${rec.paquete}* o armas tu paquete?`, [
          { id: "si_me_interesa", title: rec.paquete },
          { id: "armar_paquete", title: "Armar mi paquete" }
        ]);
      } else {
        await sendWhatsAppMessage(from, "No encuentro una recomendación para este evento. Intentemos armar tu paquete.");
        context.estado = "EsperandoServicios";
      }
    },
    
    "si_me_interesa_sugerido": async () => {
      await solicitarFecha(from, context);
    },
    
    "si_me_interesa": async () => {
      await solicitarFecha(from, context);
    },
    
    "modificar_cotizacion": async () => {
      context.estado = "EsperandoDudas";
      await sendWhatsAppMessage(from, "Para modificar:\n\n*Agregar* <servicio>\n*Quitar* <servicio>");
    },
    
    "armar_paquete": async () => {
      context.estado = "EsperandoServicios";
      await sendMessageWithTypingWithState(
        from,
        "Perfecto. Escribe los servicios separados por comas.\nEj.: cabina de fotos, cabina 360, 6 letras gigantes, 4 chisperos, carrito de shots con alcohol, lluvia metálica, niebla de piso, scrapbook, audio guest book",
        500,
        context.estado
      );
    }
  };

  const handler = handlers[messageLower];
  if (handler) {
    await handler();
    await saveContext(from, context);
    return true;
  }

  // Si no es un botón reconocido
  await sendMessageWithTypingWithState(from, "No entendí tu respuesta. Elige una opción:", 200, context.estado);
  await sendInteractiveMessage(from, "Elige:", [
    { id: "si_me_interesa", title: "Sí, me interesa" },
    { id: "armar_paquete", title: "Armar mi paquete" }
  ]);
  return true;
}

/* ========================== */
/* 4. HANDLERS COTIZACIÓN */
/* ========================== */

async function handleServicios(from, userText, messageLower, context) {
  let servicios = userText;

  if (messageLower.includes("agregar")) {
    const toAdd = normalizeServicesInput(userText.replace(/agregar/i, "").trim());
    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + toAdd;
    await sendWhatsAppMessage(from, `✅ Agregado: ${toAdd}`);
  } else if (messageLower.includes("quitar")) {
    const toRemove = userText.replace(/quitar/i,"").trim().toLowerCase();
    context.serviciosSeleccionados = context.serviciosSeleccionados
      .split(",").map(s=>s.trim())
      .filter(s=>!normalizeText(s).includes(normalizeText(toRemove)))
      .join(", ");
    await sendWhatsAppMessage(from, `✅ Quitado: ${toRemove}`);
  } else {
    servicios = normalizeServicesInput(userText);
    context.serviciosSeleccionados = servicios;
  }

  // Flags de faltantes
  const sAll = context.serviciosSeleccionados;
  const faltaLetras = /(letras|letras gigantes)(?!\s*\d+)/i.test(sAll);
  const faltaChisperos = /chisperos(?!\s*\d+)/i.test(sAll);
  const faltaShots = /carrito de shots(?!\s*(con|sin)\s*alcohol)/i.test(sAll);
  const faltaCabinaTipo = /(^|,)\s*cabina\s*(,|$)/i.test(sAll);

  if (faltaCabinaTipo) {
    context.estado = "EsperandoTipoCabina";
    context.serviciosSeleccionados = sAll.split(",").map(x=>x.trim()).filter(x=>!/^cabina$/i.test(x)).join(", ");
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¿Deseas *Cabina de fotos* o *Cabina 360*?");
    return true;
  }

  if (faltaLetras) {
    context.estado = "EsperandoCantidadLetras";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
    return true;
  }

  if (faltaChisperos) {
    context.estado = "EsperandoCantidadChisperos";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? (2, 4, 6, 8, 10…) 🔥");
    return true;
  }

  if (faltaShots) {
    context.estado = "EsperandoTipoCarritoShots";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas *CON* alcohol o *SIN* alcohol? 🍹");
    return true;
  }

  await actualizarCotizacion(from, context);
  return true;
}

async function handleCantidadLetras(from, userText, context) {
  const cant = parseInt(userText, 10);
  if (!Number.isFinite(cant) || cant <= 0) {
    await sendWhatsAppMessage(from, "Ingresa un número válido para letras.");
    return true;
  }
  
  let arr = context.serviciosSeleccionados.split(",").map(s=>s.trim());
  let found = false;
  arr = arr.map(s => {
    if (/^letras(\s*gigantes)?$/i.test(s)) { found = true; return `letras gigantes ${cant}`; }
    return s;
  });
  if (!found) arr.push(`letras gigantes ${cant}`);
  context.serviciosSeleccionados = arr.join(", ");
  
  await sendWhatsAppMessage(from, `✅ Agregadas ${cant} letras gigantes.`);
  await actualizarCotizacion(from, context);
  return true;
}

async function handleCantidadChisperos(from, userText, context) {
  const cant = parseInt(userText, 10);
  if (!Number.isFinite(cant) || cant <= 0 || cant % 2 !== 0) {
    await sendWhatsAppMessage(from, "Cantidad inválida. Debe ser un número par: 2, 4, 6, 8, 10…");
    return true;
  }
  
  const re = /chisperos(\s*\d+)?/i;
  if (re.test(context.serviciosSeleccionados))
    context.serviciosSeleccionados = context.serviciosSeleccionados.replace(re, `chisperos ${cant}`);
  else
    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + `chisperos ${cant}`;

  await sendWhatsAppMessage(from, `✅ Agregados ${cant} chisperos.`);
  await actualizarCotizacion(from, context);
  return true;
}

async function handleTipoCabina(from, messageLower, context) {
  const resp = messageLower.includes("360") || messageLower.includes("giratoria") ? "cabina 360"
             : messageLower.includes("fotos") || messageLower.includes("inflable") || messageLower.includes("cabina de fotos") ? "cabina de fotos"
             : null;
  
  if (!resp) { 
    await sendWhatsAppMessage(from, "Responde 'fotos' o '360', por favor."); 
    return true; 
  }

  const hasResp = normalizeText(context.serviciosSeleccionados).includes(normalizeText(resp));
  const other = resp === "cabina de fotos" ? "cabina 360" : "cabina de fotos";

  if (hasResp) {
    if (normalizeText(context.serviciosSeleccionados).includes(normalizeText(other))) {
      await sendWhatsAppMessage(from, "Ya tienes ambas cabinas en tu cotización.");
      context.estado = "EsperandoDudas";
      await saveContext(from, context);
      return true;
    } else {
      context.estado = "ConfirmarAgregarCabinaCambio";
      context.cabinaToAgregar = other;
      await saveContext(from, context);
      await sendWhatsAppMessage(from, `Ya tienes ${resp}. ¿Deseas agregar también ${other}? (sí/no)`);
      return true;
    }
  } else {
    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + resp;
    await sendWhatsAppMessage(from, `✅ Seleccionada ${resp}.`);
    await actualizarCotizacion(from, context);
    return true;
  }
}

async function handleConfirmarCabinaCambio(from, messageLower, context) {
  if (/(^|\s)si($|\s)|s[ií]/i.test(messageLower)) {
    const v = context.cabinaToAgregar;
    if (!normalizeText(context.serviciosSeleccionados).includes(normalizeText(v))) {
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + v;
      await sendWhatsAppMessage(from, `✅ Agregada ${v}.`);
      await actualizarCotizacion(from, context, "¡Paquete actualizado!");
    }
  } else {
    await sendWhatsAppMessage(from, "Entendido. Mantendré una sola cabina.");
  }
  context.estado = "EsperandoDudas";
  await saveContext(from, context);
  return true;
}

async function handleTipoCarritoShots(from, messageLower, context) {
  const resp = messageLower.includes("sin") ? "carrito de shots sin alcohol"
             : messageLower.includes("con") ? "carrito de shots con alcohol"
             : null;
  
  if (!resp) { 
    await sendWhatsAppMessage(from, "Responde 'con' o 'sin' alcohol, por favor."); 
    return true; 
  }

  if (normalizeText(context.serviciosSeleccionados).includes(normalizeText(resp))) {
    const other = resp.includes("sin") ? "carrito de shots con alcohol" : "carrito de shots sin alcohol";
    if (normalizeText(context.serviciosSeleccionados).includes(normalizeText(other))) {
      await sendWhatsAppMessage(from, "Ya tienes ambas variantes en la cotización. Si deseas cambios, avísame.");
      context.estado = "EsperandoDudas";
      await saveContext(from, context);
      return true;
    } else {
      context.estado = "ConfirmarAgregarCarritoShotsCambio";
      context.carritoShotsToAgregar = other;
      await saveContext(from, context);
      await sendWhatsAppMessage(from, `Ya tienes ${resp}. ¿Deseas agregar también ${other}? (sí/no)`);
      return true;
    }
  } else {
    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + resp;
    await sendWhatsAppMessage(from, `✅ Seleccionado ${resp}.`);
    await actualizarCotizacion(from, context);
    return true;
  }
}

async function handleConfirmarCarritoShotsCambio(from, messageLower, context) {
  if (/(^|\s)si($|\s)|s[ií]/i.test(messageLower)) {
    const v = context.carritoShotsToAgregar;
    if (!normalizeText(context.serviciosSeleccionados).includes(normalizeText(v))) {
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + v;
      await sendWhatsAppMessage(from, `✅ Agregado ${v}.`);
      await actualizarCotizacion(from, context, "¡Paquete actualizado!");
    }
  } else {
    await sendWhatsAppMessage(from, "Entendido. Mantengo una sola variante.");
  }
  context.estado = "EsperandoDudas";
  await saveContext(from, context);
  return true;
}

async function handleDudas(from, userText, messageLower, context) {
  // Manejo de nombre → contar letras
  if (messageLower.includes("ocupo el nombre de")) {
    context.nombreCliente = userText.replace(/ocupo el nombre de/i,"").trim();
    const n = contarLetras(context.nombreCliente);
    context.estado = "ConfirmandoLetras";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, `Entiendo que ocupas ${n} letras gigantes. ¿Es correcto? (sí/no)`);
    return true;
  }

  if (messageLower.includes("quitar")) {
    const catalog = ["cabina de fotos","cabina 360","lluvia de mariposas","carrito de shots con alcohol","carrito de shots sin alcohol","niebla de piso","lluvia metálica","scrapbook","audio guest book","letras gigantes","chisperos"];
    let target = null;
    for (const k of catalog) {
      if (k==="letras gigantes" && /letras/i.test(messageLower)) { target="letras gigantes"; break; }
      if (k==="chisperos" && /(chispero|chisperos)/i.test(messageLower)) { target="chisperos"; break; }
      if (messageLower.includes(k)) { target=k; break; }
    }
    if (!target) { 
      await sendWhatsAppMessage(from, "No entendí qué quitar. Usa: *Quitar <servicio>*"); 
      return true; 
    }

    const mQty = userText.match(/(?:quitar|qu[ií]tame)\s*(\d+)/i);
    if (mQty && (target==="letras gigantes" || target==="chisperos")) {
      const re = new RegExp(`${target}\\s*(\\d+)`,"i");
      const mAct = context.serviciosSeleccionados.match(re);
      const current = mAct ? parseInt(mAct[1],10) : 0;
      const delta = parseInt(mQty[1],10);
      if (delta > current) { 
        await sendWhatsAppMessage(from, `No puedes quitar más de ${current}.`); 
        return true; 
      }
      const next = current - delta;
      if (target==="chisperos" && next>0 && next%2!==0) {
        await sendWhatsAppMessage(from, "Los chisperos deben ser en pares. No actualicé la cotización.");
        return true;
      }
      if (next>0) {
        context.serviciosSeleccionados = context.serviciosSeleccionados.replace(re, `${target} ${next}`);
        await sendWhatsAppMessage(from, `✅ Quitados ${delta}. Ahora tienes ${next}.`);
      } else {
        context.serviciosSeleccionados = context.serviciosSeleccionados
          .split(",").map(s=>s.trim()).filter(s=>!normalizeText(s).startsWith(normalizeText(target))).join(", ");
        await sendWhatsAppMessage(from, `✅ Eliminado *${target}* por completo.`);
      }
    } else {
      context.serviciosSeleccionados = context.serviciosSeleccionados
        .split(",").map(s=>s.trim()).filter(s=>!normalizeText(s).startsWith(normalizeText(target))).join(", ");
      await sendWhatsAppMessage(from, `✅ ${target} eliminado.`);
    }
    await actualizarCotizacion(from, context, "¡Paquete actualizado!");
    return true;
  }

  if (messageLower.includes("agregar")) {
    // tratamiento especial de carrito de shots
    if (messageLower.includes("agregar carrito de shots") && !/con alcohol|sin alcohol/i.test(messageLower)) {
      context.estado = "EsperandoTipoCarritoShots";
      await saveContext(from, context);
      await sendWhatsAppMessage(from, "¿El carrito lo deseas CON alcohol o SIN alcohol? 🍹");
      return true;
    }
    if (messageLower.includes("agregar cabina") && !/cabina de fotos|cabina 360/i.test(messageLower)) {
      context.estado = "EsperandoTipoCabina";
      await saveContext(from, context);
      await sendWhatsAppMessage(from, "¿Cabina de fotos o Cabina 360?");
      return true;
    }

    // genérico
    const clean = normalizeServicesInput(userText.replace(/agregar/i,"").trim());
    if (!clean) { 
      await sendWhatsAppMessage(from, "Indica qué agregar. Ej.: *Agregar cabina de fotos*"); 
      return true; 
    }
    const already = normalizeText(context.serviciosSeleccionados).includes(normalizeText(clean));
    if (already) { 
      await sendWhatsAppMessage(from, "Ya está en tu cotización."); 
      return true; 
    }

    // cantidad opcional
    const mQty = clean.match(/(letras(?:\s*gigantes)?|chisperos)\s+(\d+)/i);
    if (/^chisperos\b/i.test(clean) && !mQty) {
      context.estado = "EsperandoCantidadChisperos";
      await saveContext(from, context);
      await sendWhatsAppMessage(from, "¿Cuántos chisperos? (2, 4, 6, 8, 10…) 🔥");
      return true;
    }
    if (/^letras(?:\s*gigantes)?\b/i.test(clean) && !mQty) {
      context.estado = "EsperandoCantidadLetras";
      await saveContext(from, context);
      await sendWhatsAppMessage(from, "¿Cuántas letras? 🔠");
      return true;
    }

    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + clean;
    await sendWhatsAppMessage(from, `✅ Agregado: ${clean}`);
    await actualizarCotizacion(from, context);
    return true;
  }

  return false;
}

async function handleConfirmandoLetras(from, messageLower, context) {
  if (/(^|\s)si($|\s)|s[ií]/i.test(messageLower)) {
    const n = contarLetras(context.nombreCliente || "");
    const re = /letras gigantes\s*\d*/i;
    if (re.test(context.serviciosSeleccionados))
      context.serviciosSeleccionados = context.serviciosSeleccionados.replace(re, `letras gigantes ${n}`);
    else
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + `letras gigantes ${n}`;
    await sendWhatsAppMessage(from, `✅ Agregadas ${n} letras gigantes por el nombre '${context.nombreCliente}'.`);
    await actualizarCotizacion(from, context);
  } else {
    context.estado = "EsperandoCantidadLetras";
    await saveContext(from, context);
    await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
  }
  return true;
}

/* ========================== */
/* 5. HANDLERS FINALIZACIÓN */
/* ========================== */

async function handleFecha(from, userText, context) {
  if (!isValidDateExtended(userText)) {
    await sendMessageWithTypingWithState(from, "Formato inválido. Usa DD/MM/AAAA o '20 de mayo 2025'.", 200, context.estado);
    return true;
  }
  if (!isValidFutureDate(userText)) {
    await sendMessageWithTypingWithState(from, "Esa fecha ya pasó. Indica una futura.", 200, context.estado);
    return true;
  }
  if (!isWithinTwoYears(userText)) {
    await sendMessageWithTypingWithState(from, "Agenda abierta hasta 2 años. Indica otra fecha dentro de ese rango.", 200, context.estado);
    return true;
  }

  const ddmmyyyy = parseFecha(userText);
  const iso = toISO(ddmmyyyy);
  const ok = await checkAvailability(iso);
  const pretty = formatFechaEnEspanol(ddmmyyyy);

  if (!ok) {
    await sendMessageWithTypingWithState(from, `😔 Lo siento, *${pretty}* no está disponible.`, 200, context.estado);
    context.estado = "Finalizado";
    await saveContext(from, context);
    return true;
  }

  context.fecha = pretty;
  context.fechaISO = iso;
  context.estado = "EsperandoLugar";
  await saveContext(from, context);
  await sendMessageWithTypingWithState(from, `¡Perfecto!\n\n*${pretty}* DISPONIBLE 👏👏👏\n\n¿Nombre del salón? 🏢`, 200, "EsperandoLugar");
  return true;
}

async function handleLugar(from, userText, context) {
  context.lugar = userText;
  context.estado = "Finalizado";
  await saveContext(from, context);
  
  await sendMessageWithTypingWithState(from, "Para separar fecha solicitamos un anticipo de $500. El resto el día del evento.", 200, context.estado);
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/03/Datos-Transferencia-1.jpeg", "722969010494399671");
  await sendMessageWithTypingWithState(from, "Tras acreditarse, te pido datos, lleno contrato y te envío foto.", 200, context.estado);
  await sendWhatsAppMessage(from, "❓ Preguntas frecuentes:\nhttps://cami-cam.com/preguntas-frecuentes/");
  await sendMessageWithTypingWithState(from, "Cualquier duda, con confianza.\nSoy Gustavo González, a tus órdenes 😀", 200, context.estado);
  return true;
}

async function handleFinalizado(from, context, userText) {
  // Reactivar conversación si pasa mucho tiempo
  const lastActivity = new Date(context.lastActivity || context.fechaCreacion || new Date());
  const now = new Date();
  const daysDiff = (now - lastActivity) / (1000 * 60 * 60 * 24);
  
  if (daysDiff > 7) { // Reactivar después de 7 días
    await sendMessageWithTypingWithState(from, "¡Hola de nuevo! 👋 ¿En qué puedo ayudarte?", 200, context.estado);
    context.estado = "Contacto Inicial";
    await saveContext(from, context);
  }
  return true;
}

/* ========================== */
/* 6. HANDLER DE FALLBACK */
/* ========================== */

async function handleEstadoDesconocido(from, context, userText) {
  console.warn(`Estado no manejado: ${context.estado} para mensaje: ${userText}`);
  
  // Fallback AI para estados no manejados
  const ai = await aiShortReply(userText);
  await sendWhatsAppMessage(from, ai);
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
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(404);

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
          plataforma: "WhatsApp",
          remitente: from,
          mensaje: up.Location,
          tipo: "recibido_imagen"
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
          plataforma: "WhatsApp",
          remitente: from,
          mensaje: up.Location,
          tipo: "recibido_video"
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
        plataforma: "WhatsApp",
        remitente: from,
        mensaje: userMessage
      });
    } catch (e) {
      console.error("CRM texto error:", e.message);
    }

    const buttonReply = message?.interactive?.button_reply?.id || '';
    const listReply = message?.interactive?.list_reply?.id || '';
    const messageLower = normalizeText(buttonReply || listReply || userMessage);

    // Evita que "cabina de fotos" dispare FAQ cuando está en flujos clave
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

app.post('/upload_imagen', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió archivo en 'imagen'" });
    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) return res.status(500).json({ error: "Falta S3_BUCKET_NAME" });
    const nombreArchivo = `${uuidv4()}_${req.file.originalname}`;
    const up = await s3.upload({
      Bucket: bucket,
      Key: nombreArchivo,
      Body: req.file.buffer,
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


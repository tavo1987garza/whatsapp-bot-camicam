// file: index.js
// Node >=18, ES Modules en package.json ("type": "module")

import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
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
const COTIZADOR_URL = "https://cotizador-cami-cam-209c7f6faca2.herokuapp.com";

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

/* =========================
   Estado y cachés
========================= */
const responseCache = new NodeCache({ stdTTL: 3600 });
const antiDuplicateCache = new NodeCache({ stdTTL: 120 });

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

// Anti-duplicado
const shouldSkipDuplicateSend = (to, payloadKey) => {
  const key = `${to}::${payloadKey}`;
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
      params: { telefono: from },
      timeout: 5000
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
      context: {
        ...context,
        lastActivity: new Date().toISOString()
      }
    }, { timeout: 5000 });
  } catch (e) {
    console.error("Error saving context:", e.message);
  }
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
    const { data } = await axios.get(`${CRM_BASE_URL}/calendario/check`, { 
      params: { fecha: dateYYYYMMDD }, 
      timeout: 7000 
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
const WABA_HEADERS = {
  Authorization: `Bearer ${WABA_TOKEN}`,
  'Content-Type': 'application/json'
};

async function sendWhatsAppMessage(to, text) {
  try {
    if (shouldSkipDuplicateSend(to, `text:${text}`)) return;
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

async function sendMessageWithTypingWithState(from, message, delayMs, expectedState) {
  await delay(delayMs);
  const context = await getContext(from);
  if (context?.estado === expectedState) {
    await sendWhatsAppMessage(from, message);
  }
}

/* =========================
   Gestión de Contexto
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
   Flujos Principales
========================= */

// FLUJO PARA "INFO PAQUETE MIS XV"
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

// FLUJO PARA FECHA DEL PAQUETE XV
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

  // Mostrar información del paquete
  await sendMessageWithTypingWithState(from, `¡Perfecto!\n\n*${pretty}* DISPONIBLE 👏👏👏`, 200, context.estado);
  await delay(1000);
  await sendMessageWithTypingWithState(from, "El paquete que estamos promocionando es:", 200, context.estado);
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
    { id: "cotizador_personalizado", title: "🎛️ COTIZADOR WEB" }
  ]);
  
  context.estado = "EsperandoDecisionPaquete";
  await saveContext(from, context);
  return true;
}

// FLUJO COTIZADOR PERSONALIZADO
async function handleCotizadorPersonalizado(from, context) {
  context.estado = "EnviandoACotizador";
  await saveContext(from, context);
  
  await sendMessageWithTypingWithState(from, "¡Perfecto! Te explico cómo usar nuestro cotizador online:", 200, context.estado);
  await delay(1000);
  
  // ENVIAR VIDEO EXPLICATIVO (reemplaza con tu URL real)
  await sendWhatsAppVideo(from, "https://example.com/video-cotizador.mp4", "Video explicativo del cotizador");
  await delay(2000);
  
  await sendMessageWithTypingWithState(from, "🎛️ *COTIZADOR ONLINE*", 200, context.estado);
  await sendMessageWithTypingWithState(from, "En el cotizador podrás:", 200, context.estado);
  await sendMessageWithTypingWithState(from, "• Seleccionar servicios específicos", 200, context.estado);
  await sendMessageWithTypingWithState(from, "• Ver precios en tiempo real", 200, context.estado);
  await sendMessageWithTypingWithState(from, "• Personalizar tu paquete ideal", 200, context.estado);
  await delay(1000);
  
  await sendMessageWithTypingWithState(from, `🌐 Accede aquí: ${COTIZADOR_URL}`, 200, context.estado);
  await delay(1000);
  
  // Continuar con captura de datos
  context.estado = "EsperandoLugar";
  await saveContext(from, context);
  await solicitarLugar(from, context);
}

// SOLICITAR LUGAR
async function solicitarLugar(from, context) {
  await sendMessageWithTypingWithState(
    from,
    "Para continuar, necesito el nombre de tu salón o lugar del evento 🏢",
    500,
    context.estado
  );
}

// MANEJAR LUGAR Y FINALIZAR
async function handleLugar(from, userText, context) {
  context.lugar = userText;
  context.estado = "Finalizando";
  await saveContext(from, context);
  
  await sendMessageWithTypingWithState(from, "¡Excelente! Aquí tienes la información para separar tu fecha:", 200, context.estado);
  await delay(1000);
  
  await sendMessageWithTypingWithState(from, "💰 *ANTICIPO:* $500 MXN", 200, context.estado);
  await sendMessageWithTypingWithState(from, "El resto se paga el día del evento.", 200, context.estado);
  await delay(1000);
  
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/03/Datos-Transferencia-1.jpeg", "Datos para transferencia: 722969010494399671");
  await delay(1000);
  
  await sendMessageWithTypingWithState(from, "Después de tu depósito:", 200, context.estado);
  await sendMessageWithTypingWithState(from, "1. Te pido tus datos completos", 200, context.estado);
  await sendMessageWithTypingWithState(from, "2. Llenamos el contrato", 200, context.estado);
  await sendMessageWithTypingWithState(from, "3. Te envío foto del contrato firmado", 200, context.estado);
  await delay(1000);
  
  await sendMessageWithTypingWithState(from, "❓ *Preguntas frecuentes:*", 200, context.estado);
  await sendMessageWithTypingWithState(from, "https://cami-cam.com/preguntas-frecuentes/", 200, context.estado);
  await delay(500);
  
  await sendMessageWithTypingWithState(from, "Cualquier duda, con toda confianza.\n\nSoy Gustavo González, a tus órdenes 😀", 200, context.estado);
  
  context.estado = "Finalizado";
  await saveContext(from, context);
}

/* =========================
   Handler Principal de Mensajes
========================= */
async function handleUserMessage(from, userText, messageLower) {
  const context = await ensureContext(from);
  
  // DETECTAR MENSAJES PREDEFINIDOS DE PAQUETES
  if (messageLower.includes("info paquete mis xv")) {
    await handlePaqueteMisXVFlow(from, context);
    return true;
  }
  
  if (messageLower.includes("info paquete wedding")) {
    // Similar a handlePaqueteMisXVFlow pero para wedding
    context.tipoEvento = "Boda";
    context.paqueteRecomendado = "PAQUETE WEDDING";
    context.estado = "EsperandoFechaPaqueteWedding";
    await saveContext(from, context);
    
    await sendMessageWithTypingWithState(from, "¡Felicidades por tu boda! ❤️ Para el PAQUETE WEDDING, necesito la fecha:", 500, context.estado);
    return true;
  }
  
  // MANEJAR ESTADOS EXISTENTES
  switch (context.estado) {
    case "EsperandoFechaPaqueteXV":
    case "EsperandoFechaPaqueteWedding":
      const success = await handleFechaPaqueteXV(from, userText, context);
      return success;
      
    case "EsperandoDecisionPaquete":
      if (messageLower.includes("confirmar_paquete_xv") || messageLower.includes("paquete mis xv")) {
        context.estado = "EsperandoLugar";
        await saveContext(from, context);
        await solicitarLugar(from, context);
        return true;
      }
      if (messageLower.includes("cotizador_personalizado") || messageLower.includes("cotizador") || messageLower.includes("personalizado")) {
        await handleCotizadorPersonalizado(from, context);
        return true;
      }
      break;
      
    case "EsperandoLugar":
      await handleLugar(from, userText, context);
      return true;
      
    case "Contacto Inicial":
      // Flujo normal de inicio
      await sendMessageWithTypingWithState(from, "¡Hola! 👋 Soy *Cami-Bot*, a tus órdenes.", 200, "Contacto Inicial");
      await sendMessageWithTypingWithState(from, "¿Qué tipo de evento tienes? (Boda, XV, cumpleaños...)", 300, "Contacto Inicial");
      context.estado = "EsperandoTipoEvento";
      await saveContext(from, context);
      return true;
      
    case "Finalizado":
      // Reactivación de conversación después de tiempo
      const lastActivity = new Date(context.lastActivity);
      const now = new Date();
      const daysDiff = (now - lastActivity) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 1) {
        await sendMessageWithTypingWithState(from, "¡Hola de nuevo! 👋 ¿En qué puedo ayudarte?", 200, context.estado);
        context.estado = "Contacto Inicial";
        await saveContext(from, context);
      }
      return true;
  }
  
  // Si no se manejó el mensaje, respuesta por defecto
  await sendMessageWithTypingWithState(from, "¡Hola! ¿Te interesa algún paquete especial o prefieres usar nuestro cotizador online?", 200, context.estado);
  return true;
}

/* =========================
   Rutas HTTP (mantener igual)
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
    
    // Reportar mensaje entrante al CRM
    let userMessage = "";
    if (message.text?.body) userMessage = message.text.body;
    else if (message.interactive?.button_reply) userMessage = message.interactive.button_reply.title || message.interactive.button_reply.id;

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
    const messageLower = normalizeText(buttonReply || userMessage);

    await handleUserMessage(from, userMessage, messageLower);
    return res.sendStatus(200);
    
  } catch (e) {
    console.error("Webhook error:", e.message);
    return res.sendStatus(500);
  }
});

// Mantener las demás rutas igual...
app.get('/', async (_req, res) => {
  res.send('¡Servidor OK! 🚀');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});
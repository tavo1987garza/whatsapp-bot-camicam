// =====================================
// file: index.js (Versión Multi-Tenant Limpia)
// =====================================
import AWS from 'aws-sdk';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

/* ===== Configuración global ===== */
const app = express();
const PORT = process.env.PORT || 3000;
const CRM_BASE_URL = process.env.CRM_BASE_URL || "https://camicam.eventa.com.mx"; // Ajusta a tu dominio real
const WABA_VERSION = process.env.WABA_VERSION || "v21.0";
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/* ===== AWS S3 Setup ===== */
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const s3 = new AWS.S3();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/* ===== Utils ===== */
const toHttps = (u) => u?.startsWith('http://') ? u.replace(/^http:\/\//i, 'https://') : u;
const shouldSkipDuplicateSend = (to, key) => {
  // Implementación simple anti-duplicados si la necesitas, o puedes quitarla
  return false; 
};

/* ===== Puente: Enviar mensaje entrante al CRM ===== */
async function reportMessageToCRM(remitente, mensaje, tipo = "recibido") {
  try {
    await axios.post(`${CRM_BASE_URL}/recibir_mensaje`, {
      plataforma: "WhatsApp",
      remitente: remitente,
      mensaje: mensaje,
      tipo: tipo
    }, { timeout: 7000 });
  } catch (e) {
    console.error("❌ Error reportando al CRM:", e.response?.data || e.message);
  }
}

/* ===== WhatsApp Helpers (Multi-Tenant Ready) ===== */
async function sendWhatsAppMessage(to, text, customToken, customPhoneId) {
  try {
    if (!customToken || !customPhoneId || !text) {
      console.error("❌ Faltan credenciales o texto para enviar mensaje");
      return;
    }
    if (shouldSkipDuplicateSend(to, `text:${text}`)) return;
    
    const url = `https://graph.facebook.com/${WABA_VERSION}/${customPhoneId}/messages`;
    const headers = { Authorization: `Bearer ${customToken}`, 'Content-Type': 'application/json' };

    const { data } = await axios.post(url, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    }, { headers, timeout: 15000 });
    
    console.log("✅ WA text ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, text, "enviado");
  } catch (e) {
    console.error("❌ WA text:", e.response?.data || e.message);
  }
}

async function sendImageMessage(to, imageUrl, caption, customToken, customPhoneId) {
  try {
    if (!customToken || !customPhoneId) return;
    const link = toHttps(imageUrl);
    if (!link) return;
    
    const url = `https://graph.facebook.com/${WABA_VERSION}/${customPhoneId}/messages`;
    const headers = { Authorization: `Bearer ${customToken}`, 'Content-Type': 'application/json' };

    const { data } = await axios.post(url, {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link, ...(caption ? { caption } : {}) }
    }, { headers, timeout: 20000 });
    
    console.log("✅ WA image ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, link, "enviado_imagen");
  } catch (e) {
    console.error("❌ WA image:", e.response?.data || e.message);
  }
}

async function sendWhatsAppVideo(to, videoUrl, caption, customToken, customPhoneId) {
  try {
    if (!customToken || !customPhoneId) return;
    const link = toHttps(videoUrl);
    if (!link) return;
    
    const url = `https://graph.facebook.com/${WABA_VERSION}/${customPhoneId}/messages`;
    const headers = { Authorization: `Bearer ${customToken}`, 'Content-Type': 'application/json' };

    const { data } = await axios.post(url, {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: { link, ...(caption ? { caption } : {}) }
    }, { headers, timeout: 30000 });
    
    console.log("✅ WA video ok:", data?.messages?.[0]?.id || "ok");
    await reportMessageToCRM(to, link, "enviado_video");
  } catch (e) {
    console.error("❌ WA video:", e.response?.data || e.message);
  }
}


async function sendWhatsAppButtons(to, bodyText, buttons, customToken, customPhoneId) {
  try {
    if (!customToken || !customPhoneId || !bodyText || !buttons || buttons.length === 0) {
      console.error("❌ Faltan datos para enviar botones");
      return;
    }

    // WhatsApp limita a 3 botones de tipo "reply" y 20 caracteres máx. por título
    const validButtons = buttons.slice(0, 3).map((btnText, index) => ({
      type: "reply",
      reply: {
        id: `btn_${index}`, 
        title: btnText.substring(0, 20) 
      }
    }));

    const url = `https://graph.facebook.com/${WABA_VERSION}/${customPhoneId}/messages`;
    const headers = { 
      Authorization: `Bearer ${customToken}`, 
      'Content-Type': 'application/json' 
    };

    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: { buttons: validButtons }
      }
    };

    const { data } = await axios.post(url, payload, { headers, timeout: 15000 });
    console.log("✅ WA buttons ok:", data?.messages?.[0]?.id || "ok");
    
    // Reportar al CRM que se enviaron botones
    await reportMessageToCRM(to, `[BOTONES] ${bodyText} | Opciones: ${buttons.join(', ')}`, "enviado_opciones");

  } catch (e) {
    console.error("❌ WA buttons error:", e.response?.data || e.message);
  }
}


/* ===== Webhooks de Meta ===== */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value || {};
    const message = entry?.messages?.[0];
    if (!message) return res.sendStatus(200);
    
    const from = message.from;

    // 1. Manejo de multimedia entrante (Descargar de Meta -> Subir a S3 -> Avisar al CRM)
    if (message.type === "image" || message.type === "video") {
      const mediaType = message.type;
      try {
        const mediaId = message[mediaType].id;
        const meta = await axios.get(`https://graph.facebook.com/${WABA_VERSION}/${mediaId}`, {
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }
        });
        const directUrl = meta.data.url;
        const bin = await axios.get(directUrl, {
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
          responseType: 'arraybuffer'
        });
        
        const key = `${from}_${uuidv4()}.${mediaType === 'image' ? 'jpg' : 'mp4'}`;
        const up = await s3.upload({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: key,
          Body: bin.data,
          ContentType: mediaType === 'image' ? 'image/jpeg' : 'video/mp4',
        }).promise();
        
        await reportMessageToCRM(from, up.Location, `recibido_${mediaType}`);
      } catch (e) {
        console.error(`❌ Error procesando ${mediaType} entrante:`, e.message);
        await reportMessageToCRM(from, "[Archivo multimedia]", `recibido_${mediaType}`);
      }
      return res.sendStatus(200);
    }

    // 2. Manejo de texto o botones
    let userMessage = "";
    if (message.text?.body) {
      userMessage = message.text.body;
    } else if (message.interactive?.button_reply) {
      userMessage = message.interactive.button_reply.title || message.interactive.button_reply.id;
    } else if (message.interactive?.list_reply) {
      userMessage = message.interactive.list_reply.title || message.interactive.list_reply.id;
    }

    // Enviar al CRM. El CRM decidirá si hay una respuesta automática (keyword/flow)
    const crmResponse = await axios.post(`${CRM_BASE_URL}/recibir_mensaje`, {
      plataforma: "WhatsApp",
      remitente: from,
      mensaje: userMessage,
      tipo: "recibido"
    }, { timeout: 7000 });

    // 3. 🚀 NUEVO: Si el CRM devuelve una respuesta automática, el bot la interpreta y envía
    if (crmResponse.data?.bot_response) {
      const respuesta = crmResponse.data.bot_response;
      
      // Si es un objeto (viene de un Flujo con tipo específico)
      if (typeof respuesta === 'object' && respuesta.type) {
        const tipo = respuesta.type;
        const caption = respuesta.caption || "";
        const url = respuesta.url || "";
        const buttons = respuesta.bot_buttons || [];

        if (tipo === 'imagen' && url) {
          await sendImageMessage(from, url, caption, process.env.WHATSAPP_ACCESS_TOKEN, process.env.WHATSAPP_PHONE_NUMBER_ID);
        } 
        else if (tipo === 'video' && url) {
          await sendWhatsAppVideo(from, url, caption, process.env.WHATSAPP_ACCESS_TOKEN, process.env.WHATSAPP_PHONE_NUMBER_ID);
        } 
        else if (tipo === 'opciones' && buttons.length > 0) {
          await sendWhatsAppButtons(from, caption, buttons, process.env.WHATSAPP_ACCESS_TOKEN, process.env.WHATSAPP_PHONE_NUMBER_ID);
        } 
        else {
          // Fallback a mensaje de texto normal
          await sendWhatsAppMessage(from, caption, process.env.WHATSAPP_ACCESS_TOKEN, process.env.WHATSAPP_PHONE_NUMBER_ID);
        }
      } 
      // Si es un string simple (viene de una Keyword tradicional)
      else if (typeof respuesta === 'string') {
        await sendWhatsAppMessage(from, respuesta, process.env.WHATSAPP_ACCESS_TOKEN, process.env.WHATSAPP_PHONE_NUMBER_ID);
      }
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error("❌ Webhook error:", e.message);
    return res.sendStatus(500);
  }
});

/* ===== Endpoints para envío manual desde el CRM (Multi-Tenant) ===== */
app.post('/enviar_mensaje', async (req, res) => {
  try {
    const { telefono, mensaje, whatsapp_token, whatsapp_phone_id } = req.body;
    if (!telefono || !mensaje) return res.status(400).json({ error: 'Faltan datos' });
    
    const token = whatsapp_token || process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = whatsapp_phone_id || process.env.WHATSAPP_PHONE_NUMBER_ID;

    await sendWhatsAppMessage(telefono, mensaje, token, phoneId);
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ enviar_mensaje:", e.message);
    res.status(500).json({ error: 'Error al enviar a WhatsApp' });
  }
});

app.post('/enviar_imagen', async (req, res) => {
  try {
    const { telefono, imageUrl, caption, whatsapp_token, whatsapp_phone_id } = req.body;
    if (!telefono || !imageUrl) return res.status(400).json({ error: 'Faltan datos (telefono, imageUrl)' });
    
    const token = whatsapp_token || process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = whatsapp_phone_id || process.env.WHATSAPP_PHONE_NUMBER_ID;

    await sendImageMessage(telefono, imageUrl, caption, token, phoneId);
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ enviar_imagen:", e.message);
    res.status(500).json({ error: 'Error al enviar imagen' });
  }
});

app.post('/enviar_video', async (req, res) => {
  try {
    const { telefono, videoUrl, caption, whatsapp_token, whatsapp_phone_id } = req.body;
    if (!telefono || !videoUrl) return res.status(400).json({ error: 'Faltan datos (telefono, videoUrl)' });
    
    const token = whatsapp_token || process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = whatsapp_phone_id || process.env.WHATSAPP_PHONE_NUMBER_ID;

    await sendWhatsAppVideo(telefono, videoUrl, caption, token, phoneId);
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ enviar_video:", e.message);
    res.status(500).json({ error: 'Error al enviar video' });
  }
});

/* ===== Health Check ===== */
app.get('/', (_req, res) => res.send('🤖 Bot Multi-Tenant OK! 🚀'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

/* ===== Inicio del Servidor ===== */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor Multi-Tenant escuchando en http://localhost:${PORT}`);
});
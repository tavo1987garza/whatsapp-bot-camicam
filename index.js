// =====================================
// file: index.js (Versión Multi-Tenant Limpia)
// =====================================
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

/* ===== Configuración global ===== */
const app = express();
const PORT = process.env.PORT || 3000;
const CRM_BASE_URL = process.env.CRM_BASE_URL || "https://camicam.eventa.com.mx"; // Ajusta a tu dominio real
const WABA_VERSION = process.env.WABA_VERSION || "v21.0";
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/* ===== Utils ===== */
const toHttps = (u) => u?.startsWith('http://') ? u.replace(/^http:\/\//i, 'https://') : u;
const shouldSkipDuplicateSend = (to, key) => {
  // Implementación simple anti-duplicados si la necesitas, o puedes quitarla
  return false; 
};

/* ===== Puente: Enviar mensaje entrante al CRM ===== */
async function reportMessageToCRM(
  remitente,
  mensaje,
  tipo = "recibido",
  whatsappPhoneId
) {
  try {

    if (!whatsappPhoneId) {
      throw new Error("Falta whatsappPhoneId para identificar tenant");
    }

    const headers = {
      "Content-Type": "application/json",
      "X-Bot-Secret": process.env.BOT_INTERNAL_SECRET
    };

    const { data } = await axios.post(
      `${CRM_BASE_URL}/recibir_mensaje`,
      {
        plataforma: "whatsapp",
        remitente: remitente,
        mensaje: mensaje,
        tipo: tipo,

        // 🔐 Flask resolverá cliente_id usando este valor.
        whatsapp_phone_id: whatsappPhoneId
      },
      {
        headers,
        timeout: 15000
      }
    );

    return data;

  } catch (e) {

    console.error(
      "❌ Error reportando al CRM:",
      e.response?.data || e.message
    );

    throw e;
  }
}

/* ===== Puente espejo: Registrar descriptor multimedia en el CRM ===== */
async function reportMediaToCRM({
  whatsapp_phone_id,
  meta_message_id,
  remitente,
  message_type,
  media_id
}) {
  const descriptor = {
    whatsapp_phone_id,
    meta_message_id,
    remitente,
    message_type,
    media_id
  };

  const camposCompletos = Object.values(descriptor).every(
    (valor) => typeof valor === "string" && valor.trim().length > 0
  );
  if (!camposCompletos) {
    throw new Error("Descriptor multimedia incompleto");
  }

  const botInternalSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botInternalSecret) {
    throw new Error("BOT_INTERNAL_SECRET no configurado");
  }

  const respuesta = await axios.post(
    `${CRM_BASE_URL}/recibir_media`,
    descriptor,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Secret": botInternalSecret
      },
      timeout: 15000,
      validateStatus: (status) => status === 200 || status === 202
    }
  );

  const estadosPermitidos = new Set([
    "accepted",
    "already_accepted",
    "already_processing",
    "already_processed",
    "previously_failed"
  ]);
  if (!estadosPermitidos.has(respuesta.data?.status)) {
    throw new Error("Respuesta inesperada de /recibir_media");
  }

  return respuesta.data;
}

/* ===== WhatsApp Helpers (Multi-Tenant Ready) ===== */
async function sendWhatsAppMessage(
  to,
  text,
  customToken,
  customPhoneId,
  reportarAlCRM = true
) {
  if (!customToken || !customPhoneId || !text) {
    throw new Error("datos_envio_texto_incompletos");
  }
  if (shouldSkipDuplicateSend(to, `text:${text}`)) {
    return { skipped: true };
  }

  const url = `https://graph.facebook.com/${WABA_VERSION}/${customPhoneId}/messages`;
  const headers = { Authorization: `Bearer ${customToken}`, 'Content-Type': 'application/json' };
  let data;

  try {
    const respuesta = await axios.post(url, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    }, { headers, timeout: 15000 });
    data = respuesta.data;
  } catch (e) {
    console.error("❌ WA text upstream:", {
      http_status: e.response?.status || null,
      meta_code: e.response?.data?.error?.code || null,
      error_type: e.code || e.name || "Error"
    });
    throw e;
  }

  const messageId = data?.messages?.[0]?.id || null;
  console.log("✅ WA text ok:", messageId || "ok");

  if (reportarAlCRM) {
    try {
      await reportMessageToCRM(to, text, "enviado", customPhoneId);
    } catch (e) {
      console.error("❌ WA text reporting secundario:", {
        http_status: e.response?.status || null,
        error_type: e.code || e.name || "Error"
      });
    }
  }

  return { message_id: messageId };
}

async function sendImageMessage(to, imageUrl, caption, customToken, customPhoneId, reportarAlCRM = true) {
  if (!to || !imageUrl || !customToken || !customPhoneId) {
    throw new Error("datos_envio_imagen_incompletos");
  }
  const link = toHttps(imageUrl);
  if (!link) throw new Error("url_imagen_invalida");

  const url = `https://graph.facebook.com/${WABA_VERSION}/${customPhoneId}/messages`;
  const headers = { Authorization: `Bearer ${customToken}`, 'Content-Type': 'application/json' };
  let data;

  try {
    const respuesta = await axios.post(url, {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link, ...(caption ? { caption } : {}) }
    }, { headers, timeout: 20000 });
    data = respuesta.data;
  } catch (e) {
    console.error("❌ WA image upstream:", {
      http_status: e.response?.status || null,
      meta_code: e.response?.data?.error?.code || null,
      error_type: e.code || e.name || "Error"
    });
    throw e;
  }

  const messageId = data?.messages?.[0]?.id || null;
  console.log("✅ WA image ok:", messageId || "ok");
  if (reportarAlCRM) {
    try {
      await reportMessageToCRM(to, link, "enviado_imagen", customPhoneId);
    } catch (e) {
      console.error("❌ WA image reporting secundario:", {
        http_status: e.response?.status || null,
        error_type: e.code || e.name || "Error"
      });
    }
  }
  return { message_id: messageId };
}

async function sendWhatsAppVideo(to, videoUrl, caption, customToken, customPhoneId, reportarAlCRM = true) {
  if (!to || !videoUrl || !customToken || !customPhoneId) {
    throw new Error("datos_envio_video_incompletos");
  }
  const link = toHttps(videoUrl);
  if (!link) throw new Error("url_video_invalida");

  const url = `https://graph.facebook.com/${WABA_VERSION}/${customPhoneId}/messages`;
  const headers = { Authorization: `Bearer ${customToken}`, 'Content-Type': 'application/json' };
  let data;

  try {
    const respuesta = await axios.post(url, {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: { link, ...(caption ? { caption } : {}) }
    }, { headers, timeout: 30000 });
    data = respuesta.data;
  } catch (e) {
    console.error("❌ WA video upstream:", {
      http_status: e.response?.status || null,
      meta_code: e.response?.data?.error?.code || null,
      error_type: e.code || e.name || "Error"
    });
    throw e;
  }

  const messageId = data?.messages?.[0]?.id || null;
  console.log("✅ WA video ok:", messageId || "ok");
  if (reportarAlCRM) {
    try {
      await reportMessageToCRM(to, link, "enviado_video", customPhoneId);
    } catch (e) {
      console.error("❌ WA video reporting secundario:", {
        http_status: e.response?.status || null,
        error_type: e.code || e.name || "Error"
      });
    }
  }
  return { message_id: messageId };
}


function normalizarBotonesWhatsApp(buttons) {
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
    throw new Error("botones_cantidad_invalida");
  }

  const normalizados = buttons.map((button) => {
    const esString = typeof button === "string";
    if (
      !esString &&
      (typeof button?.id !== "string" || typeof button?.title !== "string")
    ) {
      throw new Error("boton_invalido");
    }
    const id = (esString ? button : button.id).trim();
    const title = (esString ? button : button.title).trim();
    if (!id || !title || id.length > 256 || title.length > 20) {
      throw new Error("boton_invalido");
    }
    return { id, title };
  });

  if (
    new Set(normalizados.map((button) => button.id)).size !== normalizados.length ||
    new Set(normalizados.map((button) => button.title)).size !== normalizados.length
  ) {
    throw new Error("botones_duplicados");
  }
  return normalizados;
}


async function sendWhatsAppButtons(to, bodyText, buttons, customToken, customPhoneId, reportarAlCRM = true) {
  if (!to || typeof bodyText !== "string" || !customToken || !customPhoneId) {
    throw new Error("datos_envio_botones_incompletos");
  }
  const body = bodyText.trim();
  if (!body || body.length > 1024) throw new Error("cuerpo_botones_invalido");
  const botonesNormalizados = normalizarBotonesWhatsApp(buttons);
  const validButtons = botonesNormalizados.map((button) => ({
    type: "reply",
    reply: { id: button.id, title: button.title }
  }));
  const url = `https://graph.facebook.com/${WABA_VERSION}/${customPhoneId}/messages`;
  const headers = {
    Authorization: `Bearer ${customToken}`,
    'Content-Type': 'application/json'
  };
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons: validButtons }
    }
  };
  let data;

  try {
    const respuesta = await axios.post(url, payload, { headers, timeout: 15000 });
    data = respuesta.data;
  } catch (e) {
    console.error("❌ WA buttons upstream:", {
      http_status: e.response?.status || null,
      meta_code: e.response?.data?.error?.code || null,
      error_type: e.code || e.name || "Error"
    });
    throw e;
  }

  const messageId = data?.messages?.[0]?.id || null;
  console.log("✅ WA buttons ok:", messageId || "ok");
  if (reportarAlCRM) {
    try {
      const opcionesReporte = botonesNormalizados.map((button) => button.title).join(', ');
      await reportMessageToCRM(
        to,
        `[BOTONES] ${body} | Opciones: ${opcionesReporte}`,
        "enviado_opciones",
        customPhoneId
      );
    } catch (e) {
      console.error("❌ WA buttons reporting secundario:", {
        http_status: e.response?.status || null,
        error_type: e.code || e.name || "Error"
      });
    }
  }
  return { message_id: messageId };
}

// Función para simular que el bot está escribiendo
async function sendTypingIndicator(to, customToken, customPhoneId) {
  try {
    const url = `https://graph.facebook.com/${WABA_VERSION}/${customPhoneId}/messages`;
    const headers = { Authorization: `Bearer ${customToken}`, 'Content-Type': 'application/json' };
    
    // Payload oficial de Meta para mostrar "Escribiendo..."
    await axios.post(url, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: { preview_url: false } // El cuerpo vacío activa el indicador
    }, { headers, timeout: 5000 });
  } catch (e) {
    // Ignoramos errores aquí, no es crítico si falla el indicador de escritura
  }
}

// ============================================================
// WRAPPER DE ENVÍO CON DELAY
// ============================================================
async function sendWithDelay(
  to,
  sendFunction,
  delaySeconds,
  customToken,
  customPhoneId,
  ...sendArgs
) {
  const delay = Math.max(
    0,
    parseInt(delaySeconds, 10) || 0
  );

  if (!customToken || !customPhoneId) {
    throw new Error(
      "sendWithDelay requiere token y phoneId del tenant"
    );
  }

  if (delay > 0) {
    await new Promise(resolve =>
      setTimeout(resolve, delay * 1000)
    );
  }

  await sendFunction(
    to,
    ...sendArgs,
    customToken,
    customPhoneId
  );
}



// ==========================================
// SEGURIDAD INTERNA CRM → BOT
// ==========================================

function validarCRMInterno(req, res, next) {
  const secretoRecibido = req.headers['x-bot-secret'];
  const secretoEsperado = process.env.BOT_INTERNAL_SECRET;

  if (!secretoEsperado) {
    console.error(
      '❌ BOT_INTERNAL_SECRET no está configurado en Node'
    );

    return res.status(500).json({
      error: 'Configuración interna incompleta'
    });
  }

  if (secretoRecibido !== secretoEsperado) {
    console.warn(
      '⛔ Intento no autorizado contra endpoint interno'
    );

    return res.status(401).json({
      error: 'No autorizado'
    });
  }

  next();
}


/* ===== Endpoints para envío manual desde el CRM (Multi-Tenant) ===== */
app.post(
  '/enviar_mensaje',
  validarCRMInterno,
  async (req, res) => {
    try {
      const {
        telefono,
        mensaje,
        whatsapp_token,
        whatsapp_phone_id,
        reportar_al_crm = true,
        delay = 0
      } = req.body;

      if (!telefono || !mensaje) {
        return res.status(400).json({
          error: 'Faltan datos: telefono o mensaje'
        });
      }

      if (!whatsapp_token || !whatsapp_phone_id) {
        return res.status(400).json({
          error: 'Faltan credenciales WhatsApp del tenant'
        });
      }

      const enviarTexto = reportar_al_crm === false
        ? (to, text, token, phoneId) =>
            sendWhatsAppMessage(to, text, token, phoneId, false)
        : sendWhatsAppMessage;

      await sendWithDelay(
        telefono,
        enviarTexto,
        delay,
        whatsapp_token,
        whatsapp_phone_id,
        mensaje
      );

      return res.json({
        ok: true
      });

    } catch (e) {
      const esTimeout = e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT';
      console.error('❌ enviar_mensaje upstream:', {
        http_status: e.response?.status || null,
        meta_code: e.response?.data?.error?.code || null,
        error_type: e.code || e.name || 'Error'
      });

      return res.status(esTimeout ? 504 : 502).json({
        ok: false,
        error: 'Error al enviar mensaje a WhatsApp'
      });
    }
  }
);

app.post(
  '/enviar_imagen',
  validarCRMInterno,
  async (req, res) => {
    try {
      const {
        telefono,
        imageUrl,
        caption = '',
        whatsapp_token,
        whatsapp_phone_id,
        reportar_al_crm = true,
        delay = 0
      } = req.body;

      if (
        typeof telefono !== 'string' || !telefono.trim() ||
        typeof imageUrl !== 'string' || !imageUrl.trim()
      ) {
        return res.status(400).json({
          error: 'Faltan datos: telefono o imageUrl'
        });
      }

      // 🔐 MULTI-TENANT ESTRICTO
      if (
        typeof whatsapp_token !== 'string' || !whatsapp_token.trim() ||
        typeof whatsapp_phone_id !== 'string' || !whatsapp_phone_id.trim()
      ) {
        console.error(
          '⛔ /enviar_imagen llamado sin credenciales del tenant'
        );

        return res.status(400).json({
          error: 'Faltan credenciales WhatsApp del tenant'
        });
      }

      const enviarImagen = reportar_al_crm === false
        ? (to, imageUrl, imageCaption, token, phoneId) =>
            sendImageMessage(to, imageUrl, imageCaption, token, phoneId, false)
        : sendImageMessage;

      await sendWithDelay(
        telefono,
        enviarImagen,
        delay,
        whatsapp_token,
        whatsapp_phone_id,
        imageUrl,
        caption
      );

      return res.json({
        ok: true
      });

    } catch (e) {
      const esTimeout = e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT';
      console.error('❌ enviar_imagen upstream:', {
        http_status: e.response?.status || null,
        meta_code: e.response?.data?.error?.code || null,
        error_type: e.code || e.name || 'Error'
      });
      return res.status(esTimeout ? 504 : 502).json({
        ok: false,
        error: 'Error al enviar imagen a WhatsApp'
      });
    }
  }
);

app.post(
  '/enviar_video',
  validarCRMInterno,
  async (req, res) => {
    try {
      const {
        telefono,
        videoUrl,
        caption = '',
        whatsapp_token,
        whatsapp_phone_id,
        reportar_al_crm = true,
        delay = 0
      } = req.body;

      if (
        typeof telefono !== 'string' || !telefono.trim() ||
        typeof videoUrl !== 'string' || !videoUrl.trim()
      ) {
        return res.status(400).json({
          error: 'Faltan datos: telefono o videoUrl'
        });
      }

      // 🔐 MULTI-TENANT ESTRICTO
      if (
        typeof whatsapp_token !== 'string' || !whatsapp_token.trim() ||
        typeof whatsapp_phone_id !== 'string' || !whatsapp_phone_id.trim()
      ) {
        console.error(
          '⛔ /enviar_video llamado sin credenciales del tenant'
        );

        return res.status(400).json({
          error: 'Faltan credenciales WhatsApp del tenant'
        });
      }

      const enviarVideo = reportar_al_crm === false
        ? (to, videoUrl, videoCaption, token, phoneId) =>
            sendWhatsAppVideo(to, videoUrl, videoCaption, token, phoneId, false)
        : sendWhatsAppVideo;

      await sendWithDelay(
        telefono,
        enviarVideo,
        delay,
        whatsapp_token,
        whatsapp_phone_id,
        videoUrl,
        caption
      );

      return res.json({
        ok: true
      });

    } catch (e) {
      const esTimeout = e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT';
      console.error('❌ enviar_video upstream:', {
        http_status: e.response?.status || null,
        meta_code: e.response?.data?.error?.code || null,
        error_type: e.code || e.name || 'Error'
      });
      return res.status(esTimeout ? 504 : 502).json({
        ok: false,
        error: 'Error al enviar video a WhatsApp'
      });
    }
  }
);

app.post(
  '/enviar_botones',
  validarCRMInterno,
  async (req, res) => {
    try {
      const {
        telefono,
        mensaje = 'Selecciona una opción:',
        opciones,
        whatsapp_token,
        whatsapp_phone_id,
        reportar_al_crm = true,
        delay = 0
      } = req.body;

      if (typeof telefono !== 'string' || !telefono.trim()) {
        return res.status(400).json({
          error: 'Falta telefono'
        });
      }

      if (!Array.isArray(opciones) || opciones.length === 0) {
        return res.status(400).json({
          error: 'Faltan opciones'
        });
      }

      if (typeof mensaje !== 'string' || !mensaje.trim() || mensaje.trim().length > 1024) {
        return res.status(400).json({
          error: 'Mensaje de botones inválido'
        });
      }

      // 🔐 MULTI-TENANT ESTRICTO
      if (
        typeof whatsapp_token !== 'string' || !whatsapp_token.trim() ||
        typeof whatsapp_phone_id !== 'string' || !whatsapp_phone_id.trim()
      ) {
        console.error(
          '⛔ /enviar_botones llamado sin credenciales del tenant'
        );

        return res.status(400).json({
          error: 'Faltan credenciales WhatsApp del tenant'
        });
      }

      let botones;
      try {
        botones = normalizarBotonesWhatsApp(opciones);
      } catch (_errorValidacion) {
        return res.status(400).json({
          error: 'Las opciones no tienen formato válido'
        });
      }

      const enviarBotones = reportar_al_crm === false
        ? (to, text, buttonOptions, token, phoneId) =>
            sendWhatsAppButtons(to, text, buttonOptions, token, phoneId, false)
        : sendWhatsAppButtons;

      await sendWithDelay(
        telefono,
        enviarBotones,
        delay,
        whatsapp_token,
        whatsapp_phone_id,
        mensaje,
        botones
      );

      return res.json({
        ok: true
      });

    } catch (e) {
      const esTimeout = e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT';
      console.error('❌ enviar_botones upstream:', {
        http_status: e.response?.status || null,
        meta_code: e.response?.data?.error?.code || null,
        error_type: e.code || e.name || 'Error'
      });
      return res.status(esTimeout ? 504 : 502).json({
        ok: false,
        error: 'Error al enviar botones a WhatsApp'
      });
    }
  }
);



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

    // 🔐 Identificador REAL del número de WhatsApp que recibió el mensaje.
    // Este valor será usado por Flask para identificar el tenant.
    const inboundPhoneId = entry?.metadata?.phone_number_id;

    if (!inboundPhoneId) {
      console.error("❌ Webhook recibido sin metadata.phone_number_id");
      return res.sendStatus(200);
    }

    const from = message.from;

    // 1. Multimedia entrante: reservar descriptor durable en Flask.
    if (message.type === "image" || message.type === "video") {
      const mediaType = message.type;

      try {
        const resultadoMedia = await reportMediaToCRM({
          whatsapp_phone_id: inboundPhoneId,
          meta_message_id: message.id,
          remitente: message.from,
          message_type: message.type,
          media_id: message[message.type]?.id
        });
        console.log(
          "✅ Descriptor multimedia reportado al CRM:",
          {
            message_type: mediaType,
            status: resultadoMedia.status,
            event_id: resultadoMedia.event_id || null
          }
        );
        return res.sendStatus(200);
      } catch (e) {
        console.error(
          "❌ Descriptor multimedia no reservado; Meta debe reintentar:",
          e.response?.status || e.code || e.message
        );
        return res.sendStatus(500);
      }
    }

  
// 2. Manejo de texto o botones
let userMessage = "";

if (message.text?.body) {
  userMessage = message.text.body;

} else if (message.interactive?.button_reply) {

  userMessage =
    message.interactive.button_reply.id ||
    message.interactive.button_reply.title;

} else if (message.interactive?.list_reply) {

  userMessage =
    message.interactive.list_reply.id ||
    message.interactive.list_reply.title;
}

if (userMessage) {

  await reportMessageToCRM(
    from,
    userMessage,
    "recibido",
    inboundPhoneId
  );
}

return res.sendStatus(200);
  } catch (e) {
    console.error("❌ Webhook error:", e.message);
    return res.sendStatus(500);
  }
});


/* ===== Health Check ===== */
app.get('/', (_req, res) => res.send('🤖 Bot Multi-Tenant OK! 🚀'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

/* ===== Inicio del Servidor ===== */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor Multi-Tenant escuchando en http://localhost:${PORT}`);
});

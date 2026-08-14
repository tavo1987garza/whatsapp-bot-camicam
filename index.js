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

      await sendWithDelay(
        telefono,
        sendWhatsAppMessage,
        delay,
        whatsapp_token,
        whatsapp_phone_id,
        mensaje
      );

      return res.json({
        ok: true
      });

    } catch (e) {
      console.error(
        '❌ enviar_mensaje:',
        e.response?.data || e.message
      );

      return res.status(500).json({
        error: 'Error al enviar a WhatsApp'
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
        delay = 0
      } = req.body;

      if (!telefono || !imageUrl) {
        return res.status(400).json({
          error: 'Faltan datos: telefono o imageUrl'
        });
      }

      // 🔐 MULTI-TENANT ESTRICTO
      if (!whatsapp_token || !whatsapp_phone_id) {
        console.error(
          '⛔ /enviar_imagen llamado sin credenciales del tenant'
        );

        return res.status(400).json({
          error: 'Faltan credenciales WhatsApp del tenant'
        });
      }

      await sendWithDelay(
        telefono,
        sendImageMessage,
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
      console.error(
        '❌ enviar_imagen:',
        e.response?.data || e.message
      );

      return res.status(500).json({
        error: 'Error al enviar imagen'
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
        delay = 0
      } = req.body;

      if (!telefono || !videoUrl) {
        return res.status(400).json({
          error: 'Faltan datos: telefono o videoUrl'
        });
      }

      // 🔐 MULTI-TENANT ESTRICTO
      if (!whatsapp_token || !whatsapp_phone_id) {
        console.error(
          '⛔ /enviar_video llamado sin credenciales del tenant'
        );

        return res.status(400).json({
          error: 'Faltan credenciales WhatsApp del tenant'
        });
      }

      await sendWithDelay(
        telefono,
        sendWhatsAppVideo,
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
      console.error(
        '❌ enviar_video:',
        e.response?.data || e.message
      );

      return res.status(500).json({
        error: 'Error al enviar video'
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
        delay = 0
      } = req.body;

      if (!telefono) {
        return res.status(400).json({
          error: 'Falta telefono'
        });
      }

      if (!Array.isArray(opciones) || opciones.length === 0) {
        return res.status(400).json({
          error: 'Faltan opciones'
        });
      }

      // 🔐 MULTI-TENANT ESTRICTO
      if (!whatsapp_token || !whatsapp_phone_id) {
        console.error(
          '⛔ /enviar_botones llamado sin credenciales del tenant'
        );

        return res.status(400).json({
          error: 'Faltan credenciales WhatsApp del tenant'
        });
      }

      // WhatsApp reply buttons: máximo 3
      const botones = opciones
        .slice(0, 3)
        .filter(opcion => opcion && opcion.id && opcion.title);

      if (botones.length === 0) {
        return res.status(400).json({
          error: 'Las opciones no tienen formato válido'
        });
      }

      await sendWithDelay(
        telefono,
        sendWhatsAppButtons,
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
      console.error(
        '❌ enviar_botones:',
        e.response?.data || e.message
      );

      return res.status(500).json({
        error: 'Error al enviar botones'
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

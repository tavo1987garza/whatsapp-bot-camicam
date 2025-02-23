// src/services/whatsappService.js Maneja la comunicación con la API de WhatsApp de forma centralizada.
import axios from 'axios';

const WHATSAPP_URL_BASE = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const HEADERS = {
  Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
};

// Función base para enviar una petición a WhatsApp
async function sendWhatsAppRequest(data) {
  try {
    const response = await axios.post(WHATSAPP_URL_BASE, data, { headers: HEADERS });
    console.log('Respuesta de WhatsApp:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error en WhatsAppRequest:', error.response?.data || error.message);
    throw error;
  }
}

export const sendWhatsAppMessage = async (to, message) => {
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: message }
  };
  return sendWhatsAppRequest(data);
};

export const sendInteractiveMessage = async (to, body, buttons) => {
  const data = {
    messaging_product: 'whatsapp',
    recipient_type: "individual",
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map(button => ({
          type: 'reply',
          reply: { id: button.id, title: button.title }
        }))
      }
    }
  };
  return sendWhatsAppRequest(data);
};

export const sendImageMessage = async (to, imageUrl, caption) => {
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'image',
    image: { link: imageUrl, caption: caption }
  };
  return sendWhatsAppRequest(data);
};

export const sendWhatsAppVideo = async (to, videoUrl, caption) => {
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'video',
    video: { link: videoUrl, caption: caption }
  };
  return sendWhatsAppRequest(data);
};

export const sendWhatsAppList = async (to, header, body, buttonText, sections) => {
  const data = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: header },
      body: { text: body },
      action: {
        button: buttonText,
        sections: sections.map(section => ({
          title: section.title,
          rows: section.rows.map(row => ({
            id: row.id,
            title: row.title,
            description: row.description || ""
          }))
        }))
      }
    }
  };
  return sendWhatsAppRequest(data);
};

export const activateTypingIndicator = async (to) => {
  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    action: { type: 'typing_on' }
  };
  return sendWhatsAppRequest(data);
};

export const deactivateTypingIndicator = async (to) => {
  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    action: { type: 'typing_off' }
  };
  return sendWhatsAppRequest(data);
};

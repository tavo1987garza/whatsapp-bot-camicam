// src/services/whatsappService.js Maneja la comunicación con la API de WhatsApp de forma centralizada.
import axios from 'axios';

// URL base para enviar mensajes a través de la API de WhatsApp
const WHATSAPP_URL_BASE = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

// Encabezados comunes para todas las peticiones
const HEADERS = {
  Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
};

// Función base para enviar solicitudes a la API de WhatsApp
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

// Función para enviar un mensaje de texto
export const sendWhatsAppMessage = async (to, message) => {
  if (!message || message.trim() === "") {
    console.error("No se envió mensaje porque el cuerpo está vacío");
    return; // O lanza un error controlado
  }
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message }
  };
  return sendWhatsAppRequest(data);
};


// Función para enviar un mensaje interactivo (botones)
export const sendInteractiveMessage = async (to, body, buttons) => {
  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
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

// Función para enviar un mensaje con imagen
export const sendImageMessage = async (to, imageUrl, caption) => {
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl, caption }
  };
  return sendWhatsAppRequest(data);
};

// Función para enviar un video
export const sendWhatsAppVideo = async (to, videoUrl, caption) => {
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'video',
    video: { link: videoUrl, caption }
  };
  return sendWhatsAppRequest(data);
};

// Función para enviar una lista interactiva
export const sendWhatsAppList = async (to, header, body, buttonText, sections) => {
  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: header },
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

// Función para activar el indicador de "escribiendo" (typing_on)
export const activateTypingIndicator = async (to) => {
  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    action: { type: 'typing_on' }
  };
  return sendWhatsAppRequest(data);
};

// Función para desactivar el indicador de "escribiendo" (typing_off)
export const deactivateTypingIndicator = async (to) => {
  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    action: { type: 'typing_off' }
  };
  return sendWhatsAppRequest(data);
};

export async function sendInteractiveMessageWithImage(from, message, imageUrl, options) {
  // 1️⃣ Enviar primer mensaje
  await sendWhatsAppMessage(from, message);
  await delay(2000); // Espera 2 segundos

  // 2️⃣ Enviar imagen
  await sendImageMessage(from, imageUrl, '');
  await delay(2000); // Espera 2 segundos más

  // 3️⃣ Enviar menú interactivo
  await sendInteractiveMessage(from, options.message, options.buttons);
}

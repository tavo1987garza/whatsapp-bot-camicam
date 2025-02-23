// src/controllers/messageController.js Contiene la lógica de procesamiento de mensajes y flujos de conversación.
import axios from 'axios';
import { sendWhatsAppMessage, sendInteractiveMessage, sendWhatsAppList, sendWhatsAppVideo, sendImageMessage, activateTypingIndicator, deactivateTypingIndicator } from '../services/whatsappService.js';
import { delay, isValidDate, checkAvailability, formatPrice, formatMessage } from '../utils/helpers.js';

// Objeto para almacenar el contexto de cada usuario
export const userContext = {};

// Ruta para la verificación inicial del webhook
export const verifyWebhook = (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`Webhook recibido: mode=${mode}, token=${token}`);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado');
    res.status(200).send(challenge);
  } else {
    console.error('Error en la verificación del webhook');
    res.sendStatus(403);
  }
};

// Ruta raíz de prueba
export const handleRoot = async (req, res) => {
  res.send('¡Servidor funcionando correctamente!');
  console.log("Ruta '/' accedida correctamente.");

  // Ejemplo: enviar mensaje de prueba a WhatsApp
  try {
    console.log('Enviando mensaje de prueba a WhatsApp...');
    await sendWhatsAppMessage('528133971595', 'hello_world');
    console.log('Mensaje de prueba enviado exitosamente.');
  } catch (error) {
    console.error('Error al enviar mensaje de prueba:', error.message);
  }
};

// Ruta para enviar un mensaje interactivo de prueba
export const testInteractive = async (req, res) => {
  const testNumber = "528133971595"; // Número de prueba
  console.log("➡ Enviando mensaje interactivo de prueba...");
  try {
    await sendInteractiveMessage(testNumber, "¿Quieres ver nuestras preguntas frecuentes?", [
      { id: 'ver_faqs', title: 'Preguntas Frecuentes' }
    ]);
    res.send("✅ Mensaje interactivo enviado correctamente");
  } catch (error) {
    console.error("❌ Error al enviar mensaje interactivo:", error.message);
    res.send("❌ Hubo un error al enviar el mensaje interactivo");
  }
};

// Función para procesar el webhook de WhatsApp
export const processWebhook = async (req, res) => {
  console.log("📩 Webhook activado:", JSON.stringify(req.body, null, 2));

  // Extraer el mensaje entrante
  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  const userMessage = message?.text?.body || '';
  const plataforma = "WhatsApp";

  console.log(`📩 Mensaje de ${from}: ${userMessage}`);

  // Aquí se puede enviar el mensaje al CRM o procesarlo localmente.
  try {
    // Ejemplo: reenviar mensaje al CRM
    const response = await axios.post(process.env.CRM_ENDPOINT, {
      plataforma,
      remitente: from,
      mensaje: userMessage
    });
    console.log("✅ Respuesta del CRM:", response.data);
  } catch (error) {
    console.error("❌ Error al enviar mensaje al CRM:", error.message);
  }

  // Procesar respuestas interactivas, FAQs, y flujos de conversación
  // Se puede invocar aquí una función, por ejemplo: await handleUserMessage(from, userMessage);

  res.sendStatus(200);
};

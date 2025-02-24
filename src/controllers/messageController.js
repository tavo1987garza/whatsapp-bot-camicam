// src/controllers/messageController.js Contiene la lógica de procesamiento de mensajes y flujos de conversación.
import axios from 'axios';
import { 
  sendWhatsAppMessage, 
  sendInteractiveMessage, 
  sendWhatsAppList, 
  sendWhatsAppVideo, 
  sendImageMessage, 
  activateTypingIndicator,
  sendInteractiveMessageWithImage, 
  deactivateTypingIndicator 
} from '../services/whatsappService.js';
import { delay, isValidDate, checkAvailability, formatPrice, formatMessage } from '../utils/helpers.js';
// Objeto para almacenar el contexto de cada usuario
export const userContext = {};

// Array de FAQs (Preguntas Frecuentes)
const faqs = [
  { question: /como separo mi fecha|anticipo/i, answer: 'Separamos la fecha con $500. El resto puede pagarse el día del evento.' },
  { question: /hacen contrato|contrato/i, answer: 'Sí, una vez acreditado tu anticipo llenamos tu contrato y te enviamos una foto.' },
  { question: /con cuanto tiempo separo mi fecha|separar/i, answer: 'Puedes separar en cualquier momento, siempre y cuando la fecha esté disponible.' },
  { question: /se puede separar para 2026|2026/i, answer: 'Sí, tenemos agenda abierta para 2025 y 2026.' },
  { question: /cuánto se cobra de flete|flete/i, answer: 'Depende de la ubicación del evento. Contáctanos con tu dirección para cotizar.' },
  { question: /cómo reviso si tienen mi fecha disponible/i, answer: 'Dime, ¿para cuándo es tu evento? 😊' },
  { question: /ubicación|dónde están|donde son|ubican|oficinas/i, answer: '📍 Estamos en la Colonia Independencia en Monterrey. Atendemos eventos hasta 25 km a la redonda.' },
  { question: /pago|método de pago|tarjeta|efectivo/i, answer: 'Aceptamos transferencias bancarias, depósitos y pagos en efectivo.' }
];

// Función para buscar respuesta en FAQs
function findFAQ(userMessage) {
  for (const faq of faqs) {
    if (faq.question.test(userMessage)) {
      return faq.answer;
    }
  }
  return null;
}

// Función para manejar FAQs antes de enviar a otros flujos
export async function handleFAQs(from, userMessage) {
  const faqAnswer = findFAQ(userMessage);
  if (faqAnswer) {
    await sendWhatsAppMessage(from, faqAnswer);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// Controladores de Endpoints
// ---------------------------------------------------------------------

// 1. Verificar el webhook (GET /webhook)
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

// 2. Ruta raíz de prueba (GET /)
export const handleRoot = async (req, res) => {
  res.send('¡Servidor funcionando correctamente!');
  console.log("Ruta '/' accedida correctamente.");

  // Ejemplo: enviar mensaje de prueba a un número de WhatsApp
  try {
    console.log('Enviando mensaje de prueba a WhatsApp...');
    await sendWhatsAppMessage('528133971595', 'hello_world');
    console.log('Mensaje de prueba enviado exitosamente.');
  } catch (error) {
    console.error('Error al enviar mensaje de prueba:', error.message);
  }
};

// 3. Ruta para mensajes interactivos de prueba (GET /test-interactive)
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

// 4. Webhook para recibir mensajes desde WhatsApp (POST /webhook)
export const processWebhook = async (req, res) => {
  console.log("📩 Webhook activado:", JSON.stringify(req.body, null, 2));

  // Extraer el mensaje entrante
  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  const userMessage = message?.text?.body || '';
  const plataforma = "WhatsApp"; // O "Messenger" según corresponda

  console.log(`📩 Mensaje de ${from}: ${userMessage}`);

  // Ejemplo: reenviar el mensaje al CRM (verifica que el endpoint CRM esté configurado correctamente)
  try {
    const response = await axios.post(process.env.CRM_ENDPOINT, {
      plataforma,
      remitente: from,
      mensaje: userMessage
    });
    console.log("✅ Respuesta del CRM:", response.data);
  } catch (error) {
    console.error("❌ Error al enviar mensaje al CRM:", error.message);
  }

  // Aquí se procesa el mensaje entrante con flujos de conversación, FAQs, etc.
  // Si el mensaje coincide con FAQs, se maneja allí; si no, se pasa a handleUserMessage.
  if (await handleUserMessage(from, userMessage, message.interactive?.button_reply?.id)) {
    return res.sendStatus(200);
  }

  // Si no se pudo manejar el mensaje, se muestra la opción de ver FAQs.
  console.log("❓ Mensaje no reconocido. Mostrando botón de Preguntas Frecuentes.");
  await sendInteractiveMessage(from, "No estoy seguro de cómo responder a eso. ¿Quieres ver nuestras preguntas frecuentes?", [
    { id: 'ver_faqs', title: 'Preg. Frecuentes' }
  ]);
  res.sendStatus(200);
};

// 5. Endpoint para recibir mensajes desde el CRM y reenviarlos a WhatsApp (POST /enviar_mensaje)
export const enviarMensajeFromCRM = async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;
    if (!telefono || !mensaje) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    console.log(`📩 Enviando mensaje desde el CRM a WhatsApp: ${telefono} -> ${mensaje}`);
    await sendWhatsAppMessage(telefono, mensaje);
    res.status(200).json({ mensaje: 'Mensaje enviado a WhatsApp correctamente' });
  } catch (error) {
    console.error('❌ Error al reenviar mensaje a WhatsApp:', error.message);
    res.status(500).json({ error: 'Error al enviar mensaje a WhatsApp' });
  }
};

// ---------------------------------------------------------------------
// Funciones para el manejo de flujos de conversación
// ---------------------------------------------------------------------


// Función para manejar el flujo e interacción con el usuario
export async function handleUserMessage(from, userMessage, buttonReply) { 
  const messageLower = buttonReply ? buttonReply.toLowerCase() : userMessage.toLowerCase();

  // Inicializar el contexto del usuario si no existe
  if (!userContext[from]) {
    userContext[from] = {
      estado: "inicio",
      tipoEvento: null,
      nombre: null,
      fecha: null,
      serviciosSeleccionados: [],
      total: 0
    };
  }
  const context = userContext[from];

  try {
    // Flujo básico de bienvenida e información
    if (['info', 'costos', 'hola', 'precio', 'información'].some(word => messageLower.includes(word))) {
      await sendWhatsAppMessage(from, '¡Hola 👋! Soy tu asistente virtual de *Camicam Photobooth*');
      await delay(4000);
      await sendInteractiveMessage(from, 'Por favor selecciona el tipo de evento que tienes 👇', [
        { id: 'evento_xv', title: '🎉 XV Años' },
        { id: 'evento_boda', title: '💍 Boda' },
        { id: 'evento_otro', title: '🎊 Otro Evento' }
      ]);
      return true;
    }

    // Función interna para manejar la selección de eventos
   
  async function handleEventSelection(from, eventType, packageName) {
  // 1. Definir y enviar el mensaje de bienvenida
  const message = 'Conoce los servicios que ofrecemos en *Camicam Photobooth* 🎉';
  await sendWhatsAppMessage(from, message);
  await delay(2000);

  // 2. Enviar la imagen de servicios
  const imageUrl = 'http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg';
  await sendImageMessage(from, imageUrl, '');
  await delay(2000);

  // 3. Preparar y enviar el mensaje interactivo con las opciones
  const options = {
    message: 'Puedes ver videos de nuestros servicios. ▶️\n\n' + 
             'Armar tu paquete con todo lo que necesites!! 😊\n\n' +
             `O ver el Paquete que hemos preparado para ${packageName} 👇`,
    buttons: [
      { id: 'ver_videos', title: '▶️ Ver videos' },
      { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
      { id: `ver_paquete_${eventType}`, title: `🎉 Ver PAQUETE ${packageName.toUpperCase()}` }
    ]
  };
  await sendInteractiveMessageWithImage(from, message, imageUrl, options);
  return true;
}

    // Manejo de selección de evento según el mensaje recibido
    if (messageLower === 'evento_xv') {
      return await handleEventSelection(from, 'xv', 'Mis XV');
    }
    if (messageLower === 'evento_boda') {
      return await handleEventSelection(from, 'wedding', 'Wedding');
    }
    if (messageLower === 'evento_otro') {
      return await handleEventSelection(from, 'party', 'Party');
    }

    // Manejo de paquetes predefinidos
    if (messageLower === 'ver_paquete_xv') {
      return await handlePackage(
        from,
        "PAQUETE MIS XV",
        "http://cami-cam.com/wp-content/uploads/2023/10/PAQUETE-MIS-XV-2.jpg",
        "✅ Cabina de Fotos (3 Horas)\n✅ Lluvia de mariposas",
        6200,
        600,
        "✅ 6 Letras Gigantes (5 horas)\n✅ 2 Chisperos de piso",
        "http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4"
      );
    }
    if (messageLower === 'ver_paquete_wedding') {
      return await handlePackage(
        from,
        "PAQUETE WEDDING",
        "http://cami-cam.com/wp-content/uploads/2024/09/Paquete-Wedding.jpg",
        "✅ Cabina de Fotos o Cabina 360 (3 Horas)\n✅ 4 Letras Gigantes: *A & A ❤️* (5 horas)",
        5100,
        650,
        "✅ Carrito de 100 Shots CON alcohol\n✅ 2 Chisperos de piso",
        "http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4"
      );
    }
    if (messageLower === 'ver_paquete_party') {
      return await handlePackage(
        from,
        "PAQUETE PARTY",
        "http://cami-cam.com/wp-content/uploads/2024/06/PARTY.jpg",
        "✅ Cabina 360 (3 Horas)\n✅ 4 Letras Gigantes (5 horas)",
        5100,
        650,
        "✅ Carrito de 100 Shots CON alcohol\n✅ 2 Chisperos de piso",
        "http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4"
      );
    }

    // Si el usuario quiere reservar el paquete
    if (messageLower === 'reservar') {
      await sendWhatsAppMessage(from, '¡De acuerdo!\n\nPara separar solicitamos un anticipo de $500, el resto puede ser el día del evento.\n\n🗓️ Por favor dime tu fecha para revisar disponibilidad (formato: DD/MM/AAAA).');
      context.estado = "esperando_fecha";
      return true;
    }

    // Manejar la fecha ingresada por el usuario
    if (context.estado === "esperando_fecha") {
      const fechaUsuario = messageLower.trim();
      if (!isValidDate(fechaUsuario)) {
        await sendWhatsAppMessage(from, '⚠️ Formato de fecha incorrecto. Por favor, ingresa la fecha en el formato DD/MM/AAAA.');
        return true;
      }
      if (!checkAvailability(fechaUsuario)) {
        await sendWhatsAppMessage(from, `Lo siento, la fecha ${fechaUsuario} no está disponible. Por favor, elige otra fecha.`);
        return true;
      }
      context.fecha = fechaUsuario;
      await sendWhatsAppMessage(from, `✅ ¡Perfecto! La fecha ${fechaUsuario} está disponible.\n\nPara confirmar tu reserva, realiza el anticipo de $500 a la siguiente cuenta:\n\n💳 Banco: XYZ\n📌 CLABE: 123456789012345678\n👤 Titular: Camicam Photobooth`);
      context.estado = "confirmando_pago";
      return true;
    }

    // Si el usuario quiere armar su paquete de forma personalizada
    if (messageLower === 'armar_paquete') {
      await sendWhatsAppMessage(from, '🔗 Para armar tu paquete personalizado, visita nuestro cotizador en:\n🌐 www.cami-cam.com/cotizador/');
      return true;
    }

    // Si el usuario solicita ver videos
    if (messageLower === 'ver_videos') {
      await sendWhatsAppMessage(from, 'Aquí tienes algunos videos de nuestros servicios:');
      await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4', 'Audio Guest Book');
      await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4', 'Letras Gigantes');
      await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/LLUVIA-DE-MARIPOSAS-2.0.mp4', 'Lluvia de Mariposas');
      return true;
    }

    // Intentar manejar FAQs si el mensaje coincide
    if (await handleFAQs(from, userMessage)) {
      return true;
    }

    // Si ningún flujo se activa, se muestra un mensaje de sugerencia
    console.log("❓ Mensaje no reconocido. Mostrando botón de Preguntas Frecuentes.");
    await sendInteractiveMessage(from, "No estoy seguro de cómo responder a eso. ¿Quieres ver nuestras preguntas frecuentes?", [
      { id: 'ver_faqs', title: 'Preg. Frecuentes' }
    ]);
    return true;
  } catch (error) {
    console.error("❌ Error en handleUserMessage:", error.message);
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error.");
    return false;
  }
}

// Función para manejar la presentación de un paquete (flujo de ventas)
// Función para manejar la lógica de los paquetes
export async function handlePackage(from, packageName, imageUrl, includes, price, discount, freeItems, videoUrl) {
  // Validación básica de parámetros
  if (!packageName || !imageUrl || !includes || !price || !discount || !freeItems || !videoUrl) {
    console.error("handlePackage: Faltan parámetros obligatorios");
    throw new Error("Parámetros incompletos en handlePackage");
  }

  // 1. Enviar imagen del paquete
  try {
    await sendImageMessage(from, imageUrl, '');
    await delay(2000);
  } catch (error) {
    console.error("Error al enviar la imagen del paquete:", error.message);
    throw error;
  }

  // 2. Enviar mensaje de promoción del paquete
  const msgPackage = `El paquete que estamos promocionando es el\n${formatMessage(`"${packageName}"`, "bold")}`;
  if (!msgPackage.trim()) {
    console.error("Mensaje de paquete vacío");
    throw new Error("Mensaje de paquete vacío");
  }
  try {
    await sendMessageWithTyping(from, msgPackage, 2000);
  } catch (error) {
    console.error("Error al enviar mensaje del paquete:", error.message);
    throw error;
  }

  // 3. Enviar mensaje con los detalles e inclusión del paquete
  const msgIncludes = `${formatMessage("INCLUYE", "bold")}\n\n${includes}\n\nPor Sólo\n\n${formatMessage(`✨ ${formatPrice(price)} ✨`, "bold")}\n\n${formatMessage("Más flete, dependiendo de dónde sea el evento", "italic")} 📍`;
  if (!msgIncludes.trim()) {
    console.error("Mensaje de INCLUYE vacío");
    throw new Error("Mensaje de INCLUYE vacío");
  }
  try {
    await sendMessageWithTyping(from, msgIncludes, 5000);
  } catch (error) {
    console.error("Error al enviar mensaje INCLUYE:", error.message);
    throw error;
  }

  // 4. Enviar mensaje sobre los beneficios adicionales
  const msgFree = `Y llévate GRATIS la renta de:\n\n${freeItems}`;
  try {
    await sendMessageWithTyping(from, msgFree, 9000);
  } catch (error) {
    console.error("Error al enviar mensaje de gratis:", error.message);
    throw error;
  }

  // 5. Enviar mensaje de "¡Pero espera!"
  try {
    await sendMessageWithTyping(from, `${formatMessage("¡¡ PERO ESPERA !! ✋", "bold")}`, 8000);
  } catch (error) {
    console.error("Error al enviar mensaje de 'Pero espera':", error.message);
    throw error;
  }

  // 6. Enviar mensaje sobre el descuento del mes
  const msgDiscount = `¡Sólo durante éste mes disfruta de un descuento de ${formatPrice(discount)}!`;
  try {
    await sendMessageWithTyping(from, msgDiscount, 5000);
  } catch (error) {
    console.error("Error al enviar mensaje de descuento:", error.message);
    throw error;
  }

  // 7. Enviar mensaje sobre el pago final
  const msgPayment = `Paga únicamente\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}`;
  try {
    await sendMessageWithTyping(from, msgPayment, 5000);
  } catch (error) {
    console.error("Error al enviar mensaje de pago:", error.message);
    throw error;
  }

  // 8. Enviar mensaje extra con beneficios
  const msgExtra = `Y ESO NO ES TODO!!\n\n🎁 ${formatMessage("GRATIS", "bold")} el Servicio de:\n\n✅ Audio Guest Book\n\nSerá un recuerdo muy bonito de tu evento 😍`;
  try {
    await sendMessageWithTyping(from, msgExtra, 7000);
  } catch (error) {
    console.error("Error al enviar mensaje extra:", error.message);
    throw error;
  }

  // 9. Enviar video promocional
  try {
    await sendWhatsAppVideo(from, videoUrl, '');
    await delay(18000);
  } catch (error) {
    console.error("Error al enviar video:", error.message);
    throw error;
  }

  // 10. Enviar mensaje de contratación
  const msgContrata = `¡Contrata TODO por tan sólo!\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}`;
  try {
    await sendMessageWithTyping(from, msgContrata, 5000);
  } catch (error) {
    console.error("Error al enviar mensaje de contratación:", error.message);
    throw error;
  }

  // 11. Enviar mensaje final detallado
  const msgFinal = `¡SI! ¡Leíste bien!\n\n${includes}\n\n🎁 ${formatMessage("DE REGALO", "bold")}\n${freeItems}\n✅ Un descuento de ${formatPrice(discount)}\n✅ Audio Guest Book\n\nTodo esto por tan sólo 😮\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}\n\n${formatMessage("Más flete, dependiendo de dónde sea tu evento", "italic")} 📍`;
  try {
    await sendMessageWithTyping(from, msgFinal, 18000);
  } catch (error) {
    console.error("Error al enviar mensaje final:", error.message);
    throw error;
  }

  // 12. Enviar recordatorio de vigencia del paquete
  const msgRecuerda = `Recuerda que este paquete solo estará vigente durante el mes de Febrero\n\n🗓️ Separa hoy mismo y asegura tu paquete antes de que te ganen la fecha`;
  try {
    await sendMessageWithTyping(from, msgRecuerda, 15000);
  } catch (error) {
    console.error("Error al enviar recordatorio:", error.message);
    throw error;
  }

  // 13. Enviar mensaje interactivo final con opciones
  try {
    await sendInteractiveMessage(from, '¿Te interesa? 🎊\n\nO prefieres armar tu paquete?\n', [
      { id: 'reservar', title: 'SI, Me interesa 😍' },
      { id: 'armar_paquete', title: '🛠 Armar mi paquete' }
    ]);
  } catch (error) {
    console.error("Error al enviar mensaje interactivo final:", error.message);
    throw error;
  }

  return true;
}


// Función para enviar mensajes con indicador de "escribiendo"
// Esta función reutiliza los servicios de envío y aplica delays y activación/desactivación del indicador
export async function sendMessageWithTyping(from, message, delayTime) {
  try {
    await sendWhatsAppMessage(from, message);
    await activateTypingIndicator(from);
    await delay(delayTime);
    await deactivateTypingIndicator(from);
  } catch (error) {
    console.error("Error en sendMessageWithTyping:", error.message);
    throw error; // Propaga el error para que el flujo lo capture
  }
}


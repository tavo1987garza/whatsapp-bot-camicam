// Importar dependencias en modo ES Modules
import dotenv from 'dotenv'; // Para cargar variables de entorno
import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import NodeCache from 'node-cache';

// Cargar variables de entorno
dotenv.config();

// Crear instancia de Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configurar cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware para manejar JSON (usando express.json())
app.use(express.json());

// Objeto para almacenar el contexto de cada usuario
const userContext = {};

// Función para construir el contexto para OpenAI
function construirContexto() {
  return `
Eres un agente de ventas de "Camicam Photobooth" 😃. 
Nos dedicamos a la renta de servicios para eventos sociales, con especialización en bodas y XV años. 
Ofrecemos los siguientes servicios:
  - Cabina de fotos: $3,500
  - Cabina 360: $3,500
  - Lluvia de mariposas: $2,500
  - Carrito de shots con alcohol: $2,800
  - Letras gigantes: $400 cada una
  - Niebla de piso: $3,000
  - Lluvia matalica: $2,000
  - Scrapbook: $1,300
  - Audio Guest Book: $2,000
  - Chisperos (por pares):  
       • 2 chisperos = $1,000  
       • 4 chisperos = $1,500  
       • 6 chisperos = $2,000  
       • 8 chisperos = $2,500  
       • 10 chisperos = $3,000
  
Atendemos el centro de Monterrey, Nuevo León y el área metropolitana hasta 25 km a la redonda. 
Responde de forma profesional, clara, concisa y persuasiva, como un vendedor experto en nuestros servicios.
  `;
}

// Función para calcular la cotización según los servicios ingresados
function calculateQuotation(servicesText) {
  // Diccionario de servicios y precios
  const prices = {
    "cabina de fotos": 3500,
    "cabina 360": 3500,
    "lluvia de mariposas": 2500,
    "carrito de shots con alcohol": 2800,
    "niebla de piso": 3000,
    "lluvia matalica": 2000,
    "scrapbook": 1300,
    "audio guest book": 2000,
    "letras gigantes": 400 // precio por letra
  };
  // Precios para chisperos según cantidad
  const chisperosPrices = {
    2: 1000,
    4: 1500,
    6: 2000,
    8: 2500,
    10: 3000
  };

  // Se asume que los servicios se ingresan separados por comas
  const servicesArr = servicesText.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  
  let subtotal = 0;
  let serviceCount = 0; // cantidad de servicios (para aplicar descuento)
  let details = [];

  for (const service of servicesArr) {
    if (service.includes("chisperos")) {
      const match = service.match(/chisperos\s*(\d+)/);
      if (match) {
        const qty = parseInt(match[1]);
        if (chisperosPrices[qty]) {
          subtotal += chisperosPrices[qty];
          serviceCount++; // contar como 1 servicio
          details.push(`Chisperos (${qty} unidades): $${chisperosPrices[qty]}`);
        } else {
          details.push(`Chisperos: cantidad inválida (${service})`);
        }
      } else {
        subtotal += chisperosPrices[2];
        details.push(`Chisperos (2 unidades): $${chisperosPrices[2]}`);
      }
    } else if (service.includes("letras gigantes")) {
      details.push("Letras gigantes: se cotiza por letra (ver flujo específico)");
    } else if (prices[service] !== undefined) {
      subtotal += prices[service];
      serviceCount++;
      details.push(`${service.charAt(0).toUpperCase() + service.slice(1)}: $${prices[service]}`);
    } else {
      details.push(`${service}: servicio no reconocido`);
    }
  }
  
  // Aplicar descuento según la cantidad de servicios (con excepciones)
  let discountPercent = 0;
  if (serviceCount === 1) {
    if (servicesArr.length === 1 && servicesArr[0].includes("letras gigantes")) {
      discountPercent = 0;
    } else {
      discountPercent = 10;
    }
  } else if (serviceCount === 2) {
    discountPercent = 25;
  } else if (serviceCount === 3) {
    discountPercent = 30;
  } else if (serviceCount >= 4) {
    discountPercent = 40;
  }
  
  const discountAmount = subtotal * (discountPercent / 100);
  const total = subtotal - discountAmount;
  
  return {
    subtotal,
    discountPercent,
    discountAmount,
    total,
    details
  };
}

// Ruta para la verificación inicial del webhook
app.get('/webhook', (req, res) => {
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
}); 

// Ruta raíz
app.get('/', async (req, res) => {
  res.send('¡Servidor funcionando correctamente! 🚀');
  console.log("Ruta '/' accedida correctamente.");

  try {
    console.log('Enviando mensaje de prueba a WhatsApp...');
    await sendWhatsAppMessage('528133971595', 'hello_world');
    console.log('Mensaje de prueba enviado exitosamente.');
  } catch (error) {
    console.error('Error al enviar mensaje de prueba:', error.message);
  }
});

// Webhook para manejar mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  console.log("📩 Webhook activado:", JSON.stringify(req.body, null, 2));
  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  let userMessage = "";
  if (message.text && message.text.body) {
    userMessage = message.text.body;
  } else if (message.interactive && message.interactive.button_reply) {
    userMessage = message.interactive.button_reply.title || message.interactive.button_reply.id;
  } else if (message.interactive && message.interactive.list_reply) {
    userMessage = message.interactive.list_reply.title || message.interactive.list_reply.id;
  }
  const plataforma = "WhatsApp";

  console.log(`📩 Mensaje de ${from} al CRM: ${userMessage}`);
  try {
    await axios.post('https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje', {
      plataforma,
      remitente: from,
      mensaje: userMessage
    });
    console.log("✅ Respuesta del CRM recibida");
  } catch (error) {
    console.error("❌ Error al enviar mensaje al CRM:", error.message);
  }

  const buttonReply = message?.interactive?.button_reply?.id || '';
  const listReply = message?.interactive?.list_reply?.id || '';
  const messageLower = buttonReply ? buttonReply.toLowerCase() : listReply ? listReply.toLowerCase() : userMessage.toLowerCase();

  console.log("📌 Mensaje recibido:", userMessage);
  console.log("🔘 Botón presionado:", buttonReply);
  console.log("📄 Lista seleccionada:", listReply);

  // Si el usuario ya está en un flujo específico (por ejemplo, armando su paquete), omitimos FAQs.
  if (!userContext[from] || 
      !["EsperandoServicios", "EsperandoFecha", "EsperandoLugar", "EsperandoCantidadLetras"].includes(userContext[from].estado)) {
    if (await handleFAQs(from, userMessage)) return res.sendStatus(200);
  }

  try {
    const handledFlow = await handleUserMessage(from, userMessage, messageLower);
    if (handledFlow) return res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error al manejar el mensaje:", error.message);
    await sendWhatsAppMessage(from, "😔 Lo siento, ocurrió un error al procesar tu solicitud. Inténtalo nuevamente.");
  }
  res.sendStatus(200);
});

// FAQs con emojis y nuevos servicios
const faqs = [
  { question: /como separo mi fecha|anticipo/i, answer: "💡 Separamos fecha con $500. El resto puede ser el día del evento." },
  { question: /hacen contrato|contrato/i, answer: "📄 Sí, una vez acreditado tu anticipo, llenamos tu contrato y te enviamos una foto." },
  { question: /con cuanto tiempo separo mi fecha|separar/i, answer: "⏰ Puedes separar en cualquier momento, siempre que la fecha esté disponible." },
  { question: /se puede separar para 2026|2026/i, answer: "📆 Sí, tenemos agenda abierta para 2025 y 2026." },
  { question: /cuánto se cobra de flete|flete/i, answer: "🚚 Depende de la ubicación del evento. Contáctanos para calcularlo." },
  { question: /cómo reviso si tienen mi fecha disponible/i, answer: "🔎 Dime, ¿para cuándo es tu evento? 😊" },
  { question: /ubicación|dónde están|donde son|ubican|oficinas/i, answer: "📍 Estamos en la Colonia Independencia en Monterrey. Atendemos eventos hasta 25 km a la redonda." },
  { question: /pago|método de pago|tarjeta|efectivo/i, answer: "💳 Aceptamos transferencias, depósitos y pagos en efectivo." },
  { 
    question: /que servicios manejas|servicios/i, 
    answer: "🎉 Estos son los servicios que manejamos:", 
    imageUrl: "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg" 
  },
  { 
    question: /que incluye la cabina de fotos|cabina de fotos/i, 
    answer: "📸 CABINA DE FOTOS: $3,500 (3 horas). Incluye iluminación profesional, fondo personalizado, accesorios temáticos y más.",
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
  { 
    question: /que es el scrapbook|scrapbook/i, 
    answer: "📚 El Scrapbook es un álbum interactivo donde tus invitados se toman fotos y dejan mensajes. ¡Un recuerdo único!",
    images: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-4.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-3.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-2.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-5.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-7.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-6.jpeg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook.mp4"  
    ]
  }
];

// Función para buscar FAQs (retorna el objeto completo)
function findFAQ(userMessage) {
  for (const faq of faqs) {
    if (faq.question.test(userMessage)) {
      return faq;
    }
  }
  return null;
}

// Función para manejar FAQs
async function handleFAQs(from, userMessage) {
  const faqEntry = findFAQ(userMessage);
  if (faqEntry) {
    await sendWhatsAppMessage(from, faqEntry.answer + " 😊");
    if (faqEntry.imageUrl) {
      await sendImageMessage(from, faqEntry.imageUrl, "Nuestros servicios 📸");
    }
    if (faqEntry.images && Array.isArray(faqEntry.images)) {
      for (const imageUrl of faqEntry.images) {
        await sendImageMessage(from, imageUrl, "Detalle visual 🎨");
      }
    }
    if (faqEntry.videoUrl) {
      await sendWhatsAppVideo(from, faqEntry.videoUrl, "Mira este video 🎥");
    }
    if (faqEntry.videos && Array.isArray(faqEntry.videos)) {
      for (const videoUrl of faqEntry.videos) {
        await sendWhatsAppVideo(from, videoUrl, "Video informativo 🎥");
      }
    }
    return true;
  }
  return false;
}

// Función para reportar mensajes al CRM
async function reportMessageToCRM(to, message, tipo = "enviado") {
  const crmUrl = "https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje";
  const crmData = {
    plataforma: "WhatsApp",
    remitente: to,
    mensaje: message,
    tipo: tipo
  };
  console.log("Enviando al CRM:", crmData);
  try {
    const response = await axios.post(crmUrl, crmData, { timeout: 5000 });
    console.log("✅ Reporte al CRM exitoso:", response.data);
  } catch (error) {
    console.error("❌ Error al reportar al CRM:", error.response?.data || error.message);
    throw error;
  }
}

// Función para enviar mensajes simples con emojis
async function sendWhatsAppMessage(to, message) {
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
    console.error("❌ ERROR: Credenciales de WhatsApp no configuradas correctamente.");
    return;
  }
  if (!to || !message) {
    console.error("❌ ERROR: El número de destino y el mensaje son obligatorios.");
    return;
  }
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: message }
  };
  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    console.log('✅ Mensaje enviado a WhatsApp:', response.data);
    const mensajeHTML = `<p>${message}</p>`;
    await reportMessageToCRM(to, mensajeHTML, "enviado");
  } catch (error) {
    if (error.response) {
      console.error('❌ Error en la respuesta de WhatsApp:', error.response.data);
    } else if (error.request) {
      console.error('❌ No se recibió respuesta de WhatsApp:', error.request);
    } else {
      console.error('❌ Error en la solicitud:', error.message);
    }
  }
}

// Función para enviar mensajes interactivos con botones
async function sendInteractiveMessage(to, body, buttons) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
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
          reply: {
            id: button.id,
            title: button.title
          }
        }))
      }
    }
  };
  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Mensaje interactivo enviado:', response.data);
    const resumen = `
      <div>
        <p>${body}</p>
        <ul>
          ${buttons.map(b => `<li>${b.title}</li>`).join('')}
        </ul>
      </div>
    `;
    await reportMessageToCRM(to, resumen, "enviado");
  } catch (error) {
    console.error('Error al enviar mensaje interactivo:', error.response?.data || error.message);
  }
}

// Función para enviar mensajes interactivos con imagen y control de estado
async function sendInteractiveMessageWithImageWithState(from, message, imageUrl, options, estadoEsperado) {
  await sendMessageWithTypingWithState(from, message, 3000, estadoEsperado);
  if (userContext[from].estado !== estadoEsperado) return;
  await sendImageMessage(from, imageUrl);
  await delay(10000);
  if (userContext[from].estado !== estadoEsperado) return;
  await sendInteractiveMessage(from, options.message, options.buttons);
}

// Función para enviar videos
async function sendWhatsAppVideo(to, videoUrl, caption) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'video',
    video: {
      link: videoUrl,
      caption: caption
    }
  };
  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Video enviado:', response.data);
    const resumen = `
      <div>
        <video controls style="max-width:200px;">
          <source src="${videoUrl}" type="video/mp4">
          Tu navegador no soporta la etiqueta de video.
        </video>
        ${ caption ? `<p>Caption: ${caption}</p>` : '' }
      </div>
    `;
    await reportMessageToCRM(to, resumen, "enviado");
  } catch (error) {
    console.error('❌ Error al enviar el video:', error.response?.data || error.message);
  }
}

// Función para enviar imágenes
async function sendImageMessage(to, imageUrl, caption) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'image',
    image: {
      link: imageUrl,
      caption: caption
    }
  };
  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Imagen enviada:', response.data);
    const resumen = `
      <div>
        <img src="${imageUrl}" alt="Imagen enviada" style="max-width:200px;">
        ${ caption ? `<p>Caption: ${caption}</p>` : '' }
      </div>
    `;
    await reportMessageToCRM(to, resumen, "enviado");
  } catch (error) {
    console.error('Error al enviar imagen:', error.response?.data || error.message);
  }
}

// Función para enviar mensajes con indicador de escritura
async function sendMessageWithTyping(from, message, delayTime) {
  await activateTypingIndicator(from);
  await delay(delayTime);
  await sendWhatsAppMessage(from, message);
  await deactivateTypingIndicator(from);
}

// Función interna para enviar mensajes con indicador de escritura y control de estado
async function sendMessageWithTypingWithState(from, message, delayTime, estadoEsperado) {
  console.log(`Iniciando sendMessageWithTypingWithState para ${from} con estado esperado: ${estadoEsperado}`);
  await activateTypingIndicator(from);
  await delay(delayTime);
  console.log(`Estado actual de ${from}: ${userContext[from].estado}`);
  if (userContext[from].estado === estadoEsperado) {
    console.log(`Enviando mensaje: "${message}" a ${from}`);
    await sendWhatsAppMessage(from, message);
  } else {
    console.log(`No se envía mensaje porque el estado no coincide.`);
  }
  await deactivateTypingIndicator(from);
}

// Función para crear un retraso
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Función para activar el indicador de "escribiendo"
async function activateTypingIndicator(to) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const headers = {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'typing',
    status: 'typing'
  };
  try {
    await axios.post(url, data, { headers });
    console.log('✅ Indicador de "escribiendo" activado');
  } catch (error) {
    console.error('❌ Error al activar el indicador de "escribiendo":', error.response?.data || error.message);
  }
}

// Función para desactivar el indicador de "escribiendo"
async function deactivateTypingIndicator(to) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const headers = {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'typing',
    status: 'paused'
  };
  try {
    await axios.post(url, data, { headers });
    console.log('✅ Indicador de "escribiendo" desactivado');
  } catch (error) {
    console.error('❌ Error al desactivar el indicador de "escribiendo":', error.response?.data || error.message);
  }
}

// Función para validar el formato de la fecha (DD/MM/AAAA)
function isValidDate(dateString) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/; // Formato DD/MM/AAAA
  if (!regex.test(dateString)) return false;
  const [day, month, year] = dateString.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

// Función para verificar disponibilidad (simulada)
function checkAvailability(dateString) {
  const occupiedDates = ['15/02/2024', '20/02/2024'];
  return !occupiedDates.includes(dateString);
}

// Función para manejar el flujo de mensajes del usuario
async function handleUserMessage(from, userMessage, messageLower) {
  if (!userContext[from]) {
    userContext[from] = {
      estado: "Contacto Inicial",
      tipoEvento: null,
      nombre: null,
      fecha: null,
      lugar: null,
      serviciosSeleccionados: null,
      total: 0
    };
  }
  const context = userContext[from];

  // 1. Inicio: preguntar el tipo de evento y mostrar imagen de servicios
  if (context.estado === "Contacto Inicial") {
    await sendInteractiveMessageWithImageWithState(
      from,
      "¡Bienvenido a Camicam Photobooth! 😃 Conoce nuestros servicios:",
      "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg",
      {
        message: "Por favor selecciona el tipo de evento que tienes:",
        buttons: [
          { id: "evento_boda", title: "Boda" },
          { id: "evento_xv", title: "XV Años" },
          { id: "evento_otro", title: "Otro" }
        ]
      },
      "Contacto Inicial"
    );
    context.estado = "EsperandoTipoEvento";
    return true;
  }

  // 2. Capturar el tipo de evento
  if (context.estado === "EsperandoTipoEvento") {
    if (messageLower.includes("boda") || messageLower.includes("evento_boda")) {
      context.tipoEvento = "Boda";
    } else if (messageLower.includes("xv") || messageLower.includes("quince")) {
      context.tipoEvento = "XV";
    } else {
      context.tipoEvento = "Otro";
    }
    // Enviar opciones con botones para elegir entre paquete sugerido o armar
    await sendInteractiveMessage(from, `¡Perfecto! Has seleccionado: ${context.tipoEvento} 👍. ¿Qué deseas hacer?`, [
      { id: "armar_paquete", title: "Armar mi paquete" },
      { id: "paquete_sugerido", title: "Ver paquete sugerido" }
    ]);
    context.estado = "OpcionesSeleccionadas";
    return true;
  }

  // 3. Opciones: paquete sugerido o armar
  if (context.estado === "OpcionesSeleccionadas") {
    if (messageLower.includes("armar")) {
      await sendWhatsAppMessage(from, "¡Genial! 😃 Por favor indícanos los servicios que deseas incluir en tu paquete. (Ejemplo: cabina de fotos, niebla de piso, Scrapbook, chisperos 4)");
      context.estado = "EsperandoServicios";
      return true;
    } else if (messageLower.includes("paquete")) {
      if (context.tipoEvento === "Boda") {
        context.serviciosSeleccionados = "Paquete Wedding: Incluye Cabina 360, iniciales (ej. A&A y un corazón), 2 chisperos y un carrito de shots con alcohol, todo por $4,450.";
      } else if (context.tipoEvento === "XV") {
        context.serviciosSeleccionados = "Paquete Mis XV: Incluye 6 letras gigantes, Cabina de fotos, Lluvia de mariposas y 2 chisperos, todo por $5,600.";
      } else {
        context.serviciosSeleccionados = "Paquete Party: Incluye Cabina de fotos, 4 letras gigantes y un carrito de shots con alcohol, todo por $4,450.";
      }
      await sendWhatsAppMessage(from, `👍 Has seleccionado el paquete sugerido para ${context.tipoEvento}: ${context.serviciosSeleccionados}`);
      await sendWhatsAppMessage(from, "Para continuar, por favor indícanos la fecha de tu evento (Formato DD/MM/AAAA) 📆.");
      context.estado = "EsperandoFecha";
      return true;
    } else {
      await sendWhatsAppMessage(from, "😕 No entendí tu respuesta. Por favor selecciona 'paquete' o 'armar' utilizando los botones.");
      return true;
    }
  }

  // 4. Estado EsperandoServicios: guardar servicios y calcular cotización
  if (context.estado === "EsperandoServicios") {
    context.serviciosSeleccionados = userMessage;
    const cotizacion = calculateQuotation(userMessage);
    let mensajeCotizacion = "💰 *Tu cotización:* \n";
    mensajeCotizacion += `Subtotal: $${cotizacion.subtotal.toFixed(2)}\n`;
    mensajeCotizacion += `Descuento (${cotizacion.discountPercent}%): -$${cotizacion.discountAmount.toFixed(2)}\n`;
    mensajeCotizacion += `Total a pagar: $${cotizacion.total.toFixed(2)}\n\n`;
    mensajeCotizacion += "Detalle:\n" + cotizacion.details.join("\n");
    await sendWhatsAppMessage(from, mensajeCotizacion + "\n\n¡Gracias por tu interés! Ahora, por favor indícanos la fecha de tu evento (Formato DD/MM/AAAA) 📆.");
    context.estado = "EsperandoFecha";
    return true;
  }

  // 5. Procesar la fecha del evento
  if (context.estado === "EsperandoFecha") {
    if (!isValidDate(userMessage)) {
      await sendWhatsAppMessage(from, "😕 El formato de la fecha es incorrecto. Usa el formato DD/MM/AAAA.");
      return true;
    }
    if (!checkAvailability(userMessage)) {
      await sendWhatsAppMessage(from, "😔 Lo siento, la fecha seleccionada no está disponible. Elige otra o contáctanos para más detalles.");
      context.estado = "Finalizado";
      return true;
    }
    context.fecha = userMessage;
    await sendWhatsAppMessage(from, "¡Genial! La fecha está disponible. Ahora, ¿podrías indicarnos en dónde se realizará tu evento? 🏢");
    context.estado = "EsperandoLugar";
    return true;
  }

  // 6. Procesar la ubicación del evento
  if (context.estado === "EsperandoLugar") {
    context.lugar = userMessage;
    await sendWhatsAppMessage(from, "¡Perfecto! Hemos registrado la fecha y el lugar de tu evento. Un agente se pondrá en contacto contigo para afinar los detalles. ¡Gracias por elegir Camicam Photobooth! 🎉");
    context.estado = "Finalizado";
    return true;
  }

  // Rama para "letras gigantes" en otros flujos (si aplica)
  if (!["Contacto Inicial", "EsperandoTipoEvento", "OpcionesSeleccionadas", "EsperandoFecha", "EsperandoLugar", "EsperandoCantidadLetras"].includes(context.estado)) {
    if (messageLower.includes("letras gigantes")) {
      await sendWhatsAppMessage(from, "¿Cuántas letras ocupas? 🔠");
      context.estado = "EsperandoCantidadLetras";
      return true;
    }
  }
  if (context.estado === "EsperandoCantidadLetras") {
    const soloLetras = userMessage.replace(/[^a-zA-Z]/g, '');
    const cantidad = soloLetras.length;
    if (cantidad === 0) {
      await sendWhatsAppMessage(from, "No pude identificar ninguna letra. Indícame el nombre o cuántas letras necesitas.");
      return true;
    }
    const precioTotal = cantidad * 400;
    await sendWhatsAppMessage(from, `El precio para ${cantidad} letra(s) es $${precioTotal} 💸.`);
    context.estado = "Finalizado";
    return true;
  }

  // Otros casos: enviar consulta a OpenAI
  try {
    const responseCache = new NodeCache({ stdTTL: 3600 });
    function getCacheKey(query) {
      return query.toLowerCase();
    }
    async function getResponseFromOpenAI(query) {
      const contextoPaquetes = construirContexto();
      const fullQuery = `
${contextoPaquetes}

El cliente pregunta: "${query}"
Responde de forma profesional, clara y concisa, utilizando el contexto proporcionado.
      `;
      const key = getCacheKey(fullQuery);
      const cachedResponse = responseCache.get(key);
      if (cachedResponse) {
        console.log("Usando respuesta en caché para la consulta:", fullQuery);
        return cachedResponse;
      }
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Eres un agente de ventas de servicios para eventos. Responde de forma breve, clara y concisa." },
          { role: "user", content: fullQuery }
        ],
        temperature: 0.7,
        max_tokens: 80,
      });
      const answer = response.choices[0].message.content;
      if (!answer || answer.trim() === "") {
        throw new Error("Respuesta vacía");
      }
      responseCache.set(key, answer);
      return answer;
    }
    async function handleOpenAIResponse(from, userMessage) {
      try {
        const answer = await getResponseFromOpenAI(userMessage);
        await sendWhatsAppMessage(from, answer);
        if (answer.includes("Lamentablemente, la información proporcionada no incluye detalles")) {
          const adminMessage = `El cliente ${from} preguntó: "${userMessage}" y la respuesta fue: "${answer}". Se requiere intervención humana.`;
          await sendWhatsAppMessage(process.env.ADMIN_WHATSAPP_NUMBER, adminMessage);
        }
      } catch (error) {
        console.error("Error de OpenAI:", error.message);
        const adminMessage = `El cliente ${from} preguntó: "${userMessage}" y OpenAI no pudo responder. Se requiere intervención humana.`;
        await sendWhatsAppMessage(process.env.ADMIN_WHATSAPP_NUMBER, adminMessage);
        await sendWhatsAppMessage(from, "Tu consulta requiere intervención de un agente. Pronto nos pondremos en contacto contigo.");
      }
    }
    await handleOpenAIResponse(from, userMessage);
    return true;
  } catch (error) {
    console.error("❌ Error en handleUserMessage:", error.message);
    await sendWhatsAppMessage(from, "😔 Lo siento, ocurrió un error.");
    return false;
  }
}

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});

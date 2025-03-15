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

// Middleware para manejar JSON
app.use(express.json());

// Objeto para almacenar el contexto de cada usuario
const userContext = {};

// Objeto para asociar servicios a medios (imágenes y videos)
const mediaMapping = {
  "cabina de fotos": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-2.jpg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Blanca.mp4"
    ]
  },
  "cabina 360": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Rosa.mp4"
    ]
  },
  "lluvia de mariposas": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/lluvia1.jpg"
    ],
    videos: []
  },
  "carrito de shots con alcohol": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/carrito1.jpg"
    ],
    videos: []
  },
  "niebla de piso": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/niebla1.jpg"
    ],
    videos: []
  },
  "scrapbook": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-4.jpeg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook.mp4"
    ]
  },
  "audio guest book": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/audio1.jpg"
    ],
    videos: []
  },
  "letras gigantes": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"
    ]
  },
  "chisperos": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/chisperos1.jpg"
    ],
    videos: []
  }
};

// Función para construir el contexto para OpenAI (ajustado para sonar más humano)
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

// Función para calcular la cotización y retornar los servicios reconocidos
function calculateQuotation(servicesText) {
  // Diccionario de precios
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

  // Separar servicios (se asume que están separados por comas)
  const servicesArr = servicesText.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  
  let subtotal = 0;
  let serviceCount = 0; // para descuentos
  let details = [];
  let servicesRecognized = []; // servicios reconocidos y para enviar medios
  let letrasGigantesCount = 0; // Contador de letras gigantes

  for (const service of servicesArr) {
    if (service.includes("chisperos")) {
      const match = service.match(/chisperos\s*(\d+)/);
      if (match) {
        const qty = parseInt(match[1]);
        if (chisperosPrices[qty]) {
          subtotal += chisperosPrices[qty];
          serviceCount++;
          details.push(`Chisperos (${qty} unidades): $${chisperosPrices[qty]}`);
          servicesRecognized.push("chisperos");
        } else {
          details.push(`Chisperos: cantidad inválida (${service})`);
        }
      } else {
        subtotal += chisperosPrices[2];
        details.push(`Chisperos (2 unidades): $${chisperosPrices[2]}`);
        servicesRecognized.push("chisperos");
      }
    } else if (service.includes("letras gigantes")) {
      // Extraer la cantidad de letras (si se especifica)
      const match = service.match(/letras gigantes\s*(\d+)/);
      if (match) {
        const qty = parseInt(match[1]);
        const precioLetras = qty * prices["letras gigantes"];
        subtotal += precioLetras;
        serviceCount++;
        details.push(`Letras gigantes (${qty} unidades): $${precioLetras}`);
        servicesRecognized.push("letras gigantes");
        letrasGigantesCount = qty; // Guardar la cantidad de letras
      } else {
        // Si no se especifica la cantidad, se asume 1 letra
        subtotal += prices["letras gigantes"];
        serviceCount++;
        details.push(`Letras gigantes (1 unidad): $${prices["letras gigantes"]}`);
        servicesRecognized.push("letras gigantes");
        letrasGigantesCount = 1; // Guardar la cantidad de letras
      }
    } else if (prices[service] !== undefined) {
      subtotal += prices[service];
      serviceCount++;
      details.push(`${service.charAt(0).toUpperCase() + service.slice(1)}: $${prices[service]}`);
      servicesRecognized.push(service);
    } else {
      details.push(`${service}: servicio no reconocido`);
    }
  }
  
  // Aplicar descuento según cantidad de servicios y reglas específicas
  let discountPercent = 0;

  // Regla especial para letras gigantes
  if (letrasGigantesCount >= 2) {
    discountPercent = 10; // 10% de descuento si se piden 2 o más letras
  } else if (serviceCount === 1) {
    if (servicesArr.length === 1 && servicesArr[0].includes("letras gigantes")) {
      discountPercent = 0; // No hay descuento para una sola letra
    } else {
      discountPercent = 10; // 10% de descuento para un solo servicio (excepto letras gigantes)
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
    details,
    servicesRecognized
  };
}

// Rutas (webhook, raíz, etc.)
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

app.get('/', async (req, res) => {
  res.send('¡Servidor funcionando correctamente! 🚀');
  console.log("Ruta '/' accedida correctamente.");
  try {
    console.log('Enviando mensaje de prueba a WhatsApp...');
    await sendWhatsAppMessage('528133971595', 'Hola, ¿en qué puedo ayudarte hoy? 😊');
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
  
  // Si el usuario ya está en un flujo específico, se omite el chequeo de FAQs (excepto en dudas)
  if (!userContext[from] || !["EsperandoServicios", "EsperandoFecha", "EsperandoLugar", "EsperandoCantidadLetras", "EsperandoDudas"].includes(userContext[from].estado)) {
    if (await handleFAQs(from, userMessage)) return res.sendStatus(200);
  }
  
  try {
    const handledFlow = await handleUserMessage(from, userMessage, messageLower);
    if (handledFlow) return res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error al manejar el mensaje:", error.message);
    await sendWhatsAppMessage(from, "😔 Perdona, hubo un problema al procesar tu solicitud. ¿Podrías intentarlo de nuevo?");
  }
  res.sendStatus(200);
});

  // 📌 Endpoint para recibir mensajes desde el CRM y enviarlos a WhatsApp
  app.post('/enviar_mensaje', async (req, res) => {
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
  });

// FAQs con emojis y nuevos servicios
const faqs = [
  { question: /como separo mi fecha|anticipo/i, answer: "💡 Para reservar tu fecha se requiere un anticipo de $500. ¡Así nos aseguramos de ofrecerte lo mejor!" },
  { question: /hacen contrato|contrato/i, answer: "📄 ¡Sí! Una vez que se acredite el anticipo, preparamos el contrato y te enviamos una copia." },
  { question: /con cuanto tiempo separo mi fecha|separar/i, answer: "⏰ Puedes separar tu fecha en cualquier momento, siempre y cuando esté disponible." },
  { question: /se puede separar para 2026|2026/i, answer: "📆 Claro, tenemos agenda para 2025 y 2026. ¡Consulta sin compromiso!" },
  { question: /cuánto se cobra de flete|flete/i, answer: "🚚 El flete varía según la ubicación. Contáctanos y lo calculamos juntos." },
  { question: /cómo reviso si tienen mi fecha disponible/i, answer: "🔎 Cuéntame, ¿para cuándo es tu evento? Así reviso la disponibilidad." },
  { question: /ubicación|dónde están|donde son|ubican|oficinas/i, answer: "📍 Nos encontramos en la Colonia Independencia en Monterrey. Cubrimos hasta 25 km a la redonda." },
  { question: /pago|método de pago|tarjeta|efectivo/i, answer: "💳 Aceptamos transferencias, depósitos y pagos en efectivo. ¡Lo que te resulte más cómodo!" },
  { 
    question: /que servicios manejas|servicios/i, 
    answer: "🎉 Aquí tienes nuestros servicios:",
    imageUrl: "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg" 
  },
  { 
    question: /que incluye la cabina de fotos|cabina de fotos/i, 
    answer: "📸 La CABINA DE FOTOS incluye 3 horas de servicio, iluminación profesional, fondo personalizado, accesorios temáticos y más.",
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
    answer: "📚 El Scrapbook es un álbum interactivo donde tus invitados se toman fotos y dejan mensajes para que recuerdes cada detalle.",
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
      await sendImageMessage(from, faqEntry.imageUrl, "¡Mira nuestros servicios!");
    }
    if (faqEntry.images && Array.isArray(faqEntry.images)) {
      for (const imageUrl of faqEntry.images) {
        await sendImageMessage(from, imageUrl, "Detalle visual");
      }
    }
    if (faqEntry.videoUrl) {
      await sendWhatsAppVideo(from, faqEntry.videoUrl, "Revisa este video");
    }
    if (faqEntry.videos && Array.isArray(faqEntry.videos)) {
      for (const videoUrl of faqEntry.videos) {
        await sendWhatsAppVideo(from, videoUrl, "Video informativo");
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
  await delay(2000); 
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

// Función para manejar el flujo de mensajes del usuario con tono natural
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

// 1. Inicio: dar la bienvenida y mostrar opciones con imagen
if (context.estado === "Contacto Inicial") {
  // Mensaje inicial explicando que es un asistente virtual
  await sendMessageWithTypingWithState(
    from,
    "¡Hola! 👋 Soy tu asistente virtual de *Camicam Photobooth*. \n\nConoce los Servicios que ofrecemos",
    3000, // Retraso de 3 segundos
    "Contacto Inicial"
  );

  // Enviar la imagen de servicios con un retraso
  await delay(5000); // Retraso de 5 segundos antes de enviar la imagen
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg");

  // Enviar los botones con otro retraso
  await delay(5000); // Retraso de 5 segundos antes de enviar los botones
  await sendInteractiveMessage(
    from,
    "Para una mejor experiencia, por favor interactúa con los botones que te mostraré a continuación 😊\n\nSelecciona el tipo de evento que tienes: 👇",
    [
      { id: "evento_boda", title: "💍 Boda" },
      { id: "evento_xv", title: "🎉 XV Años" },
      { id: "evento_otro", title: "🎊 Otro" }
    ]
  );

  // Actualizar el estado del contexto
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
  // Enviar botones para elegir entre paquete sugerido o armar paquete
  await sendInteractiveMessage(from, `¡Qué emoción! 😊\n\n¡Muchas felicidades por tu celebración! ✨ \n\nAhora, ¿qué te gustaría hacer?`, [
    { id: "paquete_sugerido", title: "Ver paquete sugerido" },
    { id: "armar_paquete", title: "🛠️ Armar mi paquete" }
  ]);
  context.estado = "OpcionesSeleccionadas";
  return true;
}

 // 3. Opciones: paquete sugerido o armar paquete
if (context.estado === "OpcionesSeleccionadas") {
  console.log("Valor recibido en OpcionesSeleccionadas:", messageLower);

  if (messageLower === "armar_paquete") {
    // Mensaje con retraso para simular interacción humana
    await sendMessageWithTypingWithState(
      from,
      "¡Genial! 😃 Vamos a armar tu paquete personalizado.\n\nPor favor, indícame los servicios que deseas incluir.\n\n✏️ Escribe separado por comas por ejemplo: \n\ncabina de fotos, niebla de piso, scrapbook, chisperos 4, letras gigantes 4",
      2000, // Retraso de 2 segundos
      "OpcionesSeleccionadas"
    );
    context.estado = "EsperandoServicios";
    return true;
  } else if (messageLower === "paquete_sugerido") {
    // Determinar el paquete sugerido según el tipo de evento
    let paqueteSugerido;
    if (context.tipoEvento === "Boda") {
      paqueteSugerido = "🎉 *Paquete Wedding*: Incluye Cabina 360, iniciales decorativas, 2 chisperos y un carrito de shots con alcohol, todo por *$4,450*.";
    } else if (context.tipoEvento === "XV") {
      paqueteSugerido = "🎂 *Paquete Mis XV*: Incluye 6 letras gigantes, Cabina de fotos, Lluvia de mariposas y 2 chisperos, todo por *$5,600*.";
    } else {
      paqueteSugerido = "🎈 *Paquete Party*: Incluye Cabina de fotos, 4 letras gigantes y un carrito de shots con alcohol, todo por *$4,450*.";
    }

    // Enviar mensaje con el paquete sugerido
    await sendMessageWithTypingWithState(
      from,
      `¡Perfecto! 🎊 Has seleccionado el paquete sugerido para *${context.tipoEvento}*: ${paqueteSugerido}`,
      2000, // Retraso de 2 segundos
      "OpcionesSeleccionadas"
    );

    // Solicitar la fecha del evento
    await sendMessageWithTypingWithState(
      from,
      "Para continuar, por favor indícame la fecha de tu evento (Formato DD/MM/AAAA) 📆.",
      2000, // Retraso de 2 segundos
      "OpcionesSeleccionadas"
    );

    context.estado = "EsperandoFecha";
    return true;
  } else {
    // Mensaje de error si no se selecciona una opción válida
    await sendMessageWithTypingWithState(
      from,
      "😕 No entendí tu respuesta. Por favor, selecciona una opción válida utilizando los botones:",
      2000, // Retraso de 2 segundos
      "OpcionesSeleccionadas"
    );

    // Reenviar los botones para que el usuario seleccione nuevamente
    await sendInteractiveMessage(
      from,
      "Elige una opción para continuar:",
      [
        { id: "armar_paquete", title: "✨ Armar mi paquete" },
        { id: "paquete_sugerido", title: "📦 Ver paquete sugerido" }
      ]
    );

    return true;
  }
}
  // 4. Estado EsperandoServicios: procesar servicios, calcular cotización y enviar mensajes en orden
  if (context.estado === "EsperandoServicios") {
    context.serviciosSeleccionados = userMessage;
    const cotizacion = calculateQuotation(userMessage);
    
    // Enviar cotización: título y detalles
    const mensajeCotizacion = "💰 *Tu cotización:*\nDetalle:\n" + cotizacion.details.join("\n");
    await sendWhatsAppMessage(from, mensajeCotizacion);
    
    // Enviar resumen: subtotal, descuento y total
    const mensajeResumen = `Subtotal: $${cotizacion.subtotal.toFixed(2)}\nDescuento (${cotizacion.discountPercent}%): -$${cotizacion.discountAmount.toFixed(2)}\nTotal a pagar: $${cotizacion.total.toFixed(2)}`;
    await sendWhatsAppMessage(from, mensajeResumen);
    
    // Enviar imágenes y videos asociados a los servicios reconocidos
    if (cotizacion.servicesRecognized && cotizacion.servicesRecognized.length > 0) {
      for (const service of cotizacion.servicesRecognized) {
        if (mediaMapping[service]) {
          // Enviar imágenes
          if (mediaMapping[service].images && mediaMapping[service].images.length > 0) {
            for (const img of mediaMapping[service].images) {
              await sendImageMessage(from, img, `${service} - imagen`);
            }
          }
          // Enviar videos
          if (mediaMapping[service].videos && mediaMapping[service].videos.length > 0) {
            for (const vid of mediaMapping[service].videos) {
              await sendWhatsAppVideo(from, vid, `${service} - video`);
            }
          }
        }
      }
    }
    
    // Preguntar si desea agregar algo más o si tiene dudas
    await sendWhatsAppMessage(from, "¿Deseas agregar algo más o tienes alguna duda?");
    context.estado = "EsperandoDudas";
    return true;
  }


// 5. Estado EsperandoDudas: manejar las preguntas adicionales o agregar servicios
if (context.estado === "EsperandoDudas") {
  // Si el mensaje menciona "flete", preguntamos por fecha y lugar
  if (messageLower.includes("flete")) {
    await sendWhatsAppMessage(from, "Para cotizar el flete, por favor indícame la fecha de tu evento y en qué lugar se realizará.");
    context.estado = "EsperandoFecha";
    return true;
  }
  
  // Verificar si el cliente quiere agregar un servicio adicional
  const serviceKeywords = ["scrapbook", "cabina de fotos", "cabina 360", "lluvia de mariposas", "carrito de shots", "niebla de piso", "audio guest book", "chisperos", "letras gigantes"];
  let foundService = false;
  let newService = "";
  
  for (const keyword of serviceKeywords) {
    if (messageLower.includes(keyword)) {
      foundService = true;
      newService = keyword; // Guardamos el servicio encontrado
      // Si el servicio aún no estaba incluido, lo agregamos
      if (!context.serviciosSeleccionados.toLowerCase().includes(keyword)) {
        context.serviciosSeleccionados += `, ${keyword}`;
      }
      // Recalcular la cotización con el nuevo servicio agregado
      const newQuotation = calculateQuotation(context.serviciosSeleccionados);
      await sendWhatsAppMessage(from, "Actualicemos tu cotización:");
      await sendWhatsAppMessage(from, "💰 *Tu nueva cotización:*\nDetalle:\n" + newQuotation.details.join("\n"));
      await sendWhatsAppMessage(from, `Subtotal: $${newQuotation.subtotal.toFixed(2)}\nDescuento (${newQuotation.discountPercent}%): -$${newQuotation.discountAmount.toFixed(2)}\nTotal a pagar: $${newQuotation.total.toFixed(2)}`);
      
      // Enviar solo las imágenes y videos correspondientes al nuevo servicio agregado
      if (mediaMapping[newService]) {
        if (mediaMapping[newService].images && mediaMapping[newService].images.length > 0) {
          for (const img of mediaMapping[newService].images) {
            await sendImageMessage(from, img, `${newService} - imagen`);
          }
        }
        if (mediaMapping[newService].videos && mediaMapping[newService].videos.length > 0) {
          for (const vid of mediaMapping[newService].videos) {
            await sendWhatsAppVideo(from, vid, `${newService} - video`);
          }
        }
      }
      
      await sendWhatsAppMessage(from, "¿Deseas agregar algo más o tienes alguna duda?");
      break;
    }
  }
  
  if (foundService) return true;
  
  // Intentar manejar FAQs (por ejemplo: "¿Cómo separo mi fecha?", "¿Con cuánto separo?" o "¿Piden anticipo?")
  if (await handleFAQs(from, userMessage)) return true;
  
  // Si no se activa ninguna FAQ, pedir mayor precisión
  await sendWhatsAppMessage(from, "¿Podrías especificar tu duda o si deseas agregar algún servicio adicional?");
  return true;
}


  // 6. Procesar la fecha del evento
  if (context.estado === "EsperandoFecha") {
    if (!isValidDate(userMessage)) {
      await sendWhatsAppMessage(from, "😕 El formato de la fecha es incorrecto. Por favor utiliza el formato DD/MM/AAAA.");
      return true;
    }
    if (!checkAvailability(userMessage)) {
      await sendWhatsAppMessage(from, "😔 Lo siento, esa fecha ya está reservada. Prueba con otra o contáctanos para más detalles.");
      context.estado = "Finalizado";
      return true;
    }
    context.fecha = userMessage;
    await sendWhatsAppMessage(from, "¡Perfecto! La fecha está disponible. Ahora, ¿podrías decirme en qué lugar se realizará tu evento? 🏢");
    context.estado = "EsperandoLugar";
    return true;
  }

  // 7. Procesar la ubicación del evento
  if (context.estado === "EsperandoLugar") {
    context.lugar = userMessage;
    await sendWhatsAppMessage(from, "¡Genial! Ya tenemos la fecha y el lugar. Un agente se pondrá en contacto contigo para ultimar los detalles. ¡Gracias por confiar en Camicam Photobooth! 🎉");
    context.estado = "Finalizado";
    return true;
  }

  // Rama para "letras gigantes" en otros flujos (si aplica)
  if (!["Contacto Inicial", "EsperandoTipoEvento", "OpcionesSeleccionadas", "EsperandoFecha", "EsperandoLugar", "EsperandoCantidadLetras"].includes(context.estado)) {
    if (messageLower.includes("letras gigantes")) {
      await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
      context.estado = "EsperandoCantidadLetras";
      return true;
    }
  }

  if (context.estado === "EsperandoCantidadLetras") {
  // Intentamos extraer el nombre si el mensaje incluye la frase "nombre de"
  let nombre = "";
  const regex = /nombre de\s+([a-zA-Z]+)/i;
  const match = userMessage.match(regex);
  if (match && match[1]) {
    nombre = match[1];
  } else {
    // Si no se detecta el patrón, asumimos que el mensaje completo es el nombre o la cantidad
    nombre = userMessage;
  }
  // Eliminamos cualquier carácter que no sea letra
  const soloLetras = nombre.replace(/[^a-zA-Z]/g, '');
  const cantidad = soloLetras.length;
  if (cantidad === 0) {
    await sendWhatsAppMessage(from, "No pude identificar ninguna letra. Por favor, indícame el nombre o la cantidad de letras que deseas.");
    return true;
  }
  const precioTotal = cantidad * 400;
  await sendWhatsAppMessage(from, `El precio para ${cantidad} letra(s) es de $${precioTotal} 💸.`);
  context.estado = "Finalizado";
  return true;
}


  // Otros casos: enviar consulta a OpenAI para respuestas adicionales
  try {
    const responseCache = new NodeCache({ stdTTL: 3600 });
    function getCacheKey(query) {
      return query.toLowerCase();
    }
    async function getResponseFromOpenAI(query) {
      const contextoPaquetes = construirContexto();
      const fullQuery = `
${contextoPaquetes}

El cliente dice: "${query}"
Responde de forma clara, profesional y cercana, utilizando el contexto proporcionado.
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
          { role: "system", content: "Eres un asesor de ventas amigable y cercano en servicios para eventos. Responde de forma breve, clara y natural." },
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
        await sendWhatsAppMessage(from, "Tu consulta requiere la intervención de un agente. Pronto nos pondremos en contacto contigo.");
      }
    }
    await handleOpenAIResponse(from, userMessage);
    return true;
  } catch (error) {
    console.error("❌ Error en handleUserMessage:", error.message);
    await sendWhatsAppMessage(from, "😔 Perdona, ocurrió un error inesperado. Por favor, inténtalo de nuevo.");
    return false;
  }
}

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});

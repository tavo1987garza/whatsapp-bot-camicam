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

// Instancia global de caché para respuestas de OpenAI (disponible en todo el código)
const responseCache = new NodeCache({ stdTTL: 3600 });


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
    "carrito de shots sin alcohol": 2200,
    "niebla de piso": 3000,
    "lluvia matálica": 2000,
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
  let serviceCount = 0; // para aplicar descuentos
  let details = [];
  let servicesRecognized = [];
  let letrasCount = 0;

  for (const service of servicesArr) {
    // Caso de chisperos (o chispero)
    if (/chispero[s]?\b/i.test(service)) {
      const match = service.match(/chispero[s]?\s*(\d+)/i);
      if (match && match[1]) {
        // Si hay cantidad, procesar normalmente
        const qty = parseInt(match[1]);
        if (chisperosPrices[qty]) {
          subtotal += chisperosPrices[qty];
          serviceCount++;
          details.push(`🔸 *${qty} Chisperos*: $${chisperosPrices[qty].toLocaleString()}`);
          servicesRecognized.push("chisperos");
        } else {
          details.push(`🔸 Chisperos: cantidad inválida (${service})`);
        }
      } else {
        // Si no hay cantidad, retornar un objeto indicando que falta la cantidad
        return {
          error: true,
          needsInput: 'chisperos',
          details: ["🔸 *Chisperos*: Por favor, indícanos cuántos chisperos necesitas."],
          subtotal: 0,
          discountPercent: 0,
          discountAmount: 0,
          total: 0,
          servicesRecognized: []
        };
      }
    }

    // Caso de letras o letras gigantes
    else if (/letras(?:\s*gigantes)?\b/.test(service)) {
      const match = service.match(/letras(?:\s*gigantes)?\s*(\d+)/);
      if (match && match[1]) {
        const qty = parseInt(match[1]);
        const precioLetras = qty * prices["letras gigantes"];
        subtotal += precioLetras;
        serviceCount++;
        details.push(`🔸 *${qty} Letras Gigantes* (5 Horas): $${precioLetras.toLocaleString()}`);
        servicesRecognized.push("letras gigantes");
        letrasCount = qty;
      } else {
        // En este punto, gracias a la actualización, no debería ocurrir
        details.push(`🔸 *Letras*: cantidad no especificada`);
      }
    }
     // Caso de lluvia metálica (o lluvia metalica)
    else if (/lluvia m(?:e|é)t(?:a|á)lica\b/i.test(service)) {
        subtotal += prices["lluvia matálica"];
        serviceCount++;
        details.push(`🔸 *Lluvia Metálica*: $${prices["lluvia matálica"].toLocaleString()}`);
        servicesRecognized.push("lluvia metálica");
    }

    // Otros servicios definidos
    else {
      let baseService;
      let qty = 1;
      // Primero comprobamos si el servicio completo coincide con alguna clave de precios
      if (prices.hasOwnProperty(service)) {
        baseService = service;
      } else {
        // Si no, intentamos extraer el nombre y la cantidad usando regex
        const matchService = service.match(/^(.+?)(?:\s+(\d+))?$/);
        if (matchService) {
          baseService = matchService[1].trim();
          qty = matchService[2] ? parseInt(matchService[2]) : 1;
        }
      }

      if (prices[baseService] !== undefined) {
        const precioTotal = prices[baseService] * qty;
        subtotal += precioTotal;
        serviceCount++;

        // Formatear el nombre del servicio
        let serviceNameFormatted = baseService.charAt(0).toUpperCase() + baseService.slice(1);

        // Agregar "(3 horas)" para cabina de fotos y cabina 360
        if (baseService.toLowerCase() === "cabina de fotos" || baseService.toLowerCase() === "cabina 360") {
          serviceNameFormatted += " (3 horas)";
        }

        // Construir el detalle del servicio
        let serviceDetail = "";
        if (qty === 1) {
          serviceDetail = `🔸 *${serviceNameFormatted}:* $${precioTotal.toLocaleString()}`;
        } else {
          serviceDetail = `🔸 *${serviceNameFormatted} ${qty}:* $${precioTotal.toLocaleString()}`;
        }

        details.push(serviceDetail);
        servicesRecognized.push(baseService);
      } else {
        console.warn(`Servicio no reconocido: ${service}`);
        details.push(`🔸 ${service}: servicio no reconocido`);
      }
    }
  }

  // Aplicar descuento según cantidad de servicios reconocidos
  let discountPercent = 0;
  if (serviceCount === 1) {
    // Caso único: si es chisperos y la cantidad es exactamente 2, sin descuento.
    if (/chispero[s]?\s*2\b/i.test(servicesArr[0])) {
      discountPercent = 0;
    }
    // Si es letras (o letras gigantes) y se especifica la cantidad
    else if (/letras(?:\s*gigantes)?\s*(\d+)/i.test(servicesArr[0])) {
      const match = servicesArr[0].match(/letras(?:\s*gigantes)?\s*(\d+)/i);
      const qty = parseInt(match[1]);
      // Si la cantidad es 1, sin descuento; si es mayor (2 o más), se aplica 10%
      discountPercent = (qty === 1) ? 0 : 10;
    }
    // Para cualquier otro servicio único, aplicar 10%
    else {
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
    error: false,
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
  { question: /hacen contrato|contrato/i, answer: "📄 ¡Sí! Una vez que se acredite el anticipo, llenamos el contrato y te enviamos una foto." },
  { question: /con cuanto tiempo separo mi fecha|separar/i, answer: "⏰ Puedes separar tu fecha en cualquier momento, siempre y cuando esté disponible." },
  { question: /se puede separar para 2026|2026/i, answer: "📆 Claro, tenemos agenda para 2025 y 2026. ¡Consulta sin compromiso!" },
  { question: /cuánto se cobra de flete|flete/i, answer: "🚚 El flete varía según la ubicación. Contáctanos y lo calculamos juntos." },
  { question: /cómo reviso si tienen mi fecha disponible/i, answer: "🔎 Cuéntame, ¿para cuándo es tu evento? Así reviso la disponibilidad." },
  { question: /ubicación|dónde están|donde son|ubican|oficinas/i, answer: "📍 Nos encontramos en la Colonia Independencia en Monterrey. Cubrimos hasta 30 km a la redonda." },
  { question: /pago|método de pago|tarjeta|efectivo/i, answer: "💳 Aceptamos transferencias, depósitos y pagos en efectivo. ¡Lo que te resulte más cómodo!" },
  { 
    question: /que servicios manejas|servicios/i, 
    answer: "🎉 Aquí tienes nuestros servicios:",
    imageUrl: "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg" 
  },
  { 
    question: /con cuánto se separa|con cuanto separo|como se separa|como separo|para separar|cuanto de anticipo/i, 
    answer: "⏰ Puedes separar tu fecha en cualquier momento, siempre y cuando esté disponible.\n\nSeparamos fecha con $500, el resto puede ser ese dia, al inicio del evento.\n\nUna vez acreditado el anticipo solo pedire Nombre y los datos del evento, lleno tu contrato y te envío foto.\n\nSi tienes una vuelta para el centro de Monterrey me avisas para entregarte tu contrato original"    
  },
  {
    question: /me interesa\b/i, // Coincide con "me interesa" pero no con "Sí, me interesa"
    answer: "Genial!! \n\nPara continuar por favor indicame la fecha de tu evento para revisar disponibilidad "
  },  
  { 
    question: /para depositarte|datos para deposito|transfiero|transferencia|depositar|depósito/i, 
    imageUrl: "http://cami-cam.com/wp-content/uploads/2025/03/Datos-Transferencia-1.jpeg", 
    answer: "722969010494399671"
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
    answer: "📚 El Scrapbook es un álbum interactivo donde tus invitados pegan una de las fotos de la cabina y escriben un lindo mensaje para que recuerdes cada detalle.",
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
      await sendImageMessage(from, faqEntry.imageUrl);
    }
    if (faqEntry.images && Array.isArray(faqEntry.images)) {
      for (const imageUrl of faqEntry.images) {
        await sendImageMessage(from, imageUrl);
      }
    }
    if (faqEntry.videoUrl) {
      await sendWhatsAppVideo(from, faqEntry.videoUrl);
    }
    if (faqEntry.videos && Array.isArray(faqEntry.videos)) {
      for (const videoUrl of faqEntry.videos) {
        await sendWhatsAppVideo(from, videoUrl);
      }
    }
    return true; // Indicar que se manejó una FAQ
  }
  return false; // No se manejó ninguna FAQ
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

//Funcion para solicitar fecha
async function solicitarFecha(from, context) {
  await sendMessageWithTypingWithState(
    from,
    "Para continuar, por favor indícame la fecha de tu evento (Formato DD/MM/AAAA) 📆.",
    2000, // Retraso de 2 segundos
    context.estado
  );
  context.estado = "EsperandoFecha";
}

// Función para validar el formato de la fecha (DD/MM/AAAA)
function isValidDate(dateString) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/; // Formato DD/MM/AAAA
  if (!regex.test(dateString)) return false;

  // Extraer día, mes y año
  const [day, month, year] = dateString.split('/').map(Number);

  // Validar que la fecha sea válida
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

// Función para verificar disponibilidad (simulada)
function checkAvailability(dateString) {
  // Simulación de fechas ocupadas
  const occupiedDates = ["15/02/2024", "20/02/2024"];
  return !occupiedDates.includes(dateString);
}

// Función para enviar mensjae al administrador
async function sendMessageToAdmin(message) {
  const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!adminNumber) {
    console.error("El número de WhatsApp del administrador no está definido en .env");
    return;
  }
  try {
    await sendWhatsAppMessage(adminNumber, message);
    console.log("Mensaje enviado al administrador:", message);
  } catch (error) {
    console.error("Error al enviar mensaje al administrador:", error);
  }
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
      serviciosSeleccionados: [],
      total: 0,
      mediosEnviados: new Set(), // Para evitar enviar medios repetidos
    };
  }
  const context = userContext[from];

  
  // Si el estado es "EsperandoConfirmacionPaquete", no procesar FAQs
  if (context.estado === "EsperandoConfirmacionPaquete") {
    // Procesar FAQs solo si no está en el estado "EsperandoConfirmacionPaquete"
    if (await handleFAQs(from, userMessage)) {
      return true; // Si se manejó una FAQ, salir de la función
    }
  }

  // Manejar la acción del botón "CONTINUAR"
  if (context.estado === "EsperandoDudas" && messageLower === "continuar") {
    await solicitarFecha(from, context); // Solicitar la fecha del evento
    return true; // Salir de la función después de manejar la acción
  }


// 🟢 1. Inicio: dar la bienvenida y mostrar opciones con imagen
if (context.estado === "Contacto Inicial") {
  // Mensaje inicial explicando que es un asistente virtual
  await sendMessageWithTypingWithState(
    from,
    "¡Hola! 👋\n\nBienvenid@ a *Camicam Photobooth*.\n\nEstos son los Servicios que ofrecemos 🤩",
    2000, // Retraso de 3 segundos
    "Contacto Inicial"
  );

  // Enviar la imagen de servicios con un retraso
  await delay(5000); // Retraso de 5 segundos antes de enviar la imagen
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg");

  // Enviar los botones con otro retraso
  await delay(6000); // Retraso de 5 segundos antes de enviar los botones
  await sendInteractiveMessage(
    from,
    "Con nosotros puedes armar tu propio paquete, o ver uno que te sugerimos\n\nQué tipo de evento tienes? 😊\n\nSelecciona una opción 👇",
    [
      { id: "evento_boda", title: "💍 Boda" },
      { id: "evento_xv", title: "🎉 XV Años" }
    ]
  );

  // Mensaje adicional para eventos no listados
  await delay(2000); // Retraso de 2 segundos antes de enviar el mensaje
  await sendMessageWithTypingWithState(
    from,
    "O dime qué tipo de evento estás organizando? 🥳 ",
    2000,
    "Contacto Inicial"
  );

  // Actualizar el estado del contexto
  context.estado = "EsperandoTipoEvento";
  return true;
}


 // 🟢 2. Capturar el tipo de evento
 if (context.estado === "EsperandoTipoEvento") {
  // Se invoca la función que procesa la elección del cliente
  const messageLower = userMessage.toLowerCase();
  await handleTipoEvento(from, messageLower, context);
  return true;
}  

if (context.estado === "EsperandoSubtipoOtroEvento") {
  const messageLower = userMessage.toLowerCase();
  await handleOtherEvent(from, context, messageLower);
  return true;
}
  
// 🟢 3. Opciones: paquete sugerido o armar paquete
if (context.estado === "OpcionesSeleccionadas") {
  console.log("Valor recibido en OpcionesSeleccionadas:", messageLower);

  if (messageLower === "armar_paquete") {
    // Mensaje con retraso para simular interacción humana
    await sendMessageWithTypingWithState(
      from,
      "¡Genial! 😃 Vamos a armar tu paquete personalizado.\n\nPor favor, indícame los servicios que deseas incluir.\n\n✏️ Escribe separado por comas, por ejemplo: \n\ncabina de fotos, niebla de piso, scrapbook, chisperos 4, letras gigantes 4",
      2000, // Retraso de 2 segundos
      "OpcionesSeleccionadas"
    );
    context.estado = "EsperandoServicios";
    return true;
  } else if (messageLower === "paquete_sugerido") {
    // Determinar el paquete sugerido según el tipo de evento
    let paqueteSugerido;
    if (!context.tipoEvento) {
      await sendMessageWithTypingWithState(
        from,
        "😕 No se ha seleccionado un tipo de evento. Por favor, elige un tipo de evento válido.",
        2000,
        "OpcionesSeleccionadas"
      );
      return true;
    }

    if (context.tipoEvento === "Boda") {
      paqueteSugerido = "🎉 *Paquete Wedding*: Incluye Cabina 360, iniciales decorativas, 2 chisperos y un carrito de shots con alcohol, todo por *$4,450*.";
    } else if (context.tipoEvento === "XV") {
      paqueteSugerido = "🎂 *Paquete Mis XV*: Incluye 6 letras gigantes, Cabina de fotos, Lluvia de mariposas y 2 chisperos, todo por *$5,600*.";
    } else {
      paqueteSugerido = "🎈 *Paquete Party*: Incluye Cabina de fotos, 4 letras gigantes y un carrito de shots con alcohol, todo por *$4,450*.";
    }

    // Enviar mensaje con el paquete sugerido y la pregunta
    await sendMessageWithTypingWithState(
      from,
      `Aquí tienes nuestro paquete sugerido para *${context.tipoEvento}*:\n\n${paqueteSugerido}\n\n¿Te interesa? o prefieres armar tu propio paquete`,
      2000, // Retraso de 2 segundos
      "OpcionesSeleccionadas"
    );

    // Enviar botones interactivos con "aceptar paquete" y "armar mi paquete"
    await sendInteractiveMessage(
      from,
      "Elige una opción:",
      [
        { id: "continuar", title: "vamos Gus" },
        { id: "armar_paquete", title: "Armar mi paquete" }
      ]
    );

    // Actualizar el estado para manejar la respuesta en el siguiente flujo
    context.estado = "EsperandoConfirmacionPaquete";
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

/**
 * Función para contar solo letras (ignorando números y caracteres especiales)
 */
function contarLetras(texto) {
  return texto.replace(/[^a-zA-Z]/g, "").length;
}

/**
 * Función unificada para recalcular y enviar la cotización
 * @param {string} from - Destinatario del mensaje
 * @param {object} context - Contexto de la conversación (incluye serviciosSeleccionados, estado, etc.)
 * @param {string} [mensajePreliminar] - Mensaje personalizado (opcional)
 */


/**
 * Función para identificar el subtipo de evento dentro de "Otro evento"
 * y devolver una recomendación de paquete.
 */
function getOtherEventPackageRecommendation(userMessage) {
  const mensaje = userMessage.toLowerCase();

  // Detectar cumpleaños: se pueden buscar números o palabras como "cumpleaños"
  if (/cumpleaños|birthday|\b\d+\b/.test(mensaje)) {
    return {
      paquete: "Paquete Cumpleaños",
      descripcion: "Incluye letras gigantes personalizadas, números brillantes y una ambientación festiva perfecta para celebrar esa edad especial."
    };
  }
  // Detectar revelación de género: se buscan palabras clave
  else if (/revelación de género|revelacion|baby|oh baby|girl|boy/.test(mensaje)) {
    return {
      paquete: "Paquete Revelación",
      descripcion: "Ideal para eventos de revelación de género, con letras decorativas y opciones que resaltan 'BABY', 'OH BABY' o 'GIRL BOY'."
    };
  }
  // Detectar propuesta: palabras relacionadas con propuesta o 'marry me'
  else if (/propuesta|pedir matrimonio|marry me/.test(mensaje)) {
    return {
      paquete: "Paquete MARRY ME",
      descripcion: "Perfecto para una propuesta inolvidable, con letras románticas y personalizadas que dicen 'MARRY ME'."
    };
  }
  // Detectar graduación: se buscan palabras como "grad", "class" o números de generación
  else if (/graduación|grad|class|gen\b/.test(mensaje)) {
    return {
      paquete: "Paquete Graduación",
      descripcion: "Ofrece letras gigantes modernas ideales para graduaciones, por ejemplo, 'CLASS 2025', 'GRAD 25' o 'GEN 2022'."
    };
  }
  // Si no se detecta un subtipo específico
  return {
    paquete: "Paquete Personalizado",
    descripcion: "Tenemos varias opciones personalizadas. ¿Podrías contarnos un poco más sobre tu evento para ofrecerte la mejor recomendación?"
  };
}

/**
 * Función para manejar la lógica cuando el usuario selecciona "Otro evento".
 * Se solicita especificar el subtipo y se recomienda un paquete.
 */
async function handleOtherEvent(from, context, userMessage) {
  // Obtener la recomendación basándonos en el mensaje del usuario.
  const recomendacion = getOtherEventPackageRecommendation(userMessage);

  // Guardar en el contexto el paquete recomendado para posteriores referencias.
  context.paqueteRecomendado = recomendacion;

  // Enviar la recomendación de forma personalizada.
  const mensajeRecomendacion = `🎉 *${recomendacion.paquete}*\n\n${recomendacion.descripcion}\n\n¿Te interesa? o prefieres armar tu ptopio paquete?`;
  await sendMessageWithTypingWithState(from, mensajeRecomendacion, 2000, context.estado);

  // Enviar botones interactivos con "aceptar paquete" y "armar mi paquete"
  await sendInteractiveMessage(from, "Elige una opción:", [
    { id: "continuar", title: "CONTINUAR" },
    { id: "armar_paquete", title: "Armar mi paquete" }
  ]);

  // Actualizar el estado para manejar la respuesta en el siguiente flujo.
  context.estado = "EsperandoConfirmacionPaquete";
}




/**
 * Función que revisa el contexto actual y devuelve sugerencias de upsell
 * basadas en los servicios seleccionados.
 *
 * Se aplican dos reglas:
 * 1. Si se seleccionó "cabina de fotos" pero no "scrapbook", se sugiere agregar Scrapbook y se activa un flag para mostrar su video.
 * 2. Si ya se agregó *Scrapbook* (o no se cumple la regla 1) y se tienen exactamente 2 servicios,
 *    se sugiere agregar un tercer servicio (recordando que 3 servicios otorgan 30% y 4, hasta 40% de descuento).
 *
 * Se utiliza la bandera (context.upsellSuggested) para evitar repetir la sugerencia, pero se reinicia si las condiciones cambian.
 */
function checkUpsellSuggestions(context) {
  let suggestions = [];
  const servicios = context.serviciosSeleccionados.toLowerCase();
  const availableServices = [
    "cabina de fotos", "cabina 360", "lluvia de mariposas", "carrito de shots con alcohol",
    "carrito de shots sin alcohol", "niebla de piso", "lluvia matálica",
    "scrapbook", "audio guest book", "letras gigantes", "chisperos"
  ];

  // Si previamente se había sugerido algo pero ahora ya se agregó el scrapbook,
  // reiniciamos la bandera para permitir nuevas sugerencias.
  if (context.upsellSuggested && servicios.includes("scrapbook")) {
    context.upsellSuggested = false;
  }

  // Contar la cantidad de servicios seleccionados
  let serviceCount = 0;
  availableServices.forEach(service => {
    if (servicios.includes(service)) serviceCount++;
  });

  // Regla 1: Si se seleccionó "cabina de fotos" pero no "scrapbook"
  if (servicios.includes("cabina de fotos") && !servicios.includes("scrapbook")) {
    suggestions.push("👉 ¿Sabías que al agregar *Scrapbook* tu evento se verá aún más espectacular? ¡Además, podrías aprovechar un mayor descuento!");
    // Activar flag para enviar el video del scrapbook
    context.suggestScrapbookVideo = true;
    context.upsellSuggested = true;
  }
  // Regla 2: Si ya se agregó Scrapbook (o no aplica la Regla 1) y se tienen exactamente 2 servicios
  else if (serviceCount === 2) {
    suggestions.push("¡Buen inicio! Si agregas un tercer servicio, obtendrás un 30% de descuento, y con 4 servicios, ¡hasta un 40%!");
    context.upsellSuggested = true;
  }

  return suggestions;
}

/**
 * Función actualizada para recalcular y enviar la cotización,
 * integrando las sugerencias de upsell y mostrando el video del scrapbook si aplica.
 */
async function actualizarCotizacion(from, context, mensajePreliminar = null) {
  const cotizacion = calculateQuotation(context.serviciosSeleccionados);
  const cabecera = mensajePreliminar ? mensajePreliminar : "💰 *Tu cotización:*";
  const mensajeDetalles = `${cabecera}\n\n` + cotizacion.details.join("\n");

  await sendMessageWithTypingWithState(from, mensajeDetalles, 2000, context.estado);
  await delay(2000);

  const mensajeResumen = `Subtotal: $${cotizacion.subtotal.toLocaleString()}\nDescuento (${cotizacion.discountPercent}%): -$${cotizacion.discountAmount.toLocaleString()}\n\n*TOTAL A PAGAR: $${cotizacion.total.toLocaleString()}*`;
  await sendMessageWithTypingWithState(from, mensajeResumen, 2000, context.estado);

  // Envío de imágenes y videos para cada servicio, si no se han enviado antes
  if (cotizacion.servicesRecognized && cotizacion.servicesRecognized.length > 0) {
    for (const service of cotizacion.servicesRecognized) {
      if (mediaMapping[service] && (!context.mediosEnviados || !context.mediosEnviados.has(service))) {
        if (mediaMapping[service].images && mediaMapping[service].images.length > 0) {
          for (const img of mediaMapping[service].images) {
            await sendImageMessage(from, img);
            await delay(1000);
          }
        }
        if (mediaMapping[service].videos && mediaMapping[service].videos.length > 0) {
          for (const vid of mediaMapping[service].videos) {
            await sendWhatsAppVideo(from, vid);
            await delay(1000);
          }
        }
        if (!context.mediosEnviados) context.mediosEnviados = new Set();
        context.mediosEnviados.add(service);
      }
    }
  }

  // Integrar las sugerencias de upsell de manera sutil
  const upsellSuggestions = checkUpsellSuggestions(context);
  if (upsellSuggestions.length > 0) {
    const mensajeUpsell = upsellSuggestions.join("\n");
    await delay(2000);
    await sendMessageWithTypingWithState(from, mensajeUpsell, 2000, context.estado);
    // Si se activó el flag, enviar el video del scrapbook
    if (context.suggestScrapbookVideo) {
      const scrapbookMedia = mediaMapping["scrapbook"];
      if (scrapbookMedia && scrapbookMedia.videos && scrapbookMedia.videos.length > 0) {
        await delay(2000);
        await sendWhatsAppVideo(from, scrapbookMedia.videos[0]);
      }
      // Reiniciar el flag para no volver a sugerir en el mismo flujo
      context.suggestScrapbookVideo = false;
    }
  }

  await delay(2000);
  await sendMessageWithTypingWithState(
    from,
    "Para modificar tu cotización, escribe: \n\n'*Agregar* y el nombre del servicio que quieras agregar' ó\n\n'*Quitar* y el nombre del servicio que quieras quitar' 😊",
    2000,
    context.estado
  );
  // Enviar mensaje con botón "CONTINUAR"
  await sendInteractiveMessage(
    from,
    "O toca el botón para continuar:",
    [
      { id: "continuar", title: "CONTINUAR" }
    ]
  );
  context.estado = "EsperandoDudas";
}

/**
 * Función para manejar el tipo de evento, integrando Boda, XV y Otro evento.
 * 
   if (messageLower.includes("boda") || messageLower.includes("evento_boda")) {
    context.tipoEvento = "Boda";
  } else if (messageLower.includes("xv") || messageLower.includes("quince")) {
 */
  async function handleTipoEvento(from, messageLower, context) {
    // Caso Boda
    if (messageLower.includes("boda") || messageLower.includes("evento_boda")) {
      context.tipoEvento = "Boda";
      await sendInteractiveMessage(
        from,
        `¡Muchas felicidades por tu pronta celebración! ✨\n\n¿Cómo te puedo ayudar?`,
        [
          { id: "paquete_sugerido", title: "Ver paquete sugerido" },
          { id: "armar_paquete", title: "🛠️ Armar mi paquete" }
        ]
      );
      context.estado = "OpcionesSeleccionadas";
    }
    // Caso XV
    else if (messageLower.includes("xv") || messageLower.includes("quince")) {
      context.tipoEvento = "XV";
      await sendInteractiveMessage(
        from,
        `¡Muchas felicidades por tu pronta celebración! ✨\n\n¿Cómo te puedo ayudar?`,
        [
          { id: "paquete_sugerido", title: "Ver paquete sugerido" },
          { id: "armar_paquete", title: "🛠️ Armar mi paquete" }
        ]
      );
      context.estado = "OpcionesSeleccionadas";
    }
    // Caso "Otro"
    else {
      // Obtener la recomendación basada en el tipo de evento escrito por el usuario
      const recomendacion = getOtherEventPackageRecommendation(messageLower);
  
      // Guardar en el contexto el paquete recomendado para posteriores referencias
      context.paqueteRecomendado = recomendacion;
  
      // Enviar la recomendación de forma personalizada
      const mensajeRecomendacion = `🎉 *${recomendacion.paquete}*\n${recomendacion.descripcion}\n\n¿Te interesa? o prefieres armar tu propio paquete`;
      await sendMessageWithTypingWithState(from, mensajeRecomendacion, 2000, context.estado);
  
      // Enviar botones interactivos con "aceptar paquete" y "armar mi paquete"
      await sendInteractiveMessage(from, "Elige una opción:", [
        { id: "continuar", title: "CONTINUAR" },
        { id: "armar_paquete", title: "Armar mi paquete" }
      ]);
     
      // Actualizar el estado para manejar la respuesta en el siguiente flujo
      context.estado = "EsperandoConfirmacionPaquete";
    }
  }

/* ============================================
   Estado: EsperandoConfirmacionPaquete
   ============================================ */

   if (context.estado === "EsperandoConfirmacionPaquete") {
    const messageLower = userMessage.toLowerCase();
  
    // Si el usuario seleccionó "Sí, me interesa" (id: "aceptar_paquete")
    if (messageLower === "continuar") {
      await sendMessageWithTypingWithState(
        from,
        "¡Excelente! Hemos agregado el paquete recomendado a tu cotización.",
        2000,
        context.estado
      );
  
      // Cambiar el estado a "EsperandoFecha" para solicitar la fecha del evento
      context.estado = "EsperandoFecha";
  
      // Solicitar la fecha del evento
      await solicitarFecha(from, context);
      return true;
    }
    // Si el usuario seleccionó "Armar mi paquete" (id: "armar_paquete")
    else if (messageLower === "armar_paquete") {
      await sendMessageWithTypingWithState(
        from,
        "¡Perfecto! Vamos a armar tu paquete personalizado. Por favor, indícame los servicios que deseas incluir.",
        2000,
        context.estado
      );
      context.estado = "EsperandoServicios";
      return true;
    }
    // En caso de no reconocer la respuesta, se reenvían los botones
    else {
      await sendMessageWithTypingWithState(
        from,
        "No entendí tu respuesta. Por favor, selecciona una opción válida.",
        2000,
        context.estado
      );
      await sendInteractiveMessage(
        from,
        "Elige una opción:",
        [
          { id: "continuar", title: "CONTINUAR" },
          { id: "armar_paquete", title: "Armar mi paquete" }
        ]
      );
      return true;
    }
  }

/* ============================================
   Estado: EsperandoServicios
   ============================================ */
   if (context.estado === "EsperandoServicios") {
    // Si el usuario indica agregar o quitar en su mensaje inicial:
    if (messageLower.includes("agregar")) {
      const serviciosAAgregar = userMessage.replace(/agregar/i, "").trim();
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + serviciosAAgregar;
      await sendWhatsAppMessage(from, `✅ Se ha agregado: ${serviciosAAgregar}`);
    } else if (messageLower.includes("quitar")) {
      const serviciosAQuitar = userMessage.replace(/quitar/i, "").trim();
      context.serviciosSeleccionados = context.serviciosSeleccionados
        .split(",")
        .map(s => s.trim())
        .filter(s => !s.toLowerCase().includes(serviciosAQuitar.toLowerCase()))
        .join(", ");
      await sendWhatsAppMessage(from, `✅ Se ha quitado: ${serviciosAQuitar}`);
    } else {
      // Se toma el mensaje completo como lista de servicios
      context.serviciosSeleccionados = userMessage;
    }
  
    // Inicializamos flags para servicios sin cantidad
    context.faltanLetras = false;
    context.faltanChisperos = false;
    context.faltaVarianteCarritoShots = false;
  
    // Verificar si "letras" está presente sin cantidad
    if (/letras(?:\s*gigantes)?(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
      context.faltanLetras = true;
    }
    // Verificar si "chisperos" está presente sin cantidad
    if (/chisperos(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
      context.faltanChisperos = true;
    }
    //Verifica si carrito de shots se escribio con la variable
    if (/carrito de shots/i.test(context.serviciosSeleccionados)) {
      if (!/carrito de shots\s+(con|sin)\s*alcohol/i.test(context.serviciosSeleccionados)) {
        context.faltaVarianteCarritoShots = true;
        // Eliminar la entrada "carrito de shots" sin variante de la cotización
        context.serviciosSeleccionados = context.serviciosSeleccionados
          .split(",")
          .map(s => s.trim())
          .filter(s => !/^carrito de shots$/i.test(s))  // Filtra entradas exactas sin variante
          .join(", ");
        
        // Cambiar el estado para preguntar la variante
        context.estado = "EsperandoTipoCarritoShots";
        await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
        return true; // Detener el flujo actual y esperar la respuesta del cliente.
      }
    } 
    // Verificar si se incluye "cabina" sin especificar tipo (de fotos o 360)
    if (/cabina(?!\s*(de fotos|360))/i.test(context.serviciosSeleccionados)) {
       context.faltaTipoCabina = true;
       // Eliminar la entrada "cabina" sin especificar de la cotización
       context.serviciosSeleccionados = context.serviciosSeleccionados
         .split(",")
         .map(s => s.trim())
         .filter(s => !/^cabina$/i.test(s))
         .join(", ");
  
        context.estado = "EsperandoTipoCabina";
        await sendWhatsAppMessage(from, "¿Deseas agregar Cabina de fotos o Cabina 360?");
        return true;
    }


    

   
  
    // Priorizar preguntar primero por las letras si faltan
    if (context.faltanLetras) {
      context.estado = "EsperandoCantidadLetras";
      await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
      return true;
    }
  
    // Si no faltan letras pero faltan chisperos, preguntar por ellos
    if (context.faltanChisperos) {
      context.estado = "EsperandoCantidadChisperos";
      await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
      return true;
    }
  
    // Finalmente, si ya se resolvieron letras y chisperos pero falta la variante del carrito de shots
    if (context.faltaVarianteCarritoShots) {
      context.estado = "EsperandoTipoCarritoShots";
      await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
      return true;
    }
  
    // Si ya se especificaron cantidades para ambos, actualizar la cotización
    await actualizarCotizacion(from, context);
    return true;
  }

/* ============================================
   Estado: EsperandoCantidadLetras
   ============================================ */
if (context.estado === "EsperandoCantidadLetras") {
  const cantidad = parseInt(userMessage);
  if (isNaN(cantidad) || cantidad <= 0) {
    await sendWhatsAppMessage(from, "Por favor, ingresa un número válido para la cantidad de letras.");
    return true;
  }
  // Regex para capturar "letras" o "letras gigantes", con o sin número
  const regex = /letras(?:\s*gigantes)?(\s*\d+)?/i;
  if (regex.test(context.serviciosSeleccionados)) {
    // Reemplaza cualquier mención de "letras" sin cantidad o con cantidad antigua
    context.serviciosSeleccionados = context.serviciosSeleccionados.replace(regex, `letras gigantes ${cantidad}`);
  } else {
    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + `letras gigantes ${cantidad}`;
  }
  await sendWhatsAppMessage(from, `✅ Se han agregado ${cantidad} letras gigantes.`);
  
  // Si además faltan chisperos, cambia el estado para solicitarlos
  if (context.faltanChisperos) {
    context.estado = "EsperandoCantidadChisperos";
    await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
    return true;
  }
  
  // Si no faltan chisperos, actualizar la cotización
  await actualizarCotizacion(from, context, "¡Perfecto! Hemos actualizado tu cotización:");
  return true;
}


/* ============================================
   Estado: EsperandoCantidadChisperos
   ============================================ */
     if (context.estado === "EsperandoCantidadChisperos") {
    const cantidad = parseInt(userMessage);
    if (isNaN(cantidad) || cantidad <= 0) {
      await sendWhatsAppMessage(from, "Por favor, ingresa un número válido para la cantidad de chisperos.");
      return true;
    }
   
    // Regex para capturar "chisperos" con o sin número
    const regex = /chisperos(\s*\d+)?/i;
    if (regex.test(context.serviciosSeleccionados)) {
      context.serviciosSeleccionados = context.serviciosSeleccionados.replace(regex, `chisperos ${cantidad}`);
    } else {
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + `chisperos ${cantidad}`;
    }
    await sendWhatsAppMessage(from, `✅ Se han agregado ${cantidad} chisperos.`);
    // Actualizar la cotización final
    await actualizarCotizacion(from, context, "¡Perfecto! Hemos actualizado tu cotización:");
    return true;
  }
  



/* ============================================
   Estado: ConfirmandoLetras (caso "Ocupo el nombre de ...")
   ============================================ */
if (context.estado === "ConfirmandoLetras") {
  if (messageLower.includes("sí") || messageLower.includes("si")) {
    const cantidadLetras = contarLetras(context.nombreCliente);
    const regex = /letras gigantes\s*\d*/i;
    if (regex.test(context.serviciosSeleccionados)) {
      context.serviciosSeleccionados = context.serviciosSeleccionados.replace(regex, `letras gigantes ${cantidadLetras}`);
    } else {
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + `letras gigantes ${cantidadLetras}`;
    }
    await sendWhatsAppMessage(from, `✅ Se han agregado ${cantidadLetras} letras gigantes basadas en el nombre '${context.nombreCliente}'.`);
    await actualizarCotizacion(from, context, "¡Perfecto! Hemos actualizado tu cotización:");
  } else {
    // Si la respuesta es negativa, se solicita la cantidad manualmente
    context.estado = "EsperandoCantidadLetras";
    await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
  }
  return true;
}

/* ============================================
   Estado: Manejo de "Ocupo el nombre de ..."
   ============================================ */
// Cuando el usuario escribe "Ocupo el nombre de [nombre]"
if (context.estado === "EsperandoDudas" && messageLower.includes("ocupo el nombre de")) {
  context.nombreCliente = userMessage.replace(/ocupo el nombre de/i, "").trim();
  const cantidadLetras = contarLetras(context.nombreCliente);
  context.estado = "ConfirmandoLetras";
  await sendWhatsAppMessage(from, `De acuerdo, entiendo que ocupas ${cantidadLetras} letras gigantes. ¿Es correcto?`);
  return true;
}



/* ============================================
   Estado: EsperandoTipoCarritoShots
   ============================================ */
if (context.estado === "EsperandoTipoCarritoShots") {
  const respuesta = userMessage.toLowerCase();
  let varianteSeleccionada = "";
  
  if (respuesta.includes("con")) {
    varianteSeleccionada = "carrito de shots con alcohol";
  } else if (respuesta.includes("sin")) {
    varianteSeleccionada = "carrito de shots sin alcohol";
  } else {
    await sendWhatsAppMessage(from, "Por favor, responde 'con' o 'sin' para el carrito de shots.");
    return true;
  }
  
  // Verificamos si la variante seleccionada ya está en la cotización.
  if (context.serviciosSeleccionados.toLowerCase().includes(varianteSeleccionada)) {
    // Si ya está, se determina la otra variante.
    let otraVariante = (varianteSeleccionada === "carrito de shots con alcohol")
      ? "carrito de shots sin alcohol"
      : "carrito de shots con alcohol";
      
    // Si la otra variante ya está agregada, se notifica que se requieren intervención.
    if (context.serviciosSeleccionados.toLowerCase().includes(otraVariante)) {
      await sendWhatsAppMessage(from, `Ya tienes ambos tipos de carrito de shots en tu cotización. Por favor, contacta a nuestro administrador para mayor asistencia.`);
      sendMessageToAdmin("El cliente ha intentado agregar duplicados de carrito de shots.");
      context.estado = "EsperandoDudas";
      return true;
    } else {
      // Se pregunta si desea agregar la otra variante.
      context.estado = "ConfirmarAgregarCarritoShotsCambio";
      context.carritoShotsToAgregar = otraVariante;
      await sendWhatsAppMessage(from, `Ya tienes agregado ${varianteSeleccionada} en tu cotización.\n¿Deseas agregar ${otraVariante}?`);
      return true;
    }
  } else {
    // Si la variante seleccionada no está en la cotización, se agrega.
    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + varianteSeleccionada;
    await sendWhatsAppMessage(from, `✅ Se ha seleccionado ${varianteSeleccionada}.`);

    // Verificar si faltan letras o chisperos antes de mostrar la cotización
    if (/letras(?:\s*gigantes)?(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
      context.estado = "EsperandoCantidadLetras";
      await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
      return true;
    }

    if (/chisperos(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
      context.estado = "EsperandoCantidadChisperos";
      await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
      return true;
    }

    // Si no faltan letras ni chisperos, mostrar la cotización
    await actualizarCotizacion(from, context, "¡Perfecto! Hemos actualizado tu cotización:");
    context.estado = "EsperandoDudas";
    return true;
  }
}


/* ============================================
   Estado: ConfirmarAgregarCarritoShotsCambio
   ============================================ */
if (context.estado === "ConfirmarAgregarCarritoShotsCambio") {
  const respuesta = userMessage.toLowerCase();
  if (respuesta.includes("si")) {
    // Se agrega la otra variante.
    let variante = context.carritoShotsToAgregar;
    if (!context.serviciosSeleccionados.toLowerCase().includes(variante)) {
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + variante;
      await sendWhatsAppMessage(from, `✅ Se ha agregado ${variante}.`);
      await actualizarCotizacion(from, context, "¡Cotización actualizada!");
    }
    context.estado = "EsperandoDudas";
    return true;
  } else {
    // Si la respuesta es otra, se notifica al administrador para intervención manual.
    await sendWhatsAppMessage(from, "Entendido. Se requiere intervención para este caso.");
    sendMessageToAdmin("El cliente intentó agregar un carrito de shots adicional pero no confirmó la variante correctamente.");
    context.estado = "EsperandoDudas";
    return true;
  }
}

/* ============================================
   Estado: EsperandoTipoCabina
   ============================================ */
   if (context.estado === "EsperandoTipoCabina") {
    const respuesta = userMessage.toLowerCase();
    let varianteSeleccionada = "";
  
    // Mapear las posibles respuestas: "fotos" o "inflable" para cabina de fotos;
    // "360" o "giratoria" para cabina 360.
    if (respuesta.includes("fotos") || respuesta.includes("inflable")) {
      varianteSeleccionada = "cabina de fotos";
    } else if (respuesta.includes("360") || respuesta.includes("giratoria")) {
      varianteSeleccionada = "cabina 360";
    } else {
      await sendWhatsAppMessage(from, "Por favor, responde 'fotos' o '360' para seleccionar el tipo de cabina.");
      return true;
    }
    
    // Verificar si la variante seleccionada ya está en la cotización.
    if (context.serviciosSeleccionados.toLowerCase().includes(varianteSeleccionada)) {
      // Si ya está, se determina la otra variante.
      let otraVariante = (varianteSeleccionada === "cabina de fotos")
        ? "cabina 360"
        : "cabina de fotos";
        
      // Si la otra variante ya está agregada, se notifica que se requiere intervención.
      if (context.serviciosSeleccionados.toLowerCase().includes(otraVariante)) {
        await sendWhatsAppMessage(from, `Ya tienes ambas variantes de cabina en tu cotización. Por favor, contacta a nuestro administrador para mayor asistencia.`);
        sendMessageToAdmin("El cliente ha intentado agregar duplicados de cabina.");
        context.estado = "EsperandoDudas";
        return true;
      } else {
        // Se pregunta si desea agregar la otra variante.
        context.estado = "ConfirmarAgregarCabinaCambio";
        context.cabinaToAgregar = otraVariante;
        await sendWhatsAppMessage(from, `Ya tienes agregada ${varianteSeleccionada} en tu cotización.\n¿Deseas agregar ${otraVariante}?`);
        return true;
      }
    } else {
      // Si la variante seleccionada no está en la cotización, se agrega.
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + varianteSeleccionada;
      await sendWhatsAppMessage(from, `✅ Se ha seleccionado ${varianteSeleccionada}.`);
  
      // Verificar si aún faltan otros datos (prioridad: letras, chisperos, carrito de shots)
      if (/letras(?:\s*gigantes)?(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
        context.estado = "EsperandoCantidadLetras";
        await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
        return true;
      }
      if (/chisperos(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
        context.estado = "EsperandoCantidadChisperos";
        await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
        return true;
      }
      if (context.faltaVarianteCarritoShots) {
        context.estado = "EsperandoTipoCarritoShots";
        await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
        return true;
      }
  
      // Si ya se tienen todos los datos, se actualiza la cotización.
      await actualizarCotizacion(from, context, "¡Perfecto! Hemos actualizado tu cotización:");
      context.estado = "EsperandoDudas";
      return true;
    }
  }
  

  /* ============================================
   Estado: ConfirmarAgregarCabinaCambio
   ============================================ */
if (context.estado === "ConfirmarAgregarCabinaCambio") {
  const respuesta = userMessage.toLowerCase();
  if (respuesta.includes("si")) {
    // Se agrega la otra variante.
    let variante = context.cabinaToAgregar;
    if (!context.serviciosSeleccionados.toLowerCase().includes(variante)) {
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + variante;
      await sendWhatsAppMessage(from, `✅ Se ha agregado ${variante}.`);
      await actualizarCotizacion(from, context, "¡Cotización actualizada!");
    }
    context.estado = "EsperandoDudas";
    return true;
  } else {
    // Si la respuesta no es afirmativa, se notifica al administrador para intervención manual.
    await sendWhatsAppMessage(from, "Entendido. Se requiere intervención para este caso.");
    sendMessageToAdmin("El cliente intentó agregar duplicados de cabina, pero no confirmó la adición de la otra variante correctamente.");
    context.estado = "EsperandoDudas";
    return true;
  }
}




/* ============================================
   Estado: EsperandoDudas – Manejo de dudas, agregar o quitar servicios, FAQs, etc.
   ============================================ */
 if (context.estado === "EsperandoDudas") {
  // --- Manejo de quitar servicios ---
  if (messageLower.includes("quitar")) {
    const serviciosDisponibles = [
      "cabina de fotos", "cabina 360", "lluvia de mariposas", "carrito de shots con alcohol", "carrito de shots sin alcohol",
      "niebla de piso", "lluvia matálica", "scrapbook", "audio guest book",
      "letras gigantes", "chisperos"
    ];
    let servicioAQuitar = null;
    for (const servicio of serviciosDisponibles) {
      if (servicio === "letras gigantes" && messageLower.includes("letras")) {
        servicioAQuitar = "letras gigantes";
        break;
      } else if (servicio === "chisperos" && (messageLower.includes("chispero") || messageLower.includes("chisperos"))) {
        servicioAQuitar = "chisperos";
        break;
      } else if (messageLower.includes(servicio)) {
        servicioAQuitar = servicio;
        break;
      }
    }
    if (servicioAQuitar) {
      const matchCantidad = userMessage.match(/(?:quitar|quitame)\s*(\d+)\s*/i);
      const cantidadAQuitar = matchCantidad ? parseInt(matchCantidad[1]) : null;
      if (cantidadAQuitar !== null && (servicioAQuitar === "letras gigantes" || servicioAQuitar === "chisperos")) {
        const regex = new RegExp(`${servicioAQuitar}\\s*(\\d+)`, "i");
        const matchActual = context.serviciosSeleccionados.match(regex);
        let cantidadActual = matchActual ? parseInt(matchActual[1]) : 0;
        if (cantidadAQuitar > cantidadActual) {
          await sendWhatsAppMessage(from, `No puedes quitar más de ${cantidadActual} ${servicioAQuitar}.`);
          return true;
        }
        const nuevaCantidad = cantidadActual - cantidadAQuitar;
        if (nuevaCantidad > 0) {
          context.serviciosSeleccionados = context.serviciosSeleccionados.replace(regex, `${servicioAQuitar} ${nuevaCantidad}`);
          await sendWhatsAppMessage(from, `✅ Se han quitado ${cantidadAQuitar} ${servicioAQuitar}. Ahora tienes ${nuevaCantidad}.`);
        } else {
          context.serviciosSeleccionados = context.serviciosSeleccionados.split(",")
            .map(s => s.trim())
            .filter(s => !s.toLowerCase().includes(servicioAQuitar))
            .join(", ");
          await sendWhatsAppMessage(from, `✅ Se han eliminado todos los ${servicioAQuitar}.`);
        }
      } else {
        // Si no se especifica cantidad, se elimina el servicio completo
        context.serviciosSeleccionados = context.serviciosSeleccionados.split(",")
          .map(s => s.trim())
          .filter(s => !s.toLowerCase().includes(servicioAQuitar))
          .join(", ");
        await sendWhatsAppMessage(from, `✅ ${servicioAQuitar.charAt(0).toUpperCase() + servicioAQuitar.slice(1)} eliminado de tu cotización.`);
      }
      await actualizarCotizacion(from, context, "¡Cotización actualizada!");
      return true;
    } else {
      await sendWhatsAppMessage(from, "No entendí qué servicio deseas quitar. Por favor, escribe: 'Quitar y el servicio que deseas quitar'");
      return true;
    }
  }
  
  // --- Manejo de agregar servicios ---
  if (messageLower.includes("agregar")) {
    const serviciosDisponibles = [
      "cabina de fotos", "cabina 360", "lluvia de mariposas", "carrito de shots con alcohol", "carrito de shots sin alcohol",
      "niebla de piso", "lluvia matálica", "scrapbook", "audio guest book",
      "letras gigantes", "chisperos"
    ];
    let servicioAAgregar = null;
    for (const servicio of serviciosDisponibles) {
      if (servicio === "letras gigantes" && messageLower.includes("letras")) {
        servicioAAgregar = "letras gigantes";
        break;
      } else if (servicio === "chisperos" && (messageLower.includes("chispero") || messageLower.includes("chisperos"))) {
        servicioAAgregar = "chisperos";
        break;
      } else if (messageLower.includes(servicio)) {
        servicioAAgregar = servicio;
        break;
      }
    }

     // Si el mensaje contiene "agregar carrito de shots", se activa el flujo específico:
     if (messageLower.includes("agregar carrito de shots")) {
      context.estado = "EsperandoTipoCarritoShots";
    await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
    return true;
    }

    // Caso especial: "agregar cabina" sin especificar tipo
  if (messageLower.includes("agregar cabina") && !messageLower.includes("cabina de fotos") && !messageLower.includes("cabina 360")) {
    context.estado = "EsperandoTipoCabina";
    await sendWhatsAppMessage(from, "¿Deseas agregar Cabina de fotos o Cabina 360?");
    return true;
  }
    
    if (servicioAAgregar) {
      // Verificar si ya está agregado en la cotización
      const regex = new RegExp(`${servicioAAgregar}(\\s*\\d+)?`, "i");
      if (regex.test(context.serviciosSeleccionados)) {
        await sendWhatsAppMessage(from, `Ya tienes agregado ${servicioAAgregar} en tu cotización.`);
        return true;
      }
      
      // Para "chisperos" y "letras gigantes", si no se especifica cantidad, se solicita al usuario
      const matchCantidad = userMessage.match(/(?:agregar|añadir)\s*(\d+)\s*/i);
      if ((servicioAAgregar === "chisperos" || servicioAAgregar === "letras gigantes") && !matchCantidad) {
        if (servicioAAgregar === "chisperos") {
          context.estado = "EsperandoCantidadChisperos";
          await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
        } else if (servicioAAgregar === "letras gigantes") {
          context.estado = "EsperandoCantidadLetras";
          await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
        }
        return true;
      }
      
      // Si ya se especificó la cantidad, se extrae
      const cantidadAAgregar = matchCantidad ? parseInt(matchCantidad[1]) : 1;
    
      if (cantidadAAgregar <= 0) {
        await sendWhatsAppMessage(from, "La cantidad a agregar debe ser mayor que cero.");
        return true;
      }
 
      
      // Se agrega el servicio a la cotización
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + `${servicioAAgregar} ${cantidadAAgregar}`;
      await sendWhatsAppMessage(from, `✅ Se ha agregado ${cantidadAAgregar} ${servicioAAgregar}.`);
      await actualizarCotizacion(from, context, "¡Cotización actualizada!");
      return true;
    } else {
      // Si no se reconoce el servicio a agregar
      await sendWhatsAppMessage(from, "No entendí qué servicio deseas agregar. Por favor, escribe: 'Agregar y el servicio que deseas agregar'");
      return true;
    }
  }

  

  
  // --- Manejo de FAQs o dudas generales ---
  if (await handleFAQs(from, userMessage)) return true;
  
  await sendWhatsAppMessage(from, "¿Podrías especificar tu duda o si deseas agregar algún servicio adicional? 😊\n\nSi deseas agregar algo, escribe *Agregar* y lo que necesites.\nSi deseas quitar algo, escribe *Quitar* y lo que necesites quitar.");
  return true;
}

  // 🟢 6. Procesar la fecha del evento
  
  if (context.estado === "EsperandoFecha") {
    // Validar el formato de la fecha (DD/MM/AAAA)
    if (!isValidDate(userMessage)) {
      await sendMessageWithTypingWithState(
        from,
        "😕 El formato de la fecha es incorrecto. Por favor, utiliza el formato DD/MM/AAAA.",
        2000,
        context.estado
      );
      return true; // Mantener el estado en "EsperandoFecha" para volver a solicitar la fecha
    }
  
    // Verificar disponibilidad de la fecha (simulado)
    if (!checkAvailability(userMessage)) {
      await sendMessageWithTypingWithState(
        from,
        "😔 Lo siento, esa fecha ya está reservada. Prueba con otra o contáctanos para más detalles.",
        2000,
        context.estado
      );
      return true; // Mantener el estado en "EsperandoFecha" para volver a solicitar la fecha
    }
  
    // Si la fecha es válida y está disponible, guardarla en el contexto
    context.fecha = userMessage;
  
    // Cambiar el estado para solicitar el lugar del evento
    context.estado = "EsperandoLugar";
  
    // Solicitar el lugar del evento
    await sendMessageWithTypingWithState(
      from,
      "¡Perfecto! La fecha está disponible. Ahora, ¿podrías decirme en qué lugar se realizará tu evento? 🏢",
      2000,
      context.estado
    );
    return true;
  }

  // 🟢 7. Procesar la ubicación del evento
  if (context.estado === "EsperandoLugar") {
    context.lugar = userMessage;
    await sendWhatsAppMessage(from, "¡Genial! Ya tenemos la fecha y el lugar. Un agente se pondrá en contacto contigo para ultimar los detalles. \n\nSi tienes alguna duda adicional por favor hazme saber y en breve te responderemos.\n\n¡Gracias por confiar en Camicam Photobooth! 🎉");
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

  
  // Otros casos: enviar consulta a OpenAI para respuestas adicionales
  try {
    function getCacheKey(query) {
      return query.toLowerCase();
    }
    async function getResponseFromOpenAI(query) {
      const contextoPaquetes = construirContexto();
      const fullQuery = `
  ${contextoPaquetes}
  
  El cliente dice: "${query}"
  Responde de forma clara y corta, profesional y cercana, utilizando el contexto proporcionado.
      `;
      const key = getCacheKey(fullQuery);
      const cachedResponse = responseCache.get(key);  // Uso de la instancia global
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



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
  let serviceCount = 0; // para aplicar descuentos
  let details = [];
  let servicesRecognized = [];
  let letrasCount = 0;

  for (const service of servicesArr) {
    // Caso de chisperos (o chispero)
    if (/chispero[s]?\b/.test(service)) {
      const match = service.match(/chispero[s]?\s*(\d+)/);
      if (match && match[1]) {
        const qty = parseInt(match[1]);
        if (chisperosPrices[qty]) {
          subtotal += chisperosPrices[qty];
          serviceCount++;
          details.push(`🔸 *${qty} Chisperos*: $${chisperosPrices[qty]}`);
          servicesRecognized.push("chisperos");
        } else {
          details.push(`🔸 Chisperos: cantidad inválida (${service})`);
        }
      } else {
        // Retornamos un objeto indicando que falta la cantidad
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
        details.push(`🔸 *${qty} Letras Gigantes (5 Horas)*: $${precioLetras}`);
        servicesRecognized.push("letras gigantes");
        letrasCount = qty;
      } else {
        // En este punto, gracias a la actualización, no debería ocurrir
        details.push(`🔸 *Letras*: cantidad no especificada`);
      }
    }
    
    // Otros servicios definidos
    else {
      // Intentamos extraer el nombre base y la cantidad, asumiendo el formato "servicio [cantidad]"
      const matchService = service.match(/^(.+?)(?:\s+(\d+))?$/);
      if (matchService) {
        let baseService = matchService[1].trim();
        const qty = matchService[2] ? parseInt(matchService[2]) : 1;
        if (prices[baseService] !== undefined) {
          subtotal += prices[baseService] * qty;
          serviceCount++;
          let serviceNameFormatted = baseService.charAt(0).toUpperCase() + baseService.slice(1);
          
          // Agregar "(3 horas)" para cabina de fotos y cabina 360
          if (baseService.toLowerCase() === "cabina de fotos" || baseService.toLowerCase() === "cabina 360") {
            serviceNameFormatted += " (3 horas)";
          }
          
          // Siempre se muestra el nombre formateado, sin indicar la cantidad
          let serviceDetail = `🔸 *${serviceNameFormatted}*: $${prices[baseService] * qty}`;
          
          details.push(serviceDetail);
          servicesRecognized.push(baseService);
        } else {
          details.push(`🔸 ${service}: servicio no reconocido`);
        }
      } else {
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
      serviciosSeleccionados: [],
      total: 0,
      mediosEnviados: new Set(), // Para evitar enviar medios repetidos
    };
  }
  const context = userContext[from];

// 1. Inicio: dar la bienvenida y mostrar opciones con imagen
if (context.estado === "Contacto Inicial") {
  // Mensaje inicial explicando que es un asistente virtual
  await sendMessageWithTypingWithState(
    from,
    "¡Hola! 👋 Te damos la Bienvenida a *Camicam Photobooth*. \n\n📍Atendemos el Centro de Monterrey y hasta 30 km a la redonda \n\nConoce los Servicios que ofrecemos 🤩",
    3000, // Retraso de 3 segundos
    "Contacto Inicial"
  );

  // Enviar la imagen de servicios con un retraso
  await delay(5000); // Retraso de 5 segundos antes de enviar la imagen
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg");

  // Enviar los botones con otro retraso
  await delay(6000); // Retraso de 5 segundos antes de enviar los botones
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
  await sendInteractiveMessage(from, `¡Qué emoción! 👏👏\n\n¡Muchas felicidades por tu celebración! ✨ \n\nAhora, ¿qué te gustaría hacer?`, [
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
      3000, // Retraso de 2 segundos
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
async function actualizarCotizacion(from, context, mensajePreliminar = null) {
  const cotizacion = calculateQuotation(context.serviciosSeleccionados);
  const cabecera = mensajePreliminar ? mensajePreliminar : "💰 *Tu cotización:*";
  const mensajeDetalles = `${cabecera}\n\n` + cotizacion.details.join("\n");

  await sendMessageWithTypingWithState(from, mensajeDetalles, 2000, context.estado);
  await delay(2000);

  const mensajeResumen = `Subtotal: $${cotizacion.subtotal.toFixed(2)}\nDescuento (${cotizacion.discountPercent}%): -$${cotizacion.discountAmount.toFixed(2)}\n*TOTAL A PAGAR: $${cotizacion.total.toFixed(2)}*`;
  await sendMessageWithTypingWithState(from, mensajeResumen, 2000, context.estado);

  // Envío de imágenes y videos solo para nuevos servicios (no se reenvían si ya fueron enviados)
  await delay(4000);
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

  await delay(2000);
  await sendMessageWithTypingWithState(
    from,
    "Si deseas modificar tu cotización escribe: \n\n*Agregar* y agrega lo que necesites.\n\n*Quitar* para quitar lo que no necesites. 😊",
    2000,
    context.estado
  );
  context.estado = "EsperandoDudas";
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
  
  // Verificar si "letras" está presente sin cantidad
  if (/letras(?:\s*gigantes)?(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
    context.faltanLetras = true;
  }
  // Verificar si "chisperos" está presente sin cantidad
  if (/chisperos(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
    context.faltanChisperos = true;
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
    await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥");
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
    await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥");
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
   Estado: EsperandoDudas – Manejo de dudas, agregar o quitar servicios, FAQs, etc.
   ============================================ */
if (context.estado === "EsperandoDudas") {
  // --- Manejo de quitar servicios ---
  if (messageLower.includes("quitar")) {
    const serviciosDisponibles = [
      "cabina de fotos", "cabina 360", "lluvia de mariposas", "carrito de shots",
      "niebla de piso", "lluvia matalica", "scrapbook", "audio guest book",
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
      await sendWhatsAppMessage(from, "No entendí qué servicio deseas quitar. Por favor, especifica el servicio que deseas eliminar.");
      return true;
    }
  }
  
  // --- Manejo de agregar servicios ---
if (messageLower.includes("agregar")) {
  const serviciosDisponibles = [
    "cabina de fotos", "cabina 360", "lluvia de mariposas", "carrito de shots",
    "niebla de piso", "lluvia matalica", "scrapbook", "audio guest book",
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
  
  if (servicioAAgregar) {
    // Verificamos si ya se encuentra agregado en la cotización
    const regex = new RegExp(`${servicioAAgregar}(\\s*\\d+)?`, "i");
    if (regex.test(context.serviciosSeleccionados)) {
      // Si ya está agregado, informamos y no se agrega de nuevo.
      await sendWhatsAppMessage(from, `Ya tienes agregado ${servicioAAgregar} en tu cotización.`);
      return true;
    }
    
    // Si no está agregado, se procede a agregarlo
    const matchCantidad = userMessage.match(/(?:agregar|añadir)\s*(\d+)\s*/i);
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
    await sendWhatsAppMessage(from, "No entendí qué servicio deseas agregar. Por favor, especifica el servicio que deseas incluir.");
    return true;
  }
}

  
  // --- Manejo de FAQs o dudas generales ---
  if (await handleFAQs(from, userMessage)) return true;
  
  await sendWhatsAppMessage(from, "¿Podrías especificar tu duda o si deseas agregar algún servicio adicional? 😊\n\nSi deseas agregar algo, escribe *Agregar* y lo que necesites.\nSi deseas quitar algo, escribe *Quitar* y lo que necesites quitar.");
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
  Responde de forma clara, profesional y cercana, utilizando el contexto proporcionado.
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










/*   CODIGO ORIGINAL FUNCIONANDO PERO CON ERRORES, SE VOLVIA LOCO EL BOT
// Importar dependencias en modo ES Modules
import dotenv from 'dotenv'; // Para cargar variables de entorno
import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import OpenAI from 'openai';

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
app.use(bodyParser.json());

// Objeto para almacenar el contexto de cada usuario
const userContext = {};

// Precios de los servicios
const preciosServicios = {
  cabina_fotos: 2000,
  cabina_360: 3000,
  letras_gigantes: 1500,
  carrito_shots_alcohol: 2500,
  carrito_shots_sin_alcohol: 2000,
  lluvia_mariposas: 1000,
  lluvia_metálica: 1200,
  chisperos_mano: 800,
  chisperos_piso: 1000,
  scrapbook: 500,
  niebla_piso: 600,
  audio_guest_book: 700,
};

// Paquetes sugeridos
const paquetesSugeridos = {
  paquete_xv: {
    nombre: "Paquete Mis XV",
    servicios: ["cabina_fotos", "lluvia_mariposas", "letras_gigantes", "chisperos_mano"],
    precio: 5600,
    descuento: "50% OFF",
    bono: "Scrapbook gratis"
  },
  paquete_wedding: {
    nombre: "Paquete WEDDING",
    servicios: ["cabina_360", "carrito_shots_alcohol", "letras_gigantes", "chisperos_piso"],
    precio: 4450,
    descuento: "50% OFF"
  },
  paquete_party: {
    nombre: "Paquete Party",
    servicios: ["cabina_fotos", "letras_gigantes"],
    precio: 3000
  }
};

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

// Ruta para la raíz
app.get('/', async (req, res) => {
  res.send('¡Servidor funcionando correctamente!');
  console.log("Ruta '/' accedida correctamente.");

  // Prueba para enviar mensaje usando sendWhatsAppMessage
  try {
    console.log('Enviando mensaje de prueba a WhatsApp...');
    await sendWhatsAppMessage('528133971595', 'hello_world', 'en_US');
    console.log('Mensaje de prueba enviado exitosamente.');
  } catch (error) {
    console.error('Error al enviar mensaje de prueba:', error.message);
  }
});

// 📌 Ruta de prueba para mensajes interactivos
app.get('/test-interactive', async (req, res) => {
  const testNumber = "528133971595"; // Reemplázalo con tu número de prueba
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
});


// 📌 Webhook para manejar mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  console.log("📩 Webhook activado:", JSON.stringify(req.body, null, 2));

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  const userMessage = message?.text?.body || '';
  const plataforma = "WhatsApp"; // O "Messenger", si proviene de allí

  console.log(`📩 Enviando mensaje de ${from} al CRM: ${userMessage}`);

  try {
    const response = await axios.post('https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje', {
      plataforma: plataforma,
      remitente: from,
      mensaje: userMessage
    });
    console.log("✅ Respuesta del CRM:", response.data);
  } catch (error) {
    console.error("❌ Error al enviar mensaje al CRM:", error.message);
  }

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



  const buttonReply = message?.interactive?.button_reply?.id || '';
  const listReply = message?.interactive?.list_reply?.id || '';
  const messageLower = buttonReply ? buttonReply.toLowerCase() : listReply ? listReply.toLowerCase() : userMessage.toLowerCase();

  console.log("📌 Mensaje recibido:", userMessage);
  console.log("🔘 Botón presionado:", buttonReply);
  console.log("📄 Lista seleccionada:", listReply);

  try {
    // 🟢 Detectar si el usuario hizo clic en "Preguntas Frecuentes"
    if (buttonReply === 'ver_faqs') {
      console.log("✅ Se detectó clic en el botón 'Preguntas Frecuentes'. Enviando lista...");
     
      await sendWhatsAppList(from, '📖 Preguntas Frecuentes', 'Selecciona una pregunta para obtener más información:', 'Ver preguntas', [
        {
          title: 'Preg Frecuentes',
          rows: [
            { id: 'faq_anticipo', title: '💰 Cómo separo mi fecha?', description: 'Separamos con $500. El resto el día del evento.' },
            { id: 'faq_contrato', title: '📜 Hacen contrato?', description: 'Sí, se envía después del anticipo.' },
            { id: 'faq_flete', title: 'Cuánto cobran de flete?', description: 'Depende de la ubicación. Pregunta para cotizar.' }
          ]
        }
      ]);
      return res.sendStatus(200);
    }    

    // 🟢 Detectar si el usuario seleccionó una pregunta de la lista
    if (listReply) {
      console.log("✅ Se detectó selección de lista:", listReply);
      const faqAnswer = findFAQ(listReply);
      if (faqAnswer) {
        await sendWhatsAppMessage(from, faqAnswer);
        return res.sendStatus(200);
      }
    }

    // 🟢 Verificamos si el mensaje coincide con una pregunta frecuente
    if (await handleFAQs(from, userMessage)) {
      return res.sendStatus(200);
    }

    // 🟢 Pasamos a `handleUserMessage()`
    const handled = await handleUserMessage(from, userMessage, buttonReply);
    if (handled) return res.sendStatus(200);

    // 🟢 Si `handleUserMessage()` tampoco maneja el mensaje, sugerimos ver la lista de preguntas frecuentes
    console.log("❓ Mensaje no reconocido. Mostrando botón de Preguntas Frecuentes.");
    await sendInteractiveMessage(from, "No estoy seguro de cómo responder a eso. ¿Quieres ver nuestras preguntas frecuentes?", [
      { id: 'ver_faqs', title: 'Preg. Frecuentes' }
    ]);

  } catch (error) {
    console.error("❌ Error al manejar el mensaje:", error.message);
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error al procesar tu solicitud. Inténtalo nuevamente.");
  }

  res.sendStatus(200);
});



// 📌 Función para enviar mensajes interactivos con botones
async function sendInteractiveMessage(to, body, buttons) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    recipient_type: "individual",
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: body
      },
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
  } catch (error) {
    console.error('Error al enviar mensaje interactivo:', error.response?.data || error.message);
  }
}


// 📌 Función para enviar videos
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
  } catch (error) {
    console.error('❌ Error al enviar el video:', error.response?.data || error.message);
  }
}

///Fucion para enviar imagenes
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
  } catch (error) {
    console.error('Error al enviar imagen:', error.response?.data || error.message);
  }
}

////Funcion para enviar Listas Interactivas
async function sendWhatsAppList(to, header, body, buttonText, sections) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

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

  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log("✅ Lista interactiva enviada:", response.data);
  } catch (error) {
    console.error("❌ Error al enviar lista interactiva:", error.response?.data || error.message);
  }
}


// 📌 Preguntas frecuentes corregidas y optimizadas
const faqs = [
  { question: /como separo mi fecha|anticipo/i, answer: 'Separamos fecha con $500. El resto puede ser el día del evento.' },
  { question: /hacen contrato|contrato/i, answer: 'Sí, una vez acreditado tu anticipo, lleno tu contrato y te envío foto.' },
  { question: /con cuanto tiempo separo mi fecha|separar/i, answer: 'Puedes separar en cualquier momento, siempre que la fecha esté disponible.' },
  { question: /se puede separar para 2026|2026/i, answer: 'Sí, tenemos agenda abierta para 2025 y 2026.' },
  { question: /cuánto se cobra de flete|flete/i, answer: 'Depende de la ubicación del evento. Contáctanos con tu dirección para calcularlo.' },
  { question: /cómo reviso si tienen mi fecha disponible/i, answer: 'Dime, ¿para cuándo es tu evento? 😊' },
  { question: /ubicación|dónde están|donde son|ubican|oficinas/i, answer: '📍 Estamos en la Colonia Independencia en Monterrey. Atendemos eventos hasta 25 km a la redonda.' },
  { question: /pago|método de pago|tarjeta|efectivo/i, answer: 'Aceptamos transferencias bancarias, depósitos y pagos en efectivo.' }
];

// 📌 Función para buscar respuestas en preguntas frecuentes
function findFAQ(userMessage) {
  for (const faq of faqs) {
    if (faq.question.test(userMessage)) {
      return faq.answer;
    }
  }
  return null;
}

// 📌 Función para manejar preguntas frecuentes antes de enviar el mensaje a OpenAI
async function handleFAQs(from, userMessage) {
  const faqAnswer = findFAQ(userMessage);
  if (faqAnswer) {
    await sendWhatsAppMessage(from, faqAnswer);
    return true;
  }
  return false;
}


//////////////////////////////////////////////////////////

// 📌 Función para enviar mensajes con indicador de escritura
async function sendMessageWithTyping(from, message, delayTime) {
  await activateTypingIndicator(from); // ✅ Activar "escribiendo" primero
  await delay(delayTime); // ⏳ Esperar un tiempo antes de enviar
  await sendWhatsAppMessage(from, message); // ✅ Enviar mensaje después
  await deactivateTypingIndicator(from); // ✅ Desactivar "escribiendo"
}

// 📌 Función para crear un retraso
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 📌 Función para activar el indicador de "escribiendo"
async function activateTypingIndicator(to) {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const headers = {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    };
    const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'typing', // ✅ WhatsApp API reconoce "typing", no "text"
        status: 'typing' // ✅ Correcto: Indica que el bot está escribiendo
    };

    try {
        await axios.post(url, data, { headers });
        console.log('✅ Indicador de "escribiendo" activado');
    } catch (error) {
        console.error('❌ Error al activar el indicador de "escribiendo":', error.response?.data || error.message);
    }
}

// 📌 Función para desactivar el indicador de "escribiendo"
async function deactivateTypingIndicator(to) {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const headers = {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    };
    const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'typing', // ✅ Misma estructura
        status: 'paused' // ✅ Correcto: Indica que el bot dejó de escribir
    };

    try {
        await axios.post(url, data, { headers });
        console.log('✅ Indicador de "escribiendo" desactivado');
    } catch (error) {
        console.error('❌ Error al desactivar el indicador de "escribiendo":', error.response?.data || error.message);
    }
}

// Función para enviar mensajes con formato (cursiva, negrita, etc.)
function formatMessage(text, style = "normal") {
  if (style === "italic") return `_${text}_`;
  if (style === "bold") return `*${text}*`;
  return text;
}

 // Función para formatear precios en el formato $5,600
 function formatPrice(amount) {
  return `$${amount.toLocaleString('en-US')}`;
}

// Función para manejar la lógica de los paquetes
async function handlePackage(from, packageName, imageUrl, includes, price, discount, freeItems, videoUrl) {
  await sendImageMessage(from, imageUrl);
  await delay(2000);

  await sendMessageWithTyping(from, `El paquete que estamos promocionando es el\n${formatMessage(`"${packageName}"`, "bold")}`, 2000);

  await sendMessageWithTyping(from, `${formatMessage("INCLUYE", "bold")}\n\n${includes}\n\nPor Sólo\n\n${formatMessage(`✨ ${formatPrice(price)} ✨`, "bold")}\n\n${formatMessage("Mas flete, dependiendo dónde sea el evento", "italic")} 📍`, 5000);

  await sendMessageWithTyping(from, `Y llévate GRATIS la renta de:\n\n${freeItems}`, 9000);

  await sendMessageWithTyping(from, `${formatMessage("¡¡ PERO ESPERA !! ✋", "bold")}`, 8000);

  await sendMessageWithTyping(from, `¡Sólo durante éste mes disfruta de un descuento de ${formatPrice(discount)}!`, 5000);

  await sendMessageWithTyping(from, `Paga únicamente\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}`, 5000);

  await sendMessageWithTyping(from, `Y ESO NO ES TODO!!\n\n🎁 ${formatMessage("GRATIS", "bold")} el Servicio de:\n\n✅ Audio Guest Book\n\nSerá un recuerdo muy bonito de tu evento 😍`, 7000);

  await sendWhatsAppVideo(from, videoUrl);
  await delay(18000);

  await sendMessageWithTyping(from, `¡Contrata TODO por tan sólo!\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}`, 5000);

  await sendMessageWithTyping(from, `¡SI! ¡Leiste bien!\n\n${includes}\n\n🎁 ${formatMessage("DE REGALO", "bold")}\n${freeItems}\n✅ Un descuento de ${formatPrice(discount)}\n✅ Audio Guest Book\n\nTodo esto por tan sólo 😮\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}\n\n${formatMessage("Mas flete, dependiendo dónde sea tu evento", "italic")} 📍`, 18000);

  await sendMessageWithTyping(from, `Recuerda que este paquete solo estará vigente durante el mes de Febrero\n\n🗓️ Separa hoy mismo y asegura tu paquete antes de que te ganen la fecha`, 15000);

  await sendInteractiveMessage(from, 'Te interesa? 🎊\n\nO prefieres armar tu paquete?\n', [
    { id: 'reservar', title: 'SI, Me interesa 😍' },
    { id: 'armar_paquete', title: '🛠 Armar mi paquete' }
  ]);

  return true;
}

// Función para validar el formato de la fecha (DD/MM/AAAA)
function isValidDate(dateString) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/; // Formato DD/MM/AAAA
  if (!regex.test(dateString)) return false;

  const [day, month, year] = dateString.split('/').map(Number);
  const date = new Date(year, month - 1, day); // Meses en JavaScript son 0-indexados

  // Verificar si la fecha es válida
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

// Función para verificar disponibilidad (simulada)
function checkAvailability(dateString) {
  // Aquí puedes conectar con una base de datos o API para verificar disponibilidad real
  // Por ahora, simulamos que las fechas ocupadas son el 15/02/2024 y el 20/02/2024
  const occupiedDates = ['15/02/2024', '20/02/2024'];
  return !occupiedDates.includes(dateString);
}

////////////////////////////////////////////////////////////////////

///-------------------------------------------------------------///

// 📌 Función para manejar los mensajes del usuario
async function handleUserMessage(from, userMessage, buttonReply) {
  const messageLower = buttonReply ? buttonReply.toLowerCase() : userMessage.toLowerCase();

  // Inicializar el contexto del usuario si no existe
  if (!userContext[from]) {
    userContext[from] = {
      estado: "inicio", // Estado inicial
      tipoEvento: null,
      nombre: null,
      fecha: null,
      serviciosSeleccionados: [], // Para almacenar los servicios seleccionados
      total: 0 // Para almacenar el costo total
    };
  }

  // Obtener el contexto actual del usuario
  const context = userContext[from];

  try {
    // Función para enviar mensajes con indicador de escritura
async function sendMessageWithTyping(from, message, delayTime) {
  await sendWhatsAppMessage(from, message);
  await activateTypingIndicator(from);
  await delay(delayTime);
  await deactivateTypingIndicator(from);
}

// Función para enviar mensajes interactivos con imagen
async function sendInteractiveMessageWithImage(from, message, imageUrl, options) {
  await sendMessageWithTyping(from, message, 3000);
  await sendImageMessage(from, imageUrl);
  await delay(10000);
  await sendInteractiveMessage(from, options.message, options.buttons);
}

   // 🟢 Flujos predefinidos (eventos, paquetes, etc.)
if (['info', 'costos', 'hola', 'precio', 'información'].some(word => messageLower.includes(word))) {
  await sendMessageWithTyping(from, '¡Hola 👋! Soy tu asistente virtual de *Camicam Photobooth*', 4000);
  await sendMessageWithTyping(from, 'Para brindarte la mejor atención', 2500);
  
  await sendInteractiveMessage(from, 'Por favor selecciona el tipo de evento que tienes 👇', [
    { id: 'evento_xv', title: '🎉 XV Años' },
    { id: 'evento_boda', title: '💍 Boda' },
    { id: 'evento_otro', title: '🎊 Otro Evento' }
  ]);
  return true;
}

    // Función para manejar la selección de eventos
    async function handleEventSelection(from, eventType, packageName) {
      const message = 'Conoce los servicios que ofrecemos en *Camicam Photobooth* 🎉';
      const imageUrl = 'http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg';
      const options = {
        message:'Puedes ver videos de nuestros servicios. ▶️\n\n' + 
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
    
    // SELECCIÓN MIS XV
    if (messageLower === 'evento_xv') {
      return handleEventSelection(from, 'xv', 'Mis XV');
    }
    
    // SELECCIÓN WEDDING
    if (messageLower === 'evento_boda') {
      return handleEventSelection(from, 'wedding', 'Wedding');
    }
    
    // SELECCIÓN PARTY
    if (messageLower === 'evento_otro') {
      return handleEventSelection(from, 'party', 'Party');
    }


 // 🟢 Respuestas a los botones

    // SELECCIÓN MIS XV
    if (messageLower === 'ver_paquete_xv') {
      return handlePackage(
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

    // SELECCIÓN WEDDING
    if (messageLower === 'ver_paquete_wedding') {
      return handlePackage(
        from,
        "PAQUETE WEDDING",
        "http://cami-cam.com/wp-content/uploads/2024/09/Paquete-Wedding.jpg",
        "✅ Cabina de Fotos ó Cabina 360 (3 Horas)\n✅ 4 Letras Gigantes: *A & A ❤️* (5 horas)",
        5100,
        650,
        "✅ Carrito de 100 Shots CON alcohol\n✅ 2 Chisperos de piso",
        "http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4"
      );
    }

    // SELECCIÓN PARTY
    if (messageLower === 'ver_paquete_party') {
      return handlePackage(
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

    // 🟢 Validar si al usuario le interesa el paquete
    if (messageLower === 'reservar') {
      await sendWhatsAppMessage(from, '¡De acuerdo!\n\n Para separar solicitamos un anticipo de $500, el resto puede ser el día del evento.\n\n🗓️ Por favor dime tu fecha para revisar disponibilidad (formato: DD/MM/AAAA).');
      userContext[from].estado = "esperando_fecha"; // Cambiar el estado del usuario
      return true;
    }

    
      // 🟢 Manejar la fecha proporcionada por el usuario
      if (userContext[from].estado === "esperando_fecha") {
        const fechaUsuario = messageLower.trim();
  
        // Validar el formato de la fecha
        if (!isValidDate(fechaUsuario)) {
          await sendWhatsAppMessage(from, '⚠️ Formato de fecha incorrecto. Por favor, ingresa la fecha en el formato DD/MM/AAAA.');
          return true;
        }
  
        // Verificar disponibilidad
        if (!checkAvailability(fechaUsuario)) {
          await sendWhatsAppMessage(from, `Lo siento, la fecha ${fechaUsuario} no está disponible. Por favor, elige otra fecha.`);
          return true;
        }
  
        // Si la fecha está disponible, confirmar la reserva
        userContext[from].fecha = fechaUsuario; // Guardar la fecha en el contexto
        await sendWhatsAppMessage(from, `✅ ¡Perfecto! La fecha ${fechaUsuario} está disponible.\n\nPara confirmar tu reserva, por favor realiza el anticipo de $500 a la siguiente cuenta:\n\n💳 Banco: XYZ\n📌 CLABE: 123456789012345678\n👤 Titular: Camicam Photobooth`);
  
        // Cambiar el estado del usuario a "confirmando_pago"
        userContext[from].estado = "confirmando_pago";
        return true;
      }

    // 🟢 Validar si el usuario quiere "Armar mi paquete"
    if (messageLower === 'armar_paquete') {
      await sendWhatsAppMessage(from, '🔗 Para armar tu paquete personalizado, visita nuestro cotizador en el siguiente enlace:\n🌐 www.cami-cam.com/cotizador/');
      return true;
    }

      // 🟢 Manejar el botón "Ver videos"
      if (messageLower === 'ver_videos') {
        await sendWhatsAppMessage(from, 'Aquí tienes algunos videos de nuestros servicios:');
        await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4', 'Audio Guest Book');
        await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4', 'Letras Gigantes');
        await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/LLUVIA-DE-MARIPOSAS-2.0.mp4', 'Lluvia de Mariposas');
        return true;
      }

  } catch (error) {
    console.error("❌ Error en handleUserMessage:", error.message);
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error.");
    return false;
  }
}

///-------------------------------------------------------------///

// 📌 Función para enviar mensajes de texto

async function sendWhatsAppMessage(to, message) {
    // ✅ Validación de credenciales antes de ejecutar
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
        console.error("❌ ERROR: Credenciales de WhatsApp no configuradas correctamente.");
        return;
    }

    // ✅ Validación de parámetros antes de continuar
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
        // ✅ Enviar mensaje a WhatsApp
        const response = await axios.post(url, data, {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 5000  // ⏳ Agregar un timeout de 5 segundos
        });

        console.log('✅ Mensaje enviado a WhatsApp:', response.data);

        // ✅ Reportar mensaje al CRM en paralelo
        const crmUrl = "https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje";
        const crmData = {
            plataforma: "WhatsApp",
            remitente: to,
            mensaje: message,
            tipo: "enviado"
        };

        const [crmResponse] = await Promise.allSettled([
            axios.post(crmUrl, crmData, { timeout: 5000 })
        ]);

        if (crmResponse.status === "fulfilled") {
            console.log("✅ Mensaje reportado al CRM correctamente");
        } else {
            console.error("❌ Error al reportar al CRM:", crmResponse.reason.response?.data || crmResponse.reason.message);
        }

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





// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
}); */














/*
//CODIGO FUNCIONANDO CON REPORTE DE IMAGENES Y VIDEOS AL CRM
// Importar dependencias en modo ES Modules
import dotenv from 'dotenv'; // Para cargar variables de entorno
import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import OpenAI from 'openai';

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
app.use(bodyParser.json());

// Objeto para almacenar el contexto de cada usuario
const userContext = {};

// Precios de los servicios
const preciosServicios = {
  cabina_fotos: 2000,
  cabina_360: 3000,
  letras_gigantes: 1500,
  carrito_shots_alcohol: 2500,
  carrito_shots_sin_alcohol: 2000,
  lluvia_mariposas: 1000,
  lluvia_metálica: 1200,
  chisperos_mano: 800,
  chisperos_piso: 1000,
  scrapbook: 500,
  niebla_piso: 600,
  audio_guest_book: 700,
};

// Paquetes sugeridos
const paquetesSugeridos = {
  paquete_xv: {
    nombre: "Paquete Mis XV",
    servicios: ["cabina_fotos", "lluvia_mariposas", "letras_gigantes", "chisperos_mano"],
    precio: 5600,
    descuento: "50% OFF",
    bono: "Scrapbook gratis"
  },
  paquete_wedding: {
    nombre: "Paquete WEDDING",
    servicios: ["cabina_360", "carrito_shots_alcohol", "letras_gigantes", "chisperos_piso"],
    precio: 4450,
    descuento: "50% OFF"
  },
  paquete_party: {
    nombre: "Paquete Party",
    servicios: ["cabina_fotos", "letras_gigantes"],
    precio: 3000
  }
};

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

// Ruta para la raíz
app.get('/', async (req, res) => {
  res.send('¡Servidor funcionando correctamente!');
  console.log("Ruta '/' accedida correctamente.");

  // Prueba para enviar mensaje usando sendWhatsAppMessage
  try {
    console.log('Enviando mensaje de prueba a WhatsApp...');
    await sendWhatsAppMessage('528133971595', 'hello_world', 'en_US');
    console.log('Mensaje de prueba enviado exitosamente.');
  } catch (error) {
    console.error('Error al enviar mensaje de prueba:', error.message);
  }
});

// 📌 Ruta de prueba para mensajes interactivos
app.get('/test-interactive', async (req, res) => {
  const testNumber = "528133971595"; // Reemplázalo con tu número de prueba
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
});


// 📌 Webhook para manejar mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  console.log("📩 Webhook activado:", JSON.stringify(req.body, null, 2));

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  let userMessage = "";
  if (message.text && message.text.body) {
    userMessage = message.text.body;
  } else if (message.interactive && message.interactive.button_reply) {
    // Extraemos el título del botón; si no está, se usa el id
    userMessage = message.interactive.button_reply.title || message.interactive.button_reply.id;
  } else if (message.interactive && message.interactive.list_reply) {
    userMessage = message.interactive.list_reply.title || message.interactive.list_reply.id;
  }
  const plataforma = "WhatsApp";

  console.log(`📩 Enviando mensaje de ${from} al CRM: ${userMessage}`);

  try {
    const response = await axios.post('https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje', {
      plataforma: plataforma,
      remitente: from,
      mensaje: userMessage
    });
    console.log("✅ Respuesta del CRM:", response.data);
  } catch (error) {
    console.error("❌ Error al enviar mensaje al CRM:", error.message);
  }

  // Los logs adicionales para depuración
  const buttonReply = message?.interactive?.button_reply?.id || '';
  const listReply = message?.interactive?.list_reply?.id || '';
  const messageLower = buttonReply ? buttonReply.toLowerCase() : listReply ? listReply.toLowerCase() : userMessage.toLowerCase();

  console.log("📌 Mensaje recibido:", userMessage);
  console.log("🔘 Botón presionado:", buttonReply);
  console.log("📄 Lista seleccionada:", listReply);

  try {
    // Ejemplo: manejo del botón "Preguntas Frecuentes"
    if (buttonReply === 'ver_faqs') {
      console.log("✅ Se detectó clic en el botón 'Preguntas Frecuentes'. Enviando lista...");
     
      await sendWhatsAppList(from, '📖 Preguntas Frecuentes', 'Selecciona una pregunta para obtener más información:', 'Ver preguntas', [
        {
          title: 'Preg Frecuentes',
          rows: [
            { id: 'faq_anticipo', title: '💰 Cómo separo mi fecha?', description: 'Separamos con $500. El resto el día del evento.' },
            { id: 'faq_contrato', title: '📜 Hacen contrato?', description: 'Sí, se envía después del anticipo.' },
            { id: 'faq_flete', title: 'Cuánto cobran de flete?', description: 'Depende de la ubicación. Pregunta para cotizar.' }
          ]
        }
      ]);
      return res.sendStatus(200);
    }    

    // Manejo de selección en listas interactivas
    if (listReply) {
      console.log("✅ Se detectó selección de lista:", listReply);
      const faqAnswer = findFAQ(listReply);
      if (faqAnswer) {
        await sendWhatsAppMessage(from, faqAnswer);
        return res.sendStatus(200);
      }
    }

    // Manejo de preguntas frecuentes
    if (await handleFAQs(from, userMessage)) {
      return res.sendStatus(200);
    }

    // Pasar a handleUserMessage para otros casos
    const handled = await handleUserMessage(from, userMessage, buttonReply);
    if (handled) return res.sendStatus(200);

    // Si no se reconoce el mensaje, sugerir la opción de preguntas frecuentes
    console.log("❓ Mensaje no reconocido. Mostrando botón de Preguntas Frecuentes.");
    await sendInteractiveMessage(from, "No estoy seguro de cómo responder a eso. ¿Quieres ver nuestras preguntas frecuentes?", [
      { id: 'ver_faqs', title: 'Preg. Frecuentes' }
    ]);

  } catch (error) {
    console.error("❌ Error al manejar el mensaje:", error.message);
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error al procesar tu solicitud. Inténtalo nuevamente.");
  }

  res.sendStatus(200);
});



async function reportMessageToCRM(to, message, tipo = "enviado") {
  const crmUrl = "https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje";
  const crmData = {
    plataforma: "WhatsApp",
    remitente: to,
    mensaje: message,
    tipo: tipo
  };

  try {
    const response = await axios.post(crmUrl, crmData, { timeout: 5000 });
    console.log("✅ Reporte al CRM exitoso:", response.data);
  } catch (error) {
    console.error("❌ Error al reportar al CRM:", error.response?.data || error.message);
  }
}


// 📌 Función para enviar mensajes simples
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

    // Convertir el mensaje a HTML (aquí lo envolvemos en un párrafo)
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


// 📌 Función para enviar mensajes interactivos con botones
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

    // Construir un resumen HTML que incluya el body y los títulos de los botones
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




// 📌 Función para enviar videos
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

    // Construir un resumen HTML que incluya el video y el caption (si existe)
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



///Fucion para enviar imagenes
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

    // Construir un resumen HTML para reportar en el CRM
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


////Funcion para enviar Listas Interactivas
async function sendWhatsAppList(to, header, body, buttonText, sections) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

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

  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log("✅ Lista interactiva enviada:", response.data);

    // Construir un resumen que incluya header, body, botón y las secciones
    let resumen = `${header}\n${body}\nBotón: ${buttonText}\nSecciones: `;
    resumen += sections.map(section => {
      return `${section.title}: ${section.rows.map(row => row.title).join(', ')}`;
    }).join(' | ');
    await reportMessageToCRM(to, resumen, "enviado");

  } catch (error) {
    console.error("❌ Error al enviar lista interactiva:", error.response?.data || error.message);
  }
}


// 📌 Preguntas frecuentes corregidas y optimizadas
const faqs = [
  { question: /como separo mi fecha|anticipo/i, answer: 'Separamos fecha con $500. El resto puede ser el día del evento.' },
  { question: /hacen contrato|contrato/i, answer: 'Sí, una vez acreditado tu anticipo, lleno tu contrato y te envío foto.' },
  { question: /con cuanto tiempo separo mi fecha|separar/i, answer: 'Puedes separar en cualquier momento, siempre que la fecha esté disponible.' },
  { question: /se puede separar para 2026|2026/i, answer: 'Sí, tenemos agenda abierta para 2025 y 2026.' },
  { question: /cuánto se cobra de flete|flete/i, answer: 'Depende de la ubicación del evento. Contáctanos con tu dirección para calcularlo.' },
  { question: /cómo reviso si tienen mi fecha disponible/i, answer: 'Dime, ¿para cuándo es tu evento? 😊' },
  { question: /ubicación|dónde están|donde son|ubican|oficinas/i, answer: '📍 Estamos en la Colonia Independencia en Monterrey. Atendemos eventos hasta 25 km a la redonda.' },
  { question: /pago|método de pago|tarjeta|efectivo/i, answer: 'Aceptamos transferencias bancarias, depósitos y pagos en efectivo.' }
];

// 📌 Función para buscar respuestas en preguntas frecuentes
function findFAQ(userMessage) {
  for (const faq of faqs) {
    if (faq.question.test(userMessage)) {
      return faq.answer;
    }
  }
  return null;
}

// 📌 Función para manejar preguntas frecuentes antes de enviar el mensaje a OpenAI
async function handleFAQs(from, userMessage) {
  const faqAnswer = findFAQ(userMessage);
  if (faqAnswer) {
    await sendWhatsAppMessage(from, faqAnswer);
    return true;
  }
  return false;
}


//////////////////////////////////////////////////////////

// 📌 Función para enviar mensajes con indicador de escritura
async function sendMessageWithTyping(from, message, delayTime) {
  await activateTypingIndicator(from); // ✅ Activar "escribiendo" primero
  await delay(delayTime); // ⏳ Esperar un tiempo antes de enviar
  await sendWhatsAppMessage(from, message); // ✅ Enviar mensaje después
  await deactivateTypingIndicator(from); // ✅ Desactivar "escribiendo"
}

// 📌 Función para crear un retraso
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 📌 Función para activar el indicador de "escribiendo"
async function activateTypingIndicator(to) {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const headers = {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    };
    const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'typing', // ✅ WhatsApp API reconoce "typing", no "text"
        status: 'typing' // ✅ Correcto: Indica que el bot está escribiendo
    };

    try {
        await axios.post(url, data, { headers });
        console.log('✅ Indicador de "escribiendo" activado');
    } catch (error) {
        console.error('❌ Error al activar el indicador de "escribiendo":', error.response?.data || error.message);
    }
}

// 📌 Función para desactivar el indicador de "escribiendo"
async function deactivateTypingIndicator(to) {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const headers = {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    };
    const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'typing', // ✅ Misma estructura
        status: 'paused' // ✅ Correcto: Indica que el bot dejó de escribir
    };

    try {
        await axios.post(url, data, { headers });
        console.log('✅ Indicador de "escribiendo" desactivado');
    } catch (error) {
        console.error('❌ Error al desactivar el indicador de "escribiendo":', error.response?.data || error.message);
    }
}

// Función para enviar mensajes con formato (cursiva, negrita, etc.)
function formatMessage(text, style = "normal") {
  if (style === "italic") return `_${text}_`;
  if (style === "bold") return `*${text}*`;
  return text;
}

 // Función para formatear precios en el formato $5,600
 function formatPrice(amount) {
  return `$${amount.toLocaleString('en-US')}`;
}

// Función para manejar la lógica de los paquetes
async function handlePackage(from, packageName, imageUrl, includes, price, discount, freeItems, videoUrl) {
  await sendImageMessage(from, imageUrl);
  await delay(2000);

  await sendMessageWithTyping(from, `El paquete que estamos promocionando es el\n${formatMessage(`"${packageName}"`, "bold")}`, 2000);

  await sendMessageWithTyping(from, `${formatMessage("INCLUYE", "bold")}\n\n${includes}\n\nPor Sólo\n\n${formatMessage(`✨ ${formatPrice(price)} ✨`, "bold")}\n\n${formatMessage("Mas flete, dependiendo dónde sea el evento", "italic")} 📍`, 5000);

  await sendMessageWithTyping(from, `Y llévate GRATIS la renta de:\n\n${freeItems}`, 9000);

  await sendMessageWithTyping(from, `${formatMessage("¡¡ PERO ESPERA !! ✋", "bold")}`, 8000);

  await sendMessageWithTyping(from, `¡Sólo durante éste mes disfruta de un descuento de ${formatPrice(discount)}!`, 5000);

  await sendMessageWithTyping(from, `Paga únicamente\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}`, 5000);

  await sendMessageWithTyping(from, `Y ESO NO ES TODO!!\n\n🎁 ${formatMessage("GRATIS", "bold")} el Servicio de:\n\n✅ Audio Guest Book\n\nSerá un recuerdo muy bonito de tu evento 😍`, 7000);

  await sendWhatsAppVideo(from, videoUrl);
  await delay(18000);

  await sendMessageWithTyping(from, `¡Contrata TODO por tan sólo!\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}`, 5000);

  await sendMessageWithTyping(from, `¡SI! ¡Leiste bien!\n\n${includes}\n\n🎁 ${formatMessage("DE REGALO", "bold")}\n${freeItems}\n✅ Un descuento de ${formatPrice(discount)}\n✅ Audio Guest Book\n\nTodo esto por tan sólo 😮\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}\n\n${formatMessage("Mas flete, dependiendo dónde sea tu evento", "italic")} 📍`, 18000);

  await sendMessageWithTyping(from, `Recuerda que este paquete solo estará vigente durante el mes de Febrero\n\n🗓️ Separa hoy mismo y asegura tu paquete antes de que te ganen la fecha`, 15000);

  await sendInteractiveMessage(from, 'Te interesa? 🎊\n\nO prefieres armar tu paquete?\n', [
    { id: 'reservar', title: 'SI, Me interesa 😍' },
    { id: 'armar_paquete', title: '🛠 Armar mi paquete' }
  ]);

  return true;
}

// Función para validar el formato de la fecha (DD/MM/AAAA)
function isValidDate(dateString) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/; // Formato DD/MM/AAAA
  if (!regex.test(dateString)) return false;

  const [day, month, year] = dateString.split('/').map(Number);
  const date = new Date(year, month - 1, day); // Meses en JavaScript son 0-indexados

  // Verificar si la fecha es válida
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

// Función para verificar disponibilidad (simulada)
function checkAvailability(dateString) {
  // Aquí puedes conectar con una base de datos o API para verificar disponibilidad real
  // Por ahora, simulamos que las fechas ocupadas son el 15/02/2024 y el 20/02/2024
  const occupiedDates = ['15/02/2024', '20/02/2024'];
  return !occupiedDates.includes(dateString);
}

////////////////////////////////////////////////////////////////////

///-------------------------------------------------------------///

// 📌 Función para manejar los mensajes del usuario
async function handleUserMessage(from, userMessage, buttonReply) {
  const messageLower = buttonReply ? buttonReply.toLowerCase() : userMessage.toLowerCase();

  // Inicializar el contexto del usuario si no existe
  if (!userContext[from]) {
    userContext[from] = {
      estado: "inicio", // Estado inicial
      tipoEvento: null,
      nombre: null,
      fecha: null,
      serviciosSeleccionados: [],
      total: 0
    };
  }

  // Obtener el contexto actual del usuario
  const context = userContext[from];

  try {
    // Función para enviar mensajes con indicador de escritura y control de estado
    async function sendMessageWithTypingWithState(from, message, delayTime, estadoEsperado) {
      await activateTypingIndicator(from);
      await delay(delayTime);
      if (userContext[from].estado === estadoEsperado) {
        await sendWhatsAppMessage(from, message);
      }
      await deactivateTypingIndicator(from);
    }

    // Función para enviar mensajes interactivos con imagen y control de estado
    async function sendInteractiveMessageWithImageWithState(from, message, imageUrl, options, estadoEsperado) {
      await sendMessageWithTypingWithState(from, message, 3000, estadoEsperado);
      if (userContext[from].estado !== estadoEsperado) return; // Abortamos si el estado cambió
      await sendImageMessage(from, imageUrl);
      await delay(10000);
      if (userContext[from].estado !== estadoEsperado) return;
      await sendInteractiveMessage(from, options.message, options.buttons);
    }

    // ── Flujo inicial ──
    if (['info', 'costos', 'hola', 'precio', 'información'].some(word => messageLower.includes(word))) {
      userContext[from].estado = "inicio";
      await sendMessageWithTypingWithState(from, '¡Hola 👋! Soy tu asistente virtual de *Camicam Photobooth*', 4000, "inicio");
      await sendMessageWithTypingWithState(from, 'Para brindarte la mejor atención', 2500, "inicio");
      await sendInteractiveMessage(from, 'Por favor selecciona el tipo de evento que tienes 👇', [
        { id: 'evento_xv', title: '🎉 XV Años' },
        { id: 'evento_boda', title: '💍 Boda' },
        { id: 'evento_otro', title: '🎊 Otro Evento' }
      ]);
      return true;
    }

    // ── Función para manejar la selección de eventos ──
    async function handleEventSelection(from, eventType, packageName) {
      // Actualizamos el estado del usuario según la opción seleccionada
      userContext[from].estado = `evento_${eventType}_seleccionado`;
      const estadoEsperado = userContext[from].estado;

      const message = 'Conoce los servicios que ofrecemos en *Camicam Photobooth* 🎉';
      const imageUrl = 'http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg';
      const options = {
        message:
          'Puedes ver videos de nuestros servicios. ▶️\n\n' +
          'Armar tu paquete con todo lo que necesites!! 😊\n\n' +
          `O ver el Paquete que hemos preparado para ${packageName} 👇`,
        buttons: [
          { id: 'ver_videos', title: '▶️ Ver videos' },
          { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
          { id: `ver_paquete_${eventType}`, title: `🎉 Ver PAQUETE ${packageName.toUpperCase()}` }
        ]
      };

      await sendInteractiveMessageWithImageWithState(from, message, imageUrl, options, estadoEsperado);
      return true;
    }

    // ── Selección de evento ──
    if (messageLower === 'evento_xv') {
      return handleEventSelection(from, 'xv', 'Mis XV');
    }
    if (messageLower === 'evento_boda') {
      return handleEventSelection(from, 'wedding', 'Wedding');
    }
    if (messageLower === 'evento_otro') {
      return handleEventSelection(from, 'party', 'Party');
    }

    // ── Respuestas a botones de paquetes ──
    if (messageLower === 'ver_paquete_xv') {
      return handlePackage(
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
      return handlePackage(
        from,
        "PAQUETE WEDDING",
        "http://cami-cam.com/wp-content/uploads/2024/09/Paquete-Wedding.jpg",
        "✅ Cabina de Fotos ó Cabina 360 (3 Horas)\n✅ 4 Letras Gigantes: *A & A ❤️* (5 horas)",
        5100,
        650,
        "✅ Carrito de 100 Shots CON alcohol\n✅ 2 Chisperos de piso",
        "http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4"
      );
    }
    if (messageLower === 'ver_paquete_party') {
      return handlePackage(
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

    // ── Validar si al usuario le interesa el paquete ──
    if (messageLower === 'reservar') {
      await sendWhatsAppMessage(from, '¡De acuerdo!\n\nPara separar solicitamos un anticipo de $500, el resto puede ser el día del evento.\n\n🗓️ Por favor dime tu fecha para revisar disponibilidad (formato: DD/MM/AAAA).');
      userContext[from].estado = "esperando_fecha";
      return true;
    }

    // ── Manejar la fecha proporcionada ──
    if (userContext[from].estado === "esperando_fecha") {
      const fechaUsuario = messageLower.trim();
      if (!isValidDate(fechaUsuario)) {
        await sendWhatsAppMessage(from, '⚠️ Formato de fecha incorrecto. Por favor, ingresa la fecha en el formato DD/MM/AAAA.');
        return true;
      }
      if (!checkAvailability(fechaUsuario)) {
        await sendWhatsAppMessage(from, `Lo siento, la fecha ${fechaUsuario} no está disponible. Por favor, elige otra fecha.`);
        return true;
      }
      userContext[from].fecha = fechaUsuario;
      await sendWhatsAppMessage(from, `✅ ¡Perfecto! La fecha ${fechaUsuario} está disponible.\n\nPara confirmar tu reserva, realiza el anticipo de $500 a la siguiente cuenta:\n\n💳 Banco: XYZ\n📌 CLABE: 123456789012345678\n👤 Titular: Camicam Photobooth`);
      userContext[from].estado = "confirmando_pago";
      return true;
    }

    // ── Validar si el usuario quiere "Armar mi paquete" ──
    if (messageLower === 'armar_paquete') {
      await sendWhatsAppMessage(from, '🔗 Para armar tu paquete personalizado, visita nuestro cotizador en el siguiente enlace:\n🌐 www.cami-cam.com/cotizador/');
      return true;
    }

    // ── Manejar el botón "Ver videos" ──
    if (messageLower === 'ver_videos') {
      await sendWhatsAppMessage(from, 'Aquí tienes algunos videos de nuestros servicios:');
      await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4', 'Audio Guest Book');
      await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4', 'Letras Gigantes');
      await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/LLUVIA-DE-MARIPOSAS-2.0.mp4', 'Lluvia de Mariposas');
      return true;
    }

    // Aquí se pueden agregar más condiciones según el flujo

  } catch (error) {
    console.error("❌ Error en handleUserMessage:", error.message);
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error.");
    return false;
  }
}


///-------------------------------------------------------------///







// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});
*/








//CODIGO FUNCIONANDO CON REPORTE DE IMAGENES Y VIDEOS AL CRM ADEMAS DE OPEN AI Y CONSULTA DE FLETES , PERO NO FUNCIONA CORRECTAMENTE
/*


// Importar dependencias en modo ES Modules
import dotenv from 'dotenv'; // Para cargar variables de entorno
import express from 'express';
import bodyParser from 'body-parser';
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
app.use(bodyParser.json());

// Objeto para almacenar el contexto de cada usuario
const userContext = {};

// Precios de los servicios
const preciosServicios = {
  cabina_fotos: 2000,
  cabina_360: 3000,
  letras_gigantes: 1500,
  carrito_shots_alcohol: 2500,
  carrito_shots_sin_alcohol: 2000,
  lluvia_mariposas: 1000,
  lluvia_metálica: 1200,
  chisperos_mano: 800,
  chisperos_piso: 1000,
  scrapbook: 500,
  niebla_piso: 600,
  audio_guest_book: 700,
};

// Paquetes sugeridos
const paquetesSugeridos = {
  paquete_xv: {
    nombre: "Paquete Mis XV",
    servicios: ["cabina_fotos", "lluvia_mariposas", "letras_gigantes", "chisperos_mano"],
    precio: 5600,
    descuento: "50% OFF",
    bono: "Scrapbook gratis"
  },
  paquete_wedding: {
    nombre: "Paquete WEDDING",
    servicios: ["cabina_360", "carrito_shots_alcohol", "letras_gigantes", "chisperos_piso"],
    precio: 4450,
    descuento: "50% OFF"
  },
  paquete_party: {
    nombre: "Paquete Party",
    servicios: ["cabina_fotos", "letras_gigantes"],
    precio: 3000
  }
};

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

// Ruta para la raíz
app.get('/', async (req, res) => {
  res.send('¡Servidor funcionando correctamente!');
  console.log("Ruta '/' accedida correctamente.");

  // Prueba para enviar mensaje usando sendWhatsAppMessage
  try {
    console.log('Enviando mensaje de prueba a WhatsApp...');
    await sendWhatsAppMessage('528133971595', 'hello_world', 'en_US');
    console.log('Mensaje de prueba enviado exitosamente.');
  } catch (error) {
    console.error('Error al enviar mensaje de prueba:', error.message);
  }
});

// 📌 Ruta de prueba para mensajes interactivos
app.get('/test-interactive', async (req, res) => {
  const testNumber = "528133971595"; // Reemplázalo con tu número de prueba
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
});


// 📌 Webhook para manejar mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  console.log("📩 Webhook activado:", JSON.stringify(req.body, null, 2));

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  let userMessage = "";
  if (message.text && message.text.body) {
    userMessage = message.text.body;
  } else if (message.interactive && message.interactive.button_reply) {
    // Extraemos el título del botón; si no está, se usa el id
    userMessage = message.interactive.button_reply.title || message.interactive.button_reply.id;
  } else if (message.interactive && message.interactive.list_reply) {
    userMessage = message.interactive.list_reply.title || message.interactive.list_reply.id;
  }
  const plataforma = "WhatsApp";

  console.log(`📩 Enviando mensaje de ${from} al CRM: ${userMessage}`);

  try {
    const response = await axios.post('https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje', {
      plataforma: plataforma,
      remitente: from,
      mensaje: userMessage
    });
    console.log("✅ Respuesta del CRM:", response.data);
  } catch (error) {
    console.error("❌ Error al enviar mensaje al CRM:", error.message);
  }

  // Los logs adicionales para depuración
  const buttonReply = message?.interactive?.button_reply?.id || '';
  const listReply = message?.interactive?.list_reply?.id || '';
  const messageLower = buttonReply ? buttonReply.toLowerCase() : listReply ? listReply.toLowerCase() : userMessage.toLowerCase();

  console.log("📌 Mensaje recibido:", userMessage);
  console.log("🔘 Botón presionado:", buttonReply);
  console.log("📄 Lista seleccionada:", listReply);

  try {
    // Manejo de preguntas frecuentes
    if (await handleFAQs(from, userMessage)) {
      return res.sendStatus(200);
    }

    // Pasar a handleUserMessage para otros casos
    const handled = await handleUserMessage(from, userMessage, buttonReply);
    if (handled) return res.sendStatus(200);


  } catch (error) {
    console.error("❌ Error al manejar el mensaje:", error.message);
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error al procesar tu solicitud. Inténtalo nuevamente.");
  }

  res.sendStatus(200);
});

// 📌 Preguntas frecuentes corregidas y optimizadas
const faqs = [
  { question: /como separo mi fecha|anticipo/i, answer: 'Separamos fecha con $500. El resto puede ser el día del evento.' },
  { question: /hacen contrato|contrato/i, answer: 'Sí, una vez acreditado tu anticipo, lleno tu contrato y te envío foto.' },
  { question: /con cuanto tiempo separo mi fecha|separar/i, answer: 'Puedes separar en cualquier momento, siempre que la fecha esté disponible.' },
  { question: /se puede separar para 2026|2026/i, answer: 'Sí, tenemos agenda abierta para 2025 y 2026.' },
  { question: /cuánto se cobra de flete|flete/i, answer: 'Depende de la ubicación del evento. Contáctanos con tu dirección para calcularlo.' },
  { question: /cómo reviso si tienen mi fecha disponible/i, answer: 'Dime, ¿para cuándo es tu evento? 😊' },
  { question: /ubicación|dónde están|donde son|ubican|oficinas/i, answer: '📍 Estamos en la Colonia Independencia en Monterrey. Atendemos eventos hasta 25 km a la redonda.' },
  { question: /pago|método de pago|tarjeta|efectivo/i, answer: 'Aceptamos transferencias bancarias, depósitos y pagos en efectivo.' }
];

// 📌 Función para buscar respuestas en preguntas frecuentes
function findFAQ(userMessage) {
  for (const faq of faqs) {
    if (faq.question.test(userMessage)) {
      return faq.answer;
    }
  }
  return null;
}

// 📌 Función para manejar preguntas frecuentes antes de enviar el mensaje a OpenAI
async function handleFAQs(from, userMessage) {
  const faqAnswer = findFAQ(userMessage);
  if (faqAnswer) {
    await sendWhatsAppMessage(from, faqAnswer);
    return true;
  }
  return false;
}




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



// 📌 Función para enviar mensajes simples
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

    // Convertir el mensaje a HTML (aquí lo envolvemos en un párrafo)
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


// 📌 Función para enviar mensajes interactivos con botones
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

    // Construir un resumen HTML que incluya el body y los títulos de los botones
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




// 📌 Función para enviar videos
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

    // Construir un resumen HTML que incluya el video y el caption (si existe)
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



///Fucion para enviar imagenes
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

    // Construir un resumen HTML para reportar en el CRM
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



//////////////////////////////////////////////////////////

// 📌 Función para enviar mensajes con indicador de escritura
async function sendMessageWithTyping(from, message, delayTime) {
  await activateTypingIndicator(from); // ✅ Activar "escribiendo" primero
  await delay(delayTime); // ⏳ Esperar un tiempo antes de enviar
  await sendWhatsAppMessage(from, message); // ✅ Enviar mensaje después
  await deactivateTypingIndicator(from); // ✅ Desactivar "escribiendo"
}

// 📌 Función para crear un retraso
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 📌 Función para activar el indicador de "escribiendo"
async function activateTypingIndicator(to) {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const headers = {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    };
    const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'typing', // ✅ WhatsApp API reconoce "typing", no "text"
        status: 'typing' // ✅ Correcto: Indica que el bot está escribiendo
    };

    try {
        await axios.post(url, data, { headers });
        console.log('✅ Indicador de "escribiendo" activado');
    } catch (error) {
        console.error('❌ Error al activar el indicador de "escribiendo":', error.response?.data || error.message);
    }
}

// 📌 Función para desactivar el indicador de "escribiendo"
async function deactivateTypingIndicator(to) {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const headers = {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    };
    const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'typing', // ✅ Misma estructura
        status: 'paused' // ✅ Correcto: Indica que el bot dejó de escribir
    };

    try {
        await axios.post(url, data, { headers });
        console.log('✅ Indicador de "escribiendo" desactivado');
    } catch (error) {
        console.error('❌ Error al desactivar el indicador de "escribiendo":', error.response?.data || error.message);
    }
}

// Función para enviar mensajes con formato (cursiva, negrita, etc.)
function formatMessage(text, style = "normal") {
  if (style === "italic") return `_${text}_`;
  if (style === "bold") return `*${text}*`;
  return text;
}

 // Función para formatear precios en el formato $5,600
 function formatPrice(amount) {
  return `$${amount.toLocaleString('en-US')}`;
}

// Función para manejar la lógica de los paquetes
async function handlePackage(from, packageName, imageUrl, includes, price, discount, freeItems, videoUrl) {
  await sendImageMessage(from, imageUrl);
  await delay(2000);

  await sendMessageWithTyping(from, `El paquete que estamos promocionando es el\n${formatMessage(`"${packageName}"`, "bold")}`, 2000);

  await sendMessageWithTyping(from, `${formatMessage("INCLUYE", "bold")}\n\n${includes}\n\nPor Sólo\n\n${formatMessage(`✨ ${formatPrice(price)} ✨`, "bold")}\n\n${formatMessage("Mas flete, dependiendo dónde sea el evento", "italic")} 📍`, 5000);

  await sendMessageWithTyping(from, `Y llévate GRATIS la renta de:\n\n${freeItems}`, 9000);

  await sendMessageWithTyping(from, `${formatMessage("¡¡ PERO ESPERA !! ✋", "bold")}`, 8000);

  await sendMessageWithTyping(from, `¡Sólo durante éste mes disfruta de un descuento de ${formatPrice(discount)}!`, 5000);

  await sendMessageWithTyping(from, `Paga únicamente\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}`, 5000);

  await sendMessageWithTyping(from, `Y ESO NO ES TODO!!\n\n🎁 ${formatMessage("GRATIS", "bold")} el Servicio de:\n\n✅ Audio Guest Book\n\nSerá un recuerdo muy bonito de tu evento 😍`, 7000);

  await sendWhatsAppVideo(from, videoUrl);
  await delay(18000);

  await sendMessageWithTyping(from, `¡Contrata TODO por tan sólo!\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}`, 5000);

  await sendMessageWithTyping(from, `¡SI! ¡Leiste bien!\n\n${includes}\n\n🎁 ${formatMessage("DE REGALO", "bold")}\n${freeItems}\n✅ Un descuento de ${formatPrice(discount)}\n✅ Audio Guest Book\n\nTodo esto por tan sólo 😮\n\n${formatMessage(`✨ ${formatPrice(price - discount)} ✨`, "bold")}\n\n${formatMessage("Mas flete, dependiendo dónde sea tu evento", "italic")} 📍`, 18000);

  await sendMessageWithTyping(from, `Recuerda que este paquete solo estará vigente durante el mes de Febrero\n\n🗓️ Separa hoy mismo y asegura tu paquete antes de que te ganen la fecha`, 15000);

  await sendInteractiveMessage(from, 'Te interesa? 🎊\n\nO prefieres armar tu paquete?\n', [
    { id: 'reservar', title: 'SI, Me interesa 😍' },
    { id: 'armar_paquete', title: '🛠 Armar mi paquete' }
  ]);

  return true;
}

// Función para validar el formato de la fecha (DD/MM/AAAA)
function isValidDate(dateString) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/; // Formato DD/MM/AAAA
  if (!regex.test(dateString)) return false;

  const [day, month, year] = dateString.split('/').map(Number);
  const date = new Date(year, month - 1, day); // Meses en JavaScript son 0-indexados

  // Verificar si la fecha es válida
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

// Función para verificar disponibilidad (simulada)
function checkAvailability(dateString) {
  // Aquí puedes conectar con una base de datos o API para verificar disponibilidad real
  // Por ahora, simulamos que las fechas ocupadas son el 15/02/2024 y el 20/02/2024
  const occupiedDates = ['15/02/2024', '20/02/2024'];
  return !occupiedDates.includes(dateString);
}

////////////////////////////////////////////////////////////////////

///-------------------------------------------------------------///

// 📌 Función para manejar los mensajes del usuario
async function handleUserMessage(from, userMessage, buttonReply) {
  const messageLower = buttonReply ? buttonReply.toLowerCase() : userMessage.toLowerCase();

  // Inicializar el contexto del usuario si no existe, asumiendo "Contacto Inicial" para nuevos leads.
  if (!userContext[from]) {
    userContext[from] = {
      estado: "Contacto Inicial", // Estado inicial para nuevos clientes
      tipoEvento: null,
      nombre: null,
      fecha: null,
      serviciosSeleccionados: [],
      total: 0
    };
  }

  const context = userContext[from];

  try {
    // Función que envía mensajes con indicador de escritura y verifica que el estado no cambie.
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
    

    // Función para enviar mensajes interactivos con imagen y control de estado.
    async function sendInteractiveMessageWithImageWithState(from, message, imageUrl, options, estadoEsperado) {
      await sendMessageWithTypingWithState(from, message, 3000, estadoEsperado);
      if (userContext[from].estado !== estadoEsperado) return;
      await sendImageMessage(from, imageUrl);
      await delay(10000);
      if (userContext[from].estado !== estadoEsperado) return;
      await sendInteractiveMessage(from, options.message, options.buttons);
    }


// Configuramos el caché para que las entradas expiren en 1 hora (3600 segundos)
const responseCache = new NodeCache({ stdTTL: 3600 });

// Función para construir el contexto a partir de tus objetos
// Función para calcular el costo de flete
function calcularFlete(ubicacionEvento, cantidadServicios) {
  // Convertir la ubicación a minúsculas para evitar problemas de mayúsculas/minúsculas
  const loc = ubicacionEvento.toLowerCase().trim();

  // 1. Centro de Monterrey: sin costo de flete si se requiere al menos 1 servicio
  if (loc === 'centro de monterrey') {
    return 0;
  }

  // 2. Monterrey, san nicolas de los garza, guadalupe, san pedro garza garcia:
  //    - Si se requieren 2 o menos servicios: $200, si son 3 o más: sin costo
  if (loc === 'monterrey' || loc === 'san nicolas de los garza' || loc === 'guadalupe' || loc === 'san pedro garza garcia') {
    return cantidadServicios <= 2 ? 200 : 0;
  }

  // 3. Santa Catarina, Escobedo, Juarez:
  //    - Si se requieren 3 o menos servicios: $400, si son 4 o más: $200
  if (loc === 'santa catarina' || loc === 'escobedo' || loc === 'juarez') {
    return cantidadServicios <= 3 ? 400 : 200;
  }

  // Si la ubicación no coincide, por defecto no se cobra flete.
  return 0;
}

function construirContexto(ubicacionEvento, cantidadServicios) {
  // Calcular el costo de flete usando la función definida
  const costoFlete = calcularFlete(ubicacionEvento, cantidadServicios);

  let contexto = 'Información de Servicios y Paquetes de Camicam Photobooth:\n\n';
  contexto += "Estamos ubicados en el centro de Monterrey, Nuevo León, México y atendemos eventos hasta 25 km a la redonda.\n\n";
  
  // Incluir la lógica de flete en el contexto
  if (costoFlete === 0) {
    contexto += "Flete: Sin costo de flete.\n\n";
  } else {
    contexto += `Flete: $${costoFlete}.\n\n`;
  }

  contexto += 'Precios de Servicios:\n';
  contexto += `- Cabina de Fotos: $${preciosServicios.cabina_fotos}\n`;
  contexto += `- Cabina 360: $${preciosServicios.cabina_360}\n`;
  contexto += `- Letras Gigantes: $${preciosServicios.letras_gigantes}\n`;
  contexto += `- Carrito de Shots (con alcohol): $${preciosServicios.carrito_shots_alcohol}\n`;
  contexto += `- Carrito de Shots (sin alcohol): $${preciosServicios.carrito_shots_sin_alcohol}\n`;
  contexto += `- Lluvia de Mariposas: $${preciosServicios.lluvia_mariposas}\n`;
  contexto += `- Lluvia Metálica: $${preciosServicios.lluvia_metálica}\n`;
  contexto += `- Chisperos a Mano: $${preciosServicios.chisperos_mano}\n`;
  contexto += `- Chisperos de Piso: $${preciosServicios.chisperos_piso}\n`;
  contexto += `- Scrapbook: $${preciosServicios.scrapbook}\n`;
  contexto += `- Niebla en Piso: $${preciosServicios.niebla_piso}\n`;
  contexto += `- Audio Guest Book: $${preciosServicios.audio_guest_book}\n\n`;

  contexto += 'Paquetes Sugeridos:\n';
  contexto += `- Paquete Mis XV: Incluye ${paquetesSugeridos.paquete_xv.servicios.join(', ')}. Precio: $${paquetesSugeridos.paquete_xv.precio}. Descuento: ${paquetesSugeridos.paquete_xv.descuento}. Bono: ${paquetesSugeridos.paquete_xv.bono}.\n`;
  contexto += `- Paquete WEDDING: Incluye ${paquetesSugeridos.paquete_wedding.servicios.join(', ')}. Precio: $${paquetesSugeridos.paquete_wedding.precio}. Descuento: ${paquetesSugeridos.paquete_wedding.descuento}.\n`;
  contexto += `- Paquete Party: Incluye ${paquetesSugeridos.paquete_party.servicios.join(', ')}. Precio: $${paquetesSugeridos.paquete_party.precio}.\n`;

  return contexto;
}





// Función para generar la clave de caché
function getCacheKey(query) {
  return query.toLowerCase();
}

async function getResponseFromOpenAI(query) {
  // Construir el contexto completo
  const contextoPaquetes = construirContexto();
  
  // Concatena el contexto y la consulta del usuario
  const fullQuery = `
${contextoPaquetes}

El cliente pregunta: "${query}"
Responde de forma profesional y concisa, basándote en la información anterior.
  `;
  
  const key = getCacheKey(fullQuery);
  // Verificar si existe respuesta en caché
  const cachedResponse = responseCache.get(key);
  if (cachedResponse) {
    console.log("Usando respuesta en caché para la consulta:", fullQuery);
    return cachedResponse;
  }
  
  // Si no está en caché, realiza la llamada a OpenAI
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "Eres un asistente de CRM que responde de forma profesional y concisa." },
      { role: "user", content: fullQuery }
    ],
    temperature: 0.7,
    max_tokens: 150,
  });
  
  const answer = response.choices[0].message.content;
  if (!answer || answer.trim() === "") {
    throw new Error("Respuesta vacía");
  }
  // Guardar la respuesta en caché
  responseCache.set(key, answer);
  return answer;
}


async function handleOpenAIResponse(from, userMessage) {
  try {
    const answer = await getResponseFromOpenAI(userMessage);
    
    // Envía la respuesta al cliente
    await sendWhatsAppMessage(from, answer);

    // Verifica si la respuesta indica que no hay suficiente información
    if (answer.includes("Lamentablemente, la información proporcionada no incluye detalles")) {
      const adminMessage = `El cliente ${from} preguntó: "${userMessage}" y la respuesta fue: "${answer}". Se requiere intervención humana para proporcionar más detalles.`;
      await sendWhatsAppMessage(process.env.ADMIN_WHATSAPP_NUMBER, adminMessage);
    }
    
  } catch (error) {
    console.error("Error de OpenAI:", error.message);
    // En caso de error, notificar al administrador y al cliente.
    const adminMessage = `El cliente ${from} preguntó: "${userMessage}" y OpenAI no pudo responder. Se requiere intervención humana.`;
    await sendWhatsAppMessage(process.env.ADMIN_WHATSAPP_NUMBER, adminMessage);
    await sendWhatsAppMessage(from, "Tu consulta requiere intervención de un agente. Pronto nos pondremos en contacto contigo.");
  }
}




    // ── Flujo automatizado para clientes nuevos (Contacto Inicial) ──
    if (['info', 'costos', 'hola', 'precio', 'información'].some(word => messageLower.includes(word))) {
      // Si el cliente es nuevo, forzamos el estado "Contacto Inicial"
      userContext[from].estado = "Contacto Inicial";
      await sendMessageWithTypingWithState(from, '¡Hola 👋! Soy tu asistente virtual de *Camicam Photobooth*', 4000, "Contacto Inicial");
      await sendMessageWithTypingWithState(from, 'Para brindarte la mejor atención', 2500, "Contacto Inicial");
      await sendInteractiveMessage(from, 'Por favor selecciona el tipo de evento que tienes 👇', [
        { id: 'evento_xv', title: '🎉 XV Años' },
        { id: 'evento_boda', title: '💍 Boda' },
        { id: 'evento_otro', title: '🎊 Otro Evento' }
      ]);
      return true;
    }

    // ── Función para manejar la selección de eventos ──
    async function handleEventSelection(from, eventType, packageName) {
      userContext[from].estado = `evento_${eventType}_seleccionado`;
      const estadoEsperado = userContext[from].estado;
      const message = 'Conoce los servicios que ofrecemos en *Camicam Photobooth* 🎉';
      const imageUrl = 'http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg';
      const options = {
        message:
          'Puedes ver videos de nuestros servicios. ▶️\n\n' +
          'Armar tu paquete con todo lo que necesites!! 😊\n\n' +
          `O ver el Paquete que hemos preparado para ${packageName} 👇`,
        buttons: [
          { id: 'ver_videos', title: '▶️ Ver videos' },
          { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
          { id: `ver_paquete_${eventType}`, title: `🎉 Ver PAQUETE ${packageName.toUpperCase()}` }
        ]
      };
      await sendInteractiveMessageWithImageWithState(from, message, imageUrl, options, estadoEsperado);
      return true;
    }

    // ── Selección de evento ──
    if (messageLower === 'evento_xv') {
      return handleEventSelection(from, 'xv', 'Mis XV');
    }
    if (messageLower === 'evento_boda') {
      return handleEventSelection(from, 'wedding', 'Wedding');
    }
    if (messageLower === 'evento_otro') {
      return handleEventSelection(from, 'party', 'Party');
    }

    // ── Respuestas a botones de paquetes ──
    if (messageLower === 'ver_paquete_xv') {
      return handlePackage(
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
      return handlePackage(
        from,
        "PAQUETE WEDDING",
        "http://cami-cam.com/wp-content/uploads/2024/09/Paquete-Wedding.jpg",
        "✅ Cabina de Fotos ó Cabina 360 (3 Horas)\n✅ 4 Letras Gigantes: *A & A ❤️* (5 horas)",
        5100,
        650,
        "✅ Carrito de 100 Shots CON alcohol\n✅ 2 Chisperos de piso",
        "http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4"
      );
    }
    if (messageLower === 'ver_paquete_party') {
      return handlePackage(
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

    // ── Validar si al usuario le interesa el paquete ──
    if (messageLower === 'reservar') {
      await sendWhatsAppMessage(from, '¡De acuerdo!\n\nPara separar solicitamos un anticipo de $500, el resto puede ser el día del evento.\n\n🗓️ Por favor dime tu fecha para revisar disponibilidad (formato: DD/MM/AAAA).');
      userContext[from].estado = "esperando_fecha";
      return true;
    }

    // ── Manejar la fecha proporcionada ──
    if (userContext[from].estado === "esperando_fecha") {
      const fechaUsuario = messageLower.trim();
      if (!isValidDate(fechaUsuario)) {
        await sendWhatsAppMessage(from, '⚠️ Formato de fecha incorrecto. Por favor, ingresa la fecha en el formato DD/MM/AAAA.');
        return true;
      }
      if (!checkAvailability(fechaUsuario)) {
        await sendWhatsAppMessage(from, `Lo siento, la fecha ${fechaUsuario} no está disponible. Por favor, elige otra fecha.`);
        return true;
      }
      userContext[from].fecha = fechaUsuario;
      await sendWhatsAppMessage(from, `✅ ¡Perfecto! La fecha ${fechaUsuario} está disponible.\n\nPara confirmar tu reserva, realiza el anticipo de $500 a la siguiente cuenta:\n\n💳 Banco: XYZ\n📌 CLABE: 123456789012345678\n👤 Titular: Camicam Photobooth`);
      userContext[from].estado = "confirmando_pago";
      return true;
    }

   
    // ── Validar si el usuario quiere "Armar mi paquete" ──
    if (messageLower === 'armar_paquete') {
      await sendWhatsAppMessage(from, '🔗 Para armar tu paquete personalizado, visita nuestro cotizador en el siguiente enlace:\n🌐 www.cami-cam.com/cotizador/');
      return true;
    }

    // ── Manejar el botón "Ver videos" ──
    if (messageLower === 'ver_videos') {
      await sendWhatsAppMessage(from, 'Aquí tienes algunos videos de nuestros servicios:');
      await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/Audio-Guest-Book.mp4', 'Audio Guest Book');
      await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4', 'Letras Gigantes');
      await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2025/02/LLUVIA-DE-MARIPOSAS-2.0.mp4', 'Lluvia de Mariposas');
      return true;
    }

    // ── Caso en que el mensaje no sea reconocido ──
    if (userContext[from].estado === "Contacto Inicial") {
      // Para nuevos clientes se mantiene el flujo automatizado (por ejemplo, mostrando preguntas frecuentes)
      console.log("❓ Mensaje no reconocido. Mostrando opción de Preguntas Frecuentes.");
      await sendInteractiveMessage(from, "No estoy seguro de cómo responder a eso. ¿Quieres ver nuestras preguntas frecuentes?", [
        { id: 'ver_faqs', title: 'Preg. Frecuentes' }
      ]);
    } else {
      // Para clientes que ya no son nuevos, se intenta responder con OpenAI
      console.log("❓ Mensaje no reconocido. Intentando respuesta con OpenAI.");
      await handleOpenAIResponse(from, userMessage);
    }

  } catch (error) {
    console.error("❌ Error en handleUserMessage:", error.message);
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error.");
    return false;
  }
}



///-------------------------------------------------------------///







// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});



*/
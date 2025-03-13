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

// Middleware para manejar JSON (usando express.json() en lugar de body-parser)
app.use(express.json());

// Objeto para almacenar el contexto de cada usuario
const userContext = {};

// Función para construir el contexto para OpenAI
function construirContexto() {
  return `
Eres un agente de ventas de "Camicam Photobooth". 
Nos dedicamos a la renta de servicios para eventos sociales, con especialización en bodas y XV años. 
Ofrecemos los siguientes servicios:
  - Cabina de fotos: $3,500
  - Cabina 360: $3,500
  - Lluvia de mariposas: $2,500
  - Carrito de shots con alcohol: $2,800
  - Letras gigantes: $400 cada una
  
Atendemos el centro de Monterrey, Nuevo León y el área metropolitana hasta 25 km a la redonda. 
Responde de forma profesional, clara, concisa y persuasiva, como un vendedor experto en nuestros servicios.
  `;
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

// Ruta para la raíz
app.get('/', async (req, res) => {
  res.send('¡Servidor funcionando correctamente!');
  console.log("Ruta '/' accedida correctamente.");

  // Prueba para enviar mensaje usando sendWhatsAppMessage
  try {
    console.log('Enviando mensaje de prueba a WhatsApp...');
    await sendWhatsAppMessage('528133971595', 'hello_world');
    console.log('Mensaje de prueba enviado exitosamente.');
  } catch (error) {
    console.error('Error al enviar mensaje de prueba:', error.message);
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

  // Logs adicionales para depuración
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

    // Manejo del flujo de mensajes del usuario
    const handledFlow = await handleUserMessage(from, userMessage, messageLower);
    if (handledFlow) return res.sendStatus(200);

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
  { question: /pago|método de pago|tarjeta|efectivo/i, answer: 'Aceptamos transferencias bancarias, depósitos y pagos en efectivo.' },
  { question: /que servicios manejas|servicios/i, answer: 'Estos son los servicios que manejamos:', 
    imageUrl: 'http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg' },
  { question: /que incluye la cabina de fotos|cabina de fotos/i, answer: 'CABINA DE FOTOS precio Regular: $3,500 servicio por 3 horas',
    images: ['http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg',
             'http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-2.jpg',
             'http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-3.jpg',
             'http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-4.jpg',
             'http://cami-cam.com/wp-content/uploads/2025/03/Cabina-multicolor-2.jpeg'
            ], 
    videos: [
              'http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Blanca.mp4', 
              'http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Rosa.mp4', 
              'http://cami-cam.com/wp-content/uploads/2025/03/cabina-multicolor.mp4'  
            ]
   }
];

// Función para buscar respuestas en preguntas frecuentes
function findFAQ(userMessage) {
  for (const faq of faqs) {
    if (faq.question.test(userMessage)) {
      return faq; 
    }
  }
  return null;
}


// Función para manejar preguntas frecuentes antes de enviar el mensaje a OpenAI
async function handleFAQs(from, userMessage) {
  const faqEntry = findFAQ(userMessage);
  if (faqEntry) {
    // Enviar respuesta de texto
    await sendWhatsAppMessage(from, faqEntry.answer);
    // Enviar imagen si existe
    if (faqEntry.imageUrl) {
      await sendImageMessage(from, faqEntry.imageUrl);
    }
    // Enviar múltiples imágenes si existen
    if (faqEntry.images && Array.isArray(faqEntry.images)) {
      for (const imageUrl of faqEntry.images) {
        await sendImageMessage(from, imageUrl);
      }
    }
    // Enviar un video si existe videoUrl
    if (faqEntry.videoUrl) {
      await sendWhatsAppVideo(from, faqEntry.videoUrl);
    }
    // Enviar múltiples videos si existen
    if (faqEntry.videos && Array.isArray(faqEntry.videos)) {
      for (const videoUrl of faqEntry.videos) {
        await sendWhatsAppVideo(from, videoUrl);
      }
    }
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

// Función para enviar mensajes simples
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

    // Convertir el mensaje a HTML (envolviendo en un párrafo)
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

    // Resumen HTML con el body y los títulos de los botones
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
  // Fechas ocupadas simuladas
  const occupiedDates = ['15/02/2024', '20/02/2024'];
  return !occupiedDates.includes(dateString);
}

// Función para manejar los mensajes del usuario y el flujo inicial
async function handleUserMessage(from, userMessage, messageLower) {
  // Inicializar el contexto del usuario si no existe
  if (!userContext[from]) {
    userContext[from] = {
      estado: "Contacto Inicial", // Estado inicial
      tipoEvento: null,
      nombre: null,
      fecha: null,
      lugar: null,
      serviciosSeleccionados: [],
      total: 0
    };
  }
  const context = userContext[from];

  // Flujo inicial: preguntar el tipo de evento y ofrecer opciones
  if (context.estado === "Contacto Inicial") {
    // Enviar mensaje interactivo con imagen para preguntar el tipo de evento
    // Reemplaza la URL de la imagen por la correspondiente a tus servicios
    await sendInteractiveMessageWithImageWithState(
      from,
      "¡Bienvenido a Camicam Photobooth! Conoce los Servicios que ofrecemos",
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

  if (context.estado === "EsperandoTipoEvento") {
    // Determinar el tipo de evento según la respuesta del usuario
    if (messageLower.includes("boda") || messageLower.includes("evento_boda")) {
      context.tipoEvento = "Boda";
    } else if (messageLower.includes("xv") || messageLower.includes("quince")) {
      context.tipoEvento = "XV";
    } else {
      context.tipoEvento = "Otro";
    }
    // Ofrecer opciones de paquete
    const promptOpciones = `Has seleccionado: ${context.tipoEvento}. ¿Cómo deseas proceder?`;
    await sendInteractiveMessage(from, promptOpciones, [
      { id: "armar_paquete", title: "Armar mi paquete" },
      { id: "paquete_sugerido", title: "Ver paquete sugerido" }
    ]);
    context.estado = "OpcionesSeleccionadas";
    return true;
  }

  if (context.estado === "OpcionesSeleccionadas") {
    if (messageLower.includes("armar")) {
      await sendWhatsAppMessage(from, "Perfecto, por favor indícanos los servicios que deseas incluir en tu paquete.");
    } else if (messageLower.includes("sugerido") || messageLower.includes("paquete_sugerido")) {
      if (context.tipoEvento === "Boda") {
        await sendWhatsAppMessage(from, "Te recomendamos el 'Paquete Wedding': Incluye Cabina 360, iniciales (por ejemplo, A&A y un corazón), 2 chisperos y un carrito de shots con alcohol, todo por $4,450.");
      } else if (context.tipoEvento === "XV") {
        await sendWhatsAppMessage(from, "Te recomendamos el 'Paquete Mis XV': Incluye 6 letras gigantes, Cabina de fotos, Lluvia de mariposas y 2 chisperos, todo por $5,600.");
      } else {
        await sendWhatsAppMessage(from, "Te recomendamos el 'Paquete Party': Incluye Cabina de fotos, 4 letras gigantes y un carrito de shots con alcohol, todo por $4,450.");
      }
    } else {
      await sendWhatsAppMessage(from, "No entendí tu respuesta. Por favor selecciona una de las opciones: 'Armar mi paquete' o 'Ver paquete sugerido'.");
      return true;
    }
    // Luego de elegir paquete (o armarlo), se pregunta la fecha del evento
    await sendWhatsAppMessage(from, "Para continuar, por favor indícanos la fecha de tu evento (Formato DD/MM/AAAA).");
    context.estado = "EsperandoFecha";
    return true;
  }

  if (context.estado === "EsperandoFecha") {
    // Validar el formato de la fecha
    if (!isValidDate(userMessage)) {
      await sendWhatsAppMessage(from, "El formato de la fecha es incorrecto. Por favor, usa el formato DD/MM/AAAA.");
      return true;
    }
    // Verificar la disponibilidad de la fecha
    if (!checkAvailability(userMessage)) {
      await sendWhatsAppMessage(from, "Lo siento, la fecha seleccionada no está disponible. Por favor, elige otra fecha o contáctanos para más detalles.");
      context.estado = "Finalizado";
      return true;
    }
    // Fecha válida y disponible; se guarda y se pregunta por la ubicación
    context.fecha = userMessage;
    await sendWhatsAppMessage(from, "¡Genial! La fecha está disponible. Ahora, ¿podrías indicarnos en dónde se realizará tu evento?");
    context.estado = "EsperandoLugar";
    return true;
  }

  if (context.estado === "EsperandoLugar") {
    // Guardar la ubicación y concluir el flujo
    context.lugar = userMessage;
    await sendWhatsAppMessage(from, "¡Perfecto! Hemos registrado la fecha y el lugar de tu evento. Un agente se pondrá en contacto contigo para afinar los detalles. ¡Gracias por elegir Camicam Photobooth!");
    context.estado = "Finalizado";
    return true;
  }

  // Nueva rama: si el mensaje menciona "letras gigantes" y aún no se ha solicitado la cantidad
  if (!["Contacto Inicial", "EsperandoTipoEvento", "OpcionesSeleccionadas", "EsperandoFecha", "EsperandoLugar", "EsperandoCantidadLetras"].includes(context.estado)) {
    if (messageLower.includes("letras gigantes")) {
      await sendWhatsAppMessage(from, "¿Cuántas letras ocupas?");
      context.estado = "EsperandoCantidadLetras";
      return true;
    }
  }

  // Procesar respuesta en estado de "EsperandoCantidadLetras"
  if (context.estado === "EsperandoCantidadLetras") {
    // Extraer solo las letras del mensaje (ignorando espacios y símbolos)
    const soloLetras = userMessage.replace(/[^a-zA-Z]/g, '');
    const cantidad = soloLetras.length;
    if (cantidad === 0) {
      await sendWhatsAppMessage(from, "No pude identificar ninguna letra en tu respuesta. Por favor, indícame el nombre o cuántas letras necesitas.");
      return true;
    }
    const precioTotal = cantidad * 400;
    await sendWhatsAppMessage(from, `El precio para ${cantidad} letra(s) es $${precioTotal}.`);
    context.estado = "Finalizado";
    return true;
  }

  // Si ya pasó el flujo inicial, continuar con el resto del manejo (por ejemplo, integración con OpenAI)
  try {
    // Configuramos el caché para respuestas de OpenAI (1 hora de TTL)
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
          const adminMessage = `El cliente ${from} preguntó: "${userMessage}" y la respuesta fue: "${answer}". Se requiere intervención humana para proporcionar más detalles.`;
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
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error.");
    return false;
  }
}

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});

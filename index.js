

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
      { role: "system", content: "Eres un agente de ventas de servicios para eventos que responde de forma profesional y concisa. Nuestros Servicios son: Cabina de fotos, cabina 360, carrito de shots, puede ser con alcohol o sin alcohol" },
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




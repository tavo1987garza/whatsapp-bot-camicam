

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
  // ✅ Validación de credenciales antes de ejecutar
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      console.error("❌ ERROR: Credenciales de WhatsApp no configuradas correctamente.");
      return;
  }

  // ✅ Validación de parámetros antes de continuar
  if (!to || !body || !buttons || buttons.length === 0) {
      console.error("❌ ERROR: El número de destino, el mensaje y los botones son obligatorios.");
      return;
  }

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


// 📌 Función para manejar preguntas frecuentes
async function handleFAQs(from, userMessage) {
  const faqAnswer = findFAQ(userMessage);
  if (faqAnswer) {
    await sendWhatsAppMessage(from, faqAnswer);
    return true; // Si encuentra una respuesta, la envía
  }
  return false; // Si no encontró respuesta en las FAQ
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

// 🟢 Intentar con las preguntas frecuentes
if (await handleFAQs(from, userMessage)) {
  return true;  // Si la pregunta está en las FAQ, se termina el proceso
}

// 🟢 Si no está en las FAQ, intentar con OpenAI
const aiResponse = await getOpenAIResponse(userMessage);

if (aiResponse && aiResponse.trim() !== '') {
  console.log("Respuesta de OpenAI:", aiResponse);
  await sendWhatsAppMessage(from, aiResponse);
  return true;
} else {
  // 🟢 Si OpenAI no puede responder, enviar mensaje al administrador
  console.log("OpenAI no pudo generar una respuesta adecuada. Contactando al administrador.");
  const adminPhone = '528133971595';  // Número del administrador
  const adminMessage = `Nuevo mensaje no reconocido de ${from}: ${userMessage}\n\nPor favor, interven con el cliente.`;

  // Enviar mensaje al administrador para intervención
  await sendWhatsAppMessage(adminPhone, adminMessage);
  await sendWhatsAppMessage(from, 'Lo siento, no puedo responder a tu pregunta en este momento. Un miembro de nuestro equipo te atenderá pronto.');
  return true;
}

} catch (error) {
console.error("Error en handleUserMessage:", error.message);
await sendWhatsAppMessage(from, "Lo siento, ocurrió un error.");
return false;
}
}

// Función para obtener respuesta de OpenAI
async function getOpenAIResponse(userMessage) {
try {
const response = await openai.completions.create({
  model: 'text-davinci-003',  // O el modelo más apropiado que estés utilizando
  prompt: userMessage,
  max_tokens: 100,
  temperature: 0.7,
});



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

    } catch (error) {
      if (error.response) {
          const status = error.response.status;
          console.error(`❌ Error en la respuesta de WhatsApp (${status}):`, error.response.data);
      } else if (error.request) {
          console.error("❌ No se recibió respuesta de WhatsApp. Verifica la conexión.");
      } else {
          console.error("❌ Error en la solicitud:", error.message);
      }
  }
  
}





// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});



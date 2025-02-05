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
  console.log('📩 Webhook activado:', JSON.stringify(req.body, null, 2));

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  const userMessage = message?.text?.body || '';
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
            { id: 'faq_flete', title: '🚛 Cuánto cobran de flete?', description: 'Depende de la ubicación. Pregunta para cotizar.' }
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


//////////////////////////////////////////////////////////////////////


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
        // 🟢 Flujos predefinidos (eventos, paquetes, etc.)
        if (messageLower.includes('info') || messageLower.includes('costos') || messageLower.includes('hola') || 
        messageLower.includes('precio') || messageLower.includes('información')) {

      await sendInteractiveMessage(from, 'Hola 👋 gracias por contactarnos, te damos la bienvenida a *Camicam Photobooth* 😃\n\nPor favor, indícame qué tipo de evento tienes 📋', [
        { id: 'evento_xv', title: '🎉 XV Años' },
        { id: 'evento_boda', title: '💍 Boda' },
        { id: 'evento_otro', title: '🎊 Otro Evento' }
      ]);
      return true;
    }

//// SELECCIÓN MIS XV
else if (messageLower === 'evento_xv') {
  await sendWhatsAppMessage(from, 'En *Camicam Photobooth* estamos comprometidos para que tu evento luzca hermoso😍\n\nTe presentamos todos los servicios que ofrecemos 🎉\n\n' +
    '🔸Cabina de fotos\n' +
    '🔸Cabina 360\n' +
    '🔸Letras Gigantes\n' +
    '🔸Carrito de shots Con Alcohol\n' +
    '🔸Carrito de shots Sin Alcohol\n' +
    '🔸Lluvia de Mariposas\n' +
    '🔸Lluvia Metálica\n' +
    '🔸Chisperos de Mano\n' +
    '🔸Chisperos de Piso\n' +
    '🔸Scrapbook\n' +
    '🔸Niebla de Piso\n' +
    '🔸Audio Guest Book\n\n' +
    'Arma tu paquete con todo lo que necesites!!\n\nO si prefieres revisa nuestro paquete recomendado');

  await sendInteractiveMessage(from, 'Te recomendamos el\n *"Paquete Mis XV"*\n\n¿Cómo te gustaría continuar?', [
    { id: 'armar_paquete', title: '🛠 Armar mi paquete' }, 
    { id: 'ver_paquete_xv', title: '🎉 Ver Paquete Mis XV' }
  ]);
  return true;
}

//// SELECCIÓN WEDDING
else if (messageLower === 'evento_boda') {
  await sendWhatsAppMessage(from, 'En *Camicam Photobooth* estamos comprometidos para que tu evento luzca hermoso😍\n\nTe presentamos todos los servicios que ofrecemos 🎉\n\n' +
    '🔸Cabina de fotos\n' +
    '🔸Cabina 360\n' +
    '🔸Letras Gigantes\n' +
    '🔸Carrito de shots Con Alcohol\n' +
    '🔸Carrito de shots Sin Alcohol\n' +
    '🔸Lluvia de Mariposas\n' +
    '🔸Lluvia Metálica\n' +
    '🔸Chisperos de Mano\n' +
    '🔸Chisperos de Piso\n' +
    '🔸Scrapbook\n' +
    '🔸Niebla de Piso\n' +
    '🔸Audio Guest Book\n\n' +
    'Arma tu paquete con todo lo que necesites!!\n\nO si prefieres revisa nuestro paquete recomendado');

  await sendInteractiveMessage(from, '💍 Para Bodas, te recomendamos el\n*Paquete WEDDING*.\n\n¿Cómo te gustaría continuar?', [
    { id: 'armar_paquete', title: '🛠 Armar mi paquete' }, // Botón reutilizado
    { id: 'ver_paquete_wedding', title: '🎊 Ver Paq. WEDDING' }
  ]);
  return true;
}

//// SELECCIÓN PARTY
else if (messageLower === 'evento_otro') {
  await sendWhatsAppMessage(from, 'En *Camicam Photobooth* estamos comprometidos para que tu evento luzca hermoso😍\n\nTe presentamos todos los servicios que ofrecemos 🎉\n\n' +
    '🔸Cabina de fotos\n' +
    '🔸Cabina 360\n' +
    '🔸Letras Gigantes\n' +
    '🔸Carrito de shots Con Alcohol\n' +
    '🔸Carrito de shots Sin Alcohol\n' +
    '🔸Lluvia de Mariposas\n' +
    '🔸Lluvia Metálica\n' +
    '🔸Chisperos de Mano\n' +
    '🔸Chisperos de Piso\n' +
    '🔸Scrapbook\n' +
    '🔸Niebla de Piso\n' +
    '🔸Audio Guest Book\n\n' +
    'Arma tu paquete con todo lo que necesites!!\n\nO si prefieres revisa nuestro paquete recomendado');

  await sendInteractiveMessage(from, '🎊 Para otros eventos, te recomendamos el\n*Paquete Party*.\n\n¿Cómo te gustaría continuar?', [
    { id: 'armar_paquete', title: '🛠 Armar mi paquete' }, 
    { id: 'ver_paquete_party', title: '🎊 Ver Paquete Party' }
  ]);
  return true;
}

 // 🟢 Respuestas a los botones

 else if (messageLower === 'ver_paquete_xv') {
  await sendImageMessage(from, 'http://cami-cam.com/wp-content/uploads/2023/10/PAQUETE-MIS-XV-2.jpg');
  await sendInteractiveMessage(from, '🎉 PAQUETE MIS XV 🎊\n\n' +
    '*Incluye*\n\n' +
    '✅ Cabina de Fotos (3 Horas)\n' +
    '✅ Lluvia de mariposas\n' +
    '✅ 6 Letras Gigantes (5 Horas)\n' +
    '✅ 2 Chisperos\n\n' +
    '💰 Precio Regular: $11,200\n' +
    '💰 Descuento 50% OFF\n*TOTAL A PAGAR: $5,600*\n\n' +
    'Bono Exclusivo hasta el 28 de Febrero 2025:\n' + 
    '✅ Scrapbook para la cabina de fotos completamente GRATIS 🎁\n\n' +
    '📅 ¿Quieres reservar este paquete? \n¿O prefieres armar el tuyo?',[
  
      { id: 'reservar_paquete_xv', title: '📅 Reservar ' },
      { id: 'armar_paquete', title: '🛠 Armar mi paquete' }
    ]);
}

else if (messageLower === 'reservar_paquete_xv') {
  await sendWhatsAppMessage(from, '📅 ¡Genial! Para reservar el *Paquete Mis XV*, Por favor dime la fecha de tu evento.');
} 
// 🟢 Validar si el usuario quiere "Armar mi paquete"
else if (messageLower === 'armar_paquete') {  
  await sendWhatsAppMessage (from, '🔗 Para armar tu paquete personalizado, visita nuestro cotizador en el siguiente enlace:\n🌐 www.cami-cam.com/cotizador/');
  
 }

else if (messageLower === 'ver_paquete_wedding') {
  await sendImageMessage(from, 'http://cami-cam.com/wp-content/uploads/2023/10/PAQUETE-WEDDING.jpg', '💍 PAQUETE WEDDING 🎊');
  await sendWhatsAppMessage(from, '💍 *PAQUETE WEDDING* 🎊\n' +
    '✅ Cabina 360 + Carrito de Shots\n' +
    '🔠 4 Letras Gigantes\n' +
    '✨ 2 Chisperos\n' +
    '💰 *Precio regular:* $8,900\n' +
    '🔥 *Descuento 50% OFF*: **Total: $4,450**\n\n' +
    '📅 ¿Para qué fecha necesitas el servicio?');
} 
else if (messageLower === 'ver_paquete_party') {
  await sendImageMessage(from, 'http://cami-cam.com/wp-content/uploads/2023/10/PAQUETE-PARTY.jpg', '🎊 PAQUETE PARTY 🎉');
  await sendWhatsAppMessage(from, '🎊 *PAQUETE PARTY* 🎉\n' +
    '✅ Cabina de Fotos\n' +
    '🔠 4 Letras Gigantes\n' +
    '💰 *Precio:* $3,000\n\n' +
    '📅 ¿Para qué fecha necesitas el servicio?');

} 

// 🟢 Reservar paquete
if (messageLower === 'reservar_paquete_xv') {
  await sendWhatsAppMessage(from, '📅 ¡Genial! Para reservar el *Paquete Mis XV*, por favor dime la fecha de tu evento.');
  return true;
}

return false; // Si el mensaje no fue manejado por esta función, devuelve false

  } catch (error) {
    console.error("❌ Error en handleUserMessage:", error.message);
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error.");
    return false;
  }
}


////////////////////////////////////////////////////////////////////



// 📌 Función para enviar mensajes de texto
async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
  };

  await axios.post(url, data, {
      headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
      }
  });
}






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


// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});

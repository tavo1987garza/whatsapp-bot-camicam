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
  console.log('📩 Webhook activado:', JSON.stringify(req.body, null, 2));

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  const userMessage = message?.text?.body || '';
  const buttonReply = message?.interactive?.button_reply?.id || '';

  await handleUserMessage(from, userMessage, buttonReply);

  res.sendStatus(200);
});

// 📌 Función para enviar mensajes interactivos con botones
async function sendInteractiveMessage(to, body, buttons) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: 'whatsapp',
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


//Preguntas frecuentes
const faqs = [
  {
    question: /(horario|atencion|abierto|cierra)/i,
    answer: 'Nuestro horario de atención es de lunes a viernes de 9:00 AM a 6:00 PM, y sábados de 10:00 AM a 2:00 PM.'
  },
  {
    question: /(envio|domicilio|transport)/i,
    answer: 'Sí, realizamos envíos a domicilio en un radio de 50 km sin costo adicional. Para distancias mayores, aplica un cargo extra.'
  },
  {
    question: /(pago|metodo|tarjeta|efectivo)/i,
    answer: 'Aceptamos tarjetas de crédito/débito, transferencias bancarias y pagos en efectivo.'
  }
];

function findFAQ(userMessage) {
  for (const faq of faqs) {
    if (faq.question.test(userMessage)) {
      return faq.answer;
    }
  }
  return null;
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
    // Verificar si el mensaje coincide con una pregunta frecuente
    const faqAnswer = findFAQ(userMessage);
    if (faqAnswer) {
      await sendWhatsAppMessage(from, faqAnswer);
      return;
    }

    // Menú de preguntas frecuentes
    if (messageLower === 'faq' || messageLower.includes('preguntas frecuentes')) {
      await sendInteractiveMessage(from, 'Estas son algunas preguntas frecuentes. Selecciona una para obtener más información:', [
        { id: 'faq_horario', title: '🕒 Horario de atención' },
        { id: 'faq_envios', title: '🚚 Envíos a domicilio' },
        { id: 'faq_pagos', title: '💳 Métodos de pago' }
      ]);
      return;
    }

    // Respuestas a las FAQ seleccionadas
    if (messageLower === 'faq_horario') {
      await sendWhatsAppMessage(from, 'Nuestro horario de atención es de lunes a viernes de 9:00 AM a 6:00 PM, y sábados de 10:00 AM a 2:00 PM.');
      return;
    }

    if (messageLower === 'faq_envios') {
      await sendWhatsAppMessage(from, 'Sí, realizamos envíos a domicilio en un radio de 50 km sin costo adicional. Para distancias mayores, aplica un cargo extra.');
      return;
    }

    if (messageLower === 'faq_pagos') {
      await sendWhatsAppMessage(from, 'Aceptamos tarjetas de crédito/débito, transferencias bancarias y pagos en efectivo.');
      return;
    }

    // Flujo de eventos
    if (context.estado === "inicio") {
      await sendInteractiveMessage(from, 'Hola 👋 gracias por contactarnos. ¿Qué tipo de evento tienes? 📋', [
        { id: 'evento_xv', title: '🎉 XV Años' },
        { id: 'evento_boda', title: '💍 Boda' },
        { id: 'evento_otro', title: '🎊 Otro Evento' }
      ]);
      context.estado = "esperando_tipo_evento";
      return;
    }

    if (context.estado === "esperando_tipo_evento") {
      if (messageLower === 'evento_xv' || messageLower === 'evento_boda' || messageLower === 'evento_otro') {
        context.tipoEvento = messageLower.replace('evento_', ''); // Guardar el tipo de evento
        await sendWhatsAppMessage(from, `Perfecto, tu evento es una ${context.tipoEvento}. ¿Cuál es la fecha de tu evento?`);
        context.estado = "esperando_fecha";
        return;
      }
    }

    if (context.estado === "esperando_fecha") {
      context.fecha = userMessage; // Guardar la fecha del evento
      await sendWhatsAppMessage(from, `¡Genial! Tu evento es una ${context.tipoEvento} el ${context.fecha}. ¿Te gustaría recibir una cotización?`);
      context.estado = "esperando_cotizacion";
      return;
    }

    if (context.estado === "esperando_cotizacion") {
      if (messageLower.includes('sí') || messageLower.includes('si') || messageLower.includes('cotización')) {
        await sendInteractiveMessage(from, 'Por favor, selecciona los servicios que deseas incluir en tu paquete:', [
          { id: 'cabina_fotos', title: 'Cabina de Fotos ($2000)' },
          { id: 'cabina_360', title: 'Cabina 360 ($3000)' },
          { id: 'letras_gigantes', title: 'Letras Gigantes ($1500)' },
          { id: 'carrito_shots_alcohol', title: 'Carrito de Shots con Alcohol ($2500)' },
          { id: 'carrito_shots_sin_alcohol', title: 'Carrito de Shots sin Alcohol ($2000)' },
          { id: 'lluvia_mariposas', title: 'Lluvia de Mariposas ($1000)' },
          { id: 'lluvia_metálica', title: 'Lluvia Metálica ($1200)' },
          { id: 'chisperos_mano', title: 'Chisperos de Mano ($800)' },
          { id: 'chisperos_piso', title: 'Chisperos de Piso ($1000)' },
          { id: 'scrapbook', title: 'Scrapbook ($500)' },
          { id: 'niebla_piso', title: 'Niebla de Piso ($600)' },
          { id: 'audio_guest_book', title: 'Audio Guest Book ($700)' }
        ]);
        context.estado = "seleccionando_servicios";
        return;
      }
    }

    if (context.estado === "seleccionando_servicios") {
      if (preciosServicios[messageLower]) {
        context.serviciosSeleccionados.push(messageLower);
        context.total += preciosServicios[messageLower];
        await sendWhatsAppMessage(from, `Servicio "${messageLower}" agregado. ¿Deseas agregar otro servicio?`);
        return;
      }

      if (messageLower.includes('no') || messageLower.includes('finalizar')) {
        await sendWhatsAppMessage(from, `Perfecto, aquí está tu cotización:\n\n` +
          `Servicios seleccionados:\n` +
          `${context.serviciosSeleccionados.join('\n')}\n\n` +
          `Total: $${context.total}\n\n` +
          `¿Te gustaría reservar este paquete?`);
        context.estado = "finalizado";
        return;
      }
    }

    // Si no coincide con nada, usar OpenAI o respuesta predeterminada
    const completion = await openai.chat.completions.create({
      model: "gpt-4", // O "gpt-3.5-turbo" si prefieres menor costo
      messages: [
        { role: "system", content: "Eres un asistente amigable de una empresa de renta de photobooth para eventos. Responde preguntas sobre servicios, precios y disponibilidad." },
        { role: "user", content: userMessage }
      ],
      max_tokens: 100
    });

    const responseText = completion.choices[0]?.message?.content || "Lo siento, no entendí bien tu mensaje. ¿Puedes reformularlo?";
    await sendWhatsAppMessage(from, responseText);

  } catch (error) {
    console.error("❌ Error al manejar el mensaje:", error.message);
    await sendWhatsAppMessage(from, "Lo siento, ocurrió un error al procesar tu solicitud. Inténtalo nuevamente.");
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

// 📌 Función para enviar imágenes
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

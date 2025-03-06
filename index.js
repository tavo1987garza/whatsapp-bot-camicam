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

  console.log(`📩 Mensaje recibido de ${from}: ${userMessage}`);

  try {
    const handled = await handleUserMessage(from, userMessage);
    if (handled) return res.sendStatus(200);

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
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
    console.error("❌ ERROR: Credenciales de WhatsApp no configuradas correctamente.");
    return;
  }

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

  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Mensaje interactivo enviado:', response.data);
  } catch (error) {
    console.error('❌ Error al enviar mensaje interactivo:', error.response?.data || error.message);
  }
}

// 📌 Función para enviar mensajes de texto
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
  } catch (error) {
    if (error.response) {
      console.error(`❌ Error en la respuesta de WhatsApp (${error.response.status}):`, error.response.data);
    } else if (error.request) {
      console.error("❌ No se recibió respuesta de WhatsApp. Verifica la conexión.");
    } else {
      console.error("❌ Error en la solicitud:", error.message);
    }
  }
}

// 📌 Función para manejar los mensajes del usuario
async function handleUserMessage(from, userMessage) {
  const messageLower = userMessage.toLowerCase();

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

    // 🟢 Intentar con las preguntas frecuentes
    if (await handleFAQs(from, userMessage)) {
      return true;
    }

    // 🟢 Si no está en las FAQ, intentar con OpenAI
    const aiResponse = await getOpenAIResponse(userMessage);

    if (aiResponse && aiResponse.trim() !== '') {
      console.log("Respuesta de OpenAI:", aiResponse);
      await sendWhatsAppMessage(from, aiResponse);
      return true;
    } else {
      console.log("OpenAI no pudo generar una respuesta adecuada. Contactando al administrador.");
      const adminPhone = '528133971595';
      const adminMessage = `Nuevo mensaje no reconocido de ${from}: ${userMessage}\n\nPor favor, interven con el cliente.`;

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

// 📌 Función para obtener respuesta de OpenAI
async function getOpenAIResponse(userMessage) {
  try {
    const response = await openai.completions.create({
      model: 'text-davinci-003',
      prompt: userMessage,
      max_tokens: 100,
      temperature: 0.7,
    });

    return response.choices[0].text.trim();
  } catch (error) {
    console.error("❌ Error al obtener respuesta de OpenAI:", error.message);
    return null;
  }
}

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});
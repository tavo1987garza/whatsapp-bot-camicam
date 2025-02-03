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

// Información de tu negocio
const businessInfo = {
  services: {
    xv: ["Cabina de Fotos", "Cabina 360", "Letras gigantes", "Niebla de Piso", "Lluvia de Mariposas", "Chisperos de Piso", "Scrapbook"],
    boda: ["Cabina 360", "Carrito de Shots CON alcohol", "Letras Gigantes", "Niebla de Piso", "Lluvia Metálica", "Chisperos de Piso", "Audio Guest Book"],
    otro: ["Cabina de Fotos", "Cabina 360", "Letras Gigantes", "Chisperos de Piso", "Niebla de Piso"],
  },
  packages: {
    xv: "📸 Cabina de Fotos, 6 Letras Gigantes, Lluvia de Mariposas o Niebla de Piso, y 2 Chisperos por $5,600 + flete.",
    boda: "📸 Cabina 360, Carrito de Shots, 4 Letras Gigantes, y 2 Chisperos por $4,450 con descuento.",
    otro: "📸 Cabina de Fotos y 4 Letras Gigantes por $3,000.",
  }
};

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

// Webhook para manejar mensajes entrantes de WhatsApp
app.post('/webhook', async (req, res) => {
  console.log('Webhook activado:', JSON.stringify(req.body, null, 2));

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  const userMessage = message?.text?.body.toLowerCase() || '';

  try {
    if (["hola", "info", "precio", "información", "empezar"].some((word) => userMessage.includes(word))) {
      await sendWhatsAppButtons(from);
    } else if (userMessage.includes('xv') || userMessage.includes('boda') || userMessage.includes('evento')) {
      const tipoEvento = userMessage.includes("xv") ? "xv" : userMessage.includes("boda") ? "boda" : "otro";
      await sendWhatsAppMessage(from, `✨ Estos son nuestros servicios para *${tipoEvento.toUpperCase()}*:\n- ${businessInfo.services[tipoEvento].join('\n- ')}`);
      await sendWhatsAppMessage(from, "¿Quieres armar tu paquete o prefieres un paquete recomendado?", ["Armar mi paquete", "Paquete recomendado"]);
    } else if (userMessage.includes("paquete recomendado")) {
      const tipoEvento = userMessage.includes("xv") ? "xv" : userMessage.includes("boda") ? "boda" : "otro";
      await sendWhatsAppMessage(from, businessInfo.packages[tipoEvento]);
      await sendWhatsAppMessage(from, "¿Quieres agregar algún servicio extra?", ["Sí", "No"]);
    } else if (userMessage.includes("armar")) {
      await sendWhatsAppMessage(from, "¡Genial! Envíame los servicios que quieres incluir y te armaré una cotización personalizada.");
    } else if (userMessage.includes("sí")) {
      const sections = [
        {
          title: "Servicios Adicionales",
          rows: [
            { id: "extra_fotos", title: "📸 Sesión de Fotos Extra", description: "15 min adicionales de fotos" },
            { id: "extra_letras", title: "🔠 Más Letras Gigantes", description: "Agrega letras personalizadas" },
            { id: "extra_shots", title: "🍹 Más Shots", description: "Añade más bebidas para tus invitados" },
            { id: "extra_scrapbook", title: "📖 Scrapbook", description: "Álbum de fotos personalizado del evento" },
            { id: "extra_chisperos", title: "✨ Chisperos Adicionales", description: "Más efectos de chisperos" }
          ]
        }
      ];
    
      await sendWhatsAppList(from, "Servicios Extra 🎁", "Elige un servicio adicional para mejorar tu paquete:", "Seleccionar", sections);
    } else if (userMessage.includes("no")) {
      await sendWhatsAppMessage(from, "🎉 Tu cotización está lista. ¿Quieres recibirla en PDF o prefieres agendar una llamada?", ["Recibir PDF", "Agendar llamada"]);
    } else {
      await sendWhatsAppMessage(from, "No entendí tu mensaje. ¿Podrías intentar de nuevo?");
    }
  } catch (error) {
    console.error('Error en el procesamiento del mensaje:', error.message);
    await sendWhatsAppMessage(from, 'Lo siento, hubo un problema técnico. Por favor, intenta nuevamente más tarde.');
  }

  res.sendStatus(200);
});

// Función para enviar mensajes a través de la API de WhatsApp
async function sendWhatsAppMessage(to, message, buttons = []) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: buttons.length ? 'interactive' : 'text',
    text: buttons.length ? undefined : { body: message },
    interactive: buttons.length ? {
      type: 'button',
      body: { text: message },
      action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.toLowerCase(), title: b } })) },
    } : undefined,
  };

  try {
    await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error al enviar mensaje a WhatsApp:', error.response?.data || error.message);
  }
}

// Función para enviar botones de inicio
async function sendWhatsAppButtons(to) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '🎉 ¡Bienvenido a *Camicam Photobooth*! ¿Para qué tipo de evento buscas nuestros servicios?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'xv_event', title: '🎉 XV Años' } },
          { type: 'reply', reply: { id: 'wedding_event', title: '💍 Boda' } },
          { type: 'reply', reply: { id: 'other_event', title: '🎊 Otro Evento' } },
        ],
      },
    },
  };

  try {
    await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error al enviar botones a WhatsApp:', error.response?.data || error.message);
  }
}

//FUNCION PARA LISTAS INTERACTIVAS
async function sendWhatsAppList(to, header, body, buttonText, sections) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      header: { type: 'text', text: header },
      footer: { text: 'Selecciona una opción para continuar' },
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
    await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error al enviar lista interactiva a WhatsApp:', error.response?.data || error.message);
  }
}

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});

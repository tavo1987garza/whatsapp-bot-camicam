// codigo CAMIBOT conectado y funcionando 
//con Chat OpenAI contestando como asistente de Camicam Photobooth
// 29 de enero 2025   19: hrs
// v7.0

// Importar dependencias en modo ES Modules
import dotenv from 'dotenv';
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

// Verificar conexión con OpenAI
(async () => {
  try {
    const models = await openai.models.list();
    console.log('Conectado a OpenAI correctamente.');
  } catch (error) {
    console.error('Error en la conexión con OpenAI:', error.message);
  }
})();

// Ruta raíz
app.get('/', (req, res) => {
  res.send('¡Servidor funcionando correctamente!');
});

// Middleware para JSON
app.use(bodyParser.json());

// Verificación inicial del webhook
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Función para enviar mensajes a WhatsApp
async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: message },
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

// Función para enviar botones interactivos
async function sendWhatsAppButtons(to) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: 'Con gusto Por favor indicame qué tipo de evento estás organizando?' },
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

// Webhook para mensajes entrantes
app.post('/webhook', async (req, res) => {
  console.log('Webhook activado:', JSON.stringify(req.body, null, 2));

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) {
    return res.sendStatus(200);
  }

  const from = message.from;
  const userMessage = message?.text?.body?.toLowerCase() || '';

  console.log(`Mensaje recibido de ${from}: ${userMessage}`);

  try {
    // Flujo de conversación estructurado
    if (userMessage.includes('info') || userMessage.includes('precio') || userMessage.includes('paquete')) {
      await sendWhatsAppButtons(from);
    } else if (userMessage.includes('xv')) {
      await sendWhatsAppMessage(from, '📸 Paquete Mis XV: Incluye cabina de fotos, niebla de piso, 6 letras gigantes y 2 chisperos por $5,600 + flete.');
    } else if (userMessage.includes('boda')) {
      await sendWhatsAppMessage(from, '💍 Paquete Wedding: Incluye cabina 360, carrito de shots, 4 letras gigantes y 2 chisperos por solo $4,450.');
    } else if (userMessage.includes('evento')) {
      await sendWhatsAppMessage(from, '🎊 Paquete Party: Cabina de fotos y 4 letras gigantes por $3,000.');
    }
   
    else {
      // Genera respuesta con OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Eres "Camibot" un vendedor virtual de *Camicam Photobooth*, un negocio en la colonia independecia en Monterrey atende cualquier evento social y es especialista en bodas y XV años. Llevamos 10 años en el negocio y ofrecemos servicios como renta de cabinas de fotos, cabinas 360, letras gigantes, lluvia de mariposas, chisperos, scrapbook y audio guest book. Responde de manera cálida, profesional y clara, enfocándote en ayudar a los clientes a elegir el mejor paquete para su evento.' },
          { role: 'user', content: userMessage },
        ],
      });

      const botResponse = completion.choices[0]?.message?.content || 'No entendí bien tu mensaje. ¿Podrías darme más detalles?';
      await sendWhatsAppMessage(from, botResponse);
    }
  } catch (error) {
    console.error('Error en el procesamiento del mensaje:', error.message);
    await sendWhatsAppMessage(from, 'Lo siento, hubo un problema técnico. Por favor, intenta nuevamente más tarde.');
  }

  res.sendStatus(200);
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. Usa otro puerto.`);
  } else {
    console.error('Error al iniciar el servidor:', err);
  }
});

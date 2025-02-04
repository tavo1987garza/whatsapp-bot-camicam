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
  const userMessage = message?.text?.body.toLowerCase() || '';
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


//////////////////////////////////////////////////////////////////////


// 📌 Función para manejar los mensajes del usuario
async function handleUserMessage(from, userMessage, buttonReply) {
  try {
    let responseText = '';
    const messageLower = buttonReply ? buttonReply.toLowerCase() : userMessage.toLowerCase(); // Ahora también considera botones

    if (["info", "costos", "hola", "precio", "información"].some(word => messageLower.includes(word))) {
      await sendInteractiveMessage(from, 'Hola 👋 Gracias por contactarnos\n\nTe damos la bienvenida a *Camicam Photobooth*! 😃\n\nSelecciona porfavor qué tipo de evento tienes', [
        { id: 'evento_xv', title: '🎉 XV Años' },
        { id: 'evento_boda', title: '💍 Boda' },
        { id: 'evento_otro', title: '🎊 Otro Evento' }
      ]);
    } 
    
    else if (messageLower === 'evento_xv') {
      await sendWhatsAppMessage(from, 'En *Camicam Photobooth* estamos comprometidos para que tu evento luzca hermoso😍\n\nTe presentamos todos los servicios que ofrecemos 🎉\n\n'+
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
        '¿Te gustaría armar tu propio paquete?\n\n¿O prefieres nuestro paquete recomendado?'
      );
      await sendInteractiveMessage(from, 'Te recomendamos el\n *"Paquete Mis XV"*\n\n¿Cómo te gustaría continuar?', [
        { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
        { id: 'ver_paquete_xv', title: '🎉 Ver Paquete Mis XV' }
      ]);
    } 
    
    else if (messageLower === 'ver_paquete_xv') {
      await sendImageMessage(from, 'http://cami-cam.com/wp-content/uploads/2023/10/PAQUETE-MIS-XV-2.jpg');
      await sendInteractiveMessage(from, '🎉 PAQUETE MIS XV 🎊\n\n💰 Precio Regular: $11,200\n💰 Descuento 50% OFF\n*TOTAL A PAGAR: $5,600*', [
        { id: 'reservar_paquete_xv', title: '📅 Reservar ' },
        { id: 'armar_paquete', title: '🛠 Armar mi paquete' }
      ]);
    } 
    
    else if (messageLower === 'reservar_paquete_xv') {
      await sendWhatsAppMessage(from, '📅 ¡Genial! Para reservar el *Paquete Mis XV*, dime la fecha de tu evento.');
    } 
    
    // 🟢 Validar si el usuario quiere "Armar mi paquete"
    else if (messageLower === 'armar_paquete') {  
       await sendWhatsAppMessage (from, '🔗 Para armar tu paquete personalizado, visita nuestro cotizador en el siguiente enlace:\n🌐 www.cami-cam.com/cotizador/');
       await sendWhatsAppVideo(from, 'http://cami-cam.com/wp-content/uploads/2023/11/cabina-360-y-Letras.mp4', '📹 Cómo usar el cotizador de Camicam Photobooth');    
      }
    

    else {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "system", content: "Eres un asistente amigable de una empresa de renta de photobooth para eventos." },
                     { role: "user", content: userMessage }],
          max_tokens: 100
        });
        responseText = completion.choices[0]?.message?.content || "Lo siento, no entendí bien tu mensaje.";
      } catch (error) {
        console.error("❌ Error al consultar OpenAI:", error.message);
        responseText = "Lo siento, ocurrió un error al procesar tu solicitud.";
      }
      await sendWhatsAppMessage(from, responseText);
    }

  } catch (error) {
    console.error(`Error en handleUserMessage: ${error.message}`);
    await sendWhatsAppMessage(from, "Ocurrió un error, por favor intenta más tarde.");
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

// 📌 Función para enviar listas interactivas
async function sendWhatsAppList(to, header, body, buttonText, sections) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'interactive',
      interactive: {
          type: 'list',
          header: { type: 'text', text: header },
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

  await axios.post(url, data, {
      headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
      }
  });
}

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});

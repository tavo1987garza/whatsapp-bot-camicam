// codigo CAMIBOT conectado y funcionando 
//con botones e IA
// 29 de enero 2025   17:40 hrs
// v9.0

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

// Verificar la conexión con OpenAI
(async () => {
  try {
    const models = await openai.models.list(); // Obtener lista de modelos
    console.log(models); // Imprimir la lista de modelos
  } catch (error) {
    console.error('Error al comunicarse con la API de OpenAI:', error.message);
  }
})();

// Ruta para la raíz
app.get('/', async (req, res) => {
  res.send('¡Servidor funcionando correctamente!');
  console.log("Ruta '/' accedida correctamente.");
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

// Función para enviar mensajes a través de la API de WhatsApp
async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: message },
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Mensaje enviado a WhatsApp:', response.data);
  } catch (error)  {
    if (error.response?.data?.error?.code === 190) {
      console.error('Error: Token de acceso expirado. Por favor, renueva el token.');
    } else {
      console.error('Error al enviar mensaje a WhatsApp:', error.response?.data || error.message);
    }
  }
}

// 📌 NUEVA Función para enviar mensajes interactivos con botones
async function sendInteractiveMessage(to, message, buttons) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: message },
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

// 📌 Función para manejar los mensajes del usuario
async function handleUserMessage(from, userMessage) {
    let responseText = '';
  
    // Normalizar el mensaje a minúsculas para comparación
    const messageLower = userMessage.toLowerCase();
  
    // 🟢 Flujos predefinidos (eventos, paquetes, etc.)
    if (messageLower.includes('info') || messageLower.includes('costos') || messageLower.includes('hola') || 
      messageLower.includes('precio') || messageLower.includes('información')) {
  
      await sendInteractiveMessage(from, 'Hola 👋 gracias por contactarnos, te damos la bienvenida a *Camicam Photobooth* 😃\n\nPor favor, indícame qué tipo de evento tienes 📋', [
        { id: 'evento_xv', title: '🎉 XV Años' },
        { id: 'evento_boda', title: '💍 Boda' },
        { id: 'evento_otro', title: '🎊 Otro Evento' }
      ]);
  
      
  
}
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
    '¿Te gustaría armar tu propio paquete? ¿O prefieres nuestro paquete recomendado?');

  await sendInteractiveMessage(from, 'Te recomendamos el\n *"Paquete Mis XV"*\n\n¿Cómo te gustaría continuar?', [
    { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
    { id: 'ver_paquete_xv', title: '🎉 Ver Paquete Mis XV' }
  ]);
}
else if (messageLower === 'evento_boda') {
  await sendWhatsAppMessage(from, '💍 Para Bodas, te recomendamos el *Paquete Wedding*.');

  await sendInteractiveMessage(from, '¿Cómo te gustaría continuar?', [
    { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
    { id: 'ver_paquete_wedding', title: '💍 Ver Paquete Wedding' }
  ]);
 }
else if (messageLower === 'evento_otro') {
  await sendWhatsAppMessage(from, '🎊 Para otros eventos, te recomendamos el *Paquete Party*.');

  await sendInteractiveMessage(from, '¿Cómo te gustaría continuar?', [
    { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
    { id: 'ver_paquete_party', title: '🎊 Ver Paquete Party' }
  ]);
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
    console.log('✅ El usuario seleccionó "Armar mi paquete"');
  
    // 📌 Enviamos una LISTA INTERACTIVA en lugar de botones separados
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
    const data = {
      messaging_product: 'whatsapp',
      to: from,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: '🛠 Personaliza tu paquete' },
        body: { text: 'Selecciona los servicios que quieres agregar a tu paquete 🎉' },
        action: {
          button: 'Ver opciones',
          sections: [
            {
              title: 'Fotografía y Cabinas 📸',
              rows: [
                { id: 'agregar_cabina', title: 'Cabina de Fotos', description: 'Fotos ilimitadas por 3 horas' },
                { id: 'cabina_360', title: 'Cabina 360', description: 'Videos en cámara lenta para redes sociales' }
              ]
            },
            {
              title: 'Efectos Especiales ✨',
              rows: [
                { id: 'agregar_chisperos', title: 'Chisperos', description: 'Chisperos de piso para momentos mágicos' },
                { id: 'agregar_niebla', title: 'Niebla de Piso', description: 'Efecto de niebla baja para baile' }
              ]
            },
            {
              title: 'Bebidas y Extras 🍹',
              rows: [
                { id: 'agregar_shots', title: 'Carrito de Shots', description: 'Con o sin alcohol según el evento' },
                { id: 'scrapbook', title: 'Scrapbook', description: 'Álbum con recuerdos de la cabina de fotos' }
              ]
            }
          ]
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
      console.log('✅ Lista interactiva enviada:', response.data);
    } catch (error) {
      console.error('❌ Error al enviar lista interactiva:', error.response?.data || error.message);
    }
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
  
    // 🟢 RESPUESTA INTELIGENTE CON OPENAI
    else {
      console.log(`🧠 Enviando mensaje desconocido a OpenAI: ${userMessage}`);
  
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4",  // Puedes usar "gpt-3.5-turbo" si prefieres menor costo
          messages: [{ role: "system", content: "Eres un asistente amigable de una empresa de renta de photobooth para eventos. Responde preguntas sobre servicios, precios y disponibilidad." },
                     { role: "user", content: userMessage }],
          max_tokens: 100
        });
  
        responseText = completion.choices[0]?.message?.content || "Lo siento, no entendí bien tu mensaje. ¿Puedes reformularlo?";
  
      } catch (error) {
        console.error("❌ Error al consultar OpenAI:", error.message);
        responseText = "Lo siento, ocurrió un error al procesar tu solicitud. Inténtalo nuevamente.";
      }
  
      await sendWhatsAppMessage(from, responseText);
    }
  }

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. Prueba con otro puerto.`);
  } else {
    console.error('Error al iniciar el servidor:', err);
  }
});
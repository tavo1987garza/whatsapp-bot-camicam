import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(bodyParser.json());

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

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object && body.entry) {
    const message = body.entry[0].changes[0].value.messages[0];
    if (!message) return res.sendStatus(404);

    const from = message.from;
    const text = message.text?.body.toLowerCase() || '';

    if (["hola", "info", "precio", "información", "empezar"].some((word) => text.includes(word))) {
      await sendWhatsAppMessage(from, "¡Hola! 🎉 Bienvenido a Camicam Photobooth. ¿Para qué tipo de evento buscas nuestros servicios?", ["BODA", "XV AÑOS", "OTRO"]);
    } else if (["boda", "xv", "otro"].some((word) => text.includes(word))) {
      const tipoEvento = text.includes("xv") ? "xv" : text.includes("boda") ? "boda" : "otro";
      await sendWhatsAppMessage(from, `Estos son nuestros servicios para ${tipoEvento.toUpperCase()}:
- ${businessInfo.services[tipoEvento].join('\n- ')}`);
      await sendWhatsAppMessage(from, "¿Quieres armar tu paquete o prefieres un paquete recomendado?", ["Armar mi paquete", "Paquete recomendado"]);
    } else if (text.includes("paquete recomendado")) {
      const tipoEvento = text.includes("xv") ? "xv" : text.includes("boda") ? "boda" : "otro";
      await sendWhatsAppMessage(from, `🎁 Nuestro paquete recomendado para ${tipoEvento.toUpperCase()} es:
${businessInfo.packages[tipoEvento]}`);
      await sendWhatsAppMessage(from, "¿Quieres agregar algún servicio extra?", ["Sí", "No"]);
    } else if (text.includes("armar")) {
      await sendWhatsAppMessage(from, "¡Genial! Envíame los servicios que quieres incluir y te armaré una cotización personalizada.");
    } else if (text.includes("sí")) {
      await sendWhatsAppMessage(from, "Perfecto, dime qué servicios adicionales te interesan.");
    } else if (text.includes("no")) {
      await sendWhatsAppMessage(from, "Listo 🎉 Tu cotización está lista. ¿Quieres recibirla en PDF o prefieres agendar una llamada?", ["Recibir PDF", "Agendar llamada"]);
    } else {
      await sendWhatsAppMessage(from, "No entendí tu mensaje. ¿Puedes intentar de nuevo?");
    }
  }
  res.status(200).send('EVENT_RECEIVED');
});

async function sendWhatsAppMessage(to, message, buttons = []) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: buttons.length ? 'button' : 'text',
      body: { text: message },
      action: buttons.length ? { buttons: buttons.map((b) => ({ type: 'reply', reply: { title: b, id: b.toLowerCase() } })) } : undefined,
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
    console.error('Error al enviar mensaje:', error.response?.data || error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});

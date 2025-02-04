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

// Middleware para manejar JSON
app.use(bodyParser.json());

// 📌 Webhook para verificar la conexión inicial
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

// 📌 Función para manejar los mensajes del usuario
async function handleUserMessage(from, userMessage, buttonReply) {
    let responseText = '';
    const messageLower = buttonReply ? buttonReply.toLowerCase() : userMessage.toLowerCase();

    if (["info", "costos", "hola", "precio", "información"].some(word => messageLower.includes(word))) {
        await sendInteractiveMessage(from, 'Hola 👋 gracias por contactarnos en *Camicam Photobooth*! 😃\n\n¿Qué tipo de evento tienes?', [
            { id: 'evento_xv', title: '🎉 XV Años' },
            { id: 'evento_boda', title: '💍 Boda' },
            { id: 'evento_otro', title: '🎊 Otro Evento' }
        ]);
    } 
    else if (messageLower === 'evento_xv') {
        await sendInteractiveMessage(from, '✨ *Paquete Mis XV* 🎉\n\n' +
            '✅ Cabina de Fotos\n' +
            '✅ Lluvia de Mariposas\n' +
            '✅ 6 Letras Gigantes\n' +
            '✅ 2 Chisperos\n' +
            '💰 *Precio:* $5,600 + flete\n\n' +
            '¿Cómo te gustaría continuar?', [
            { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
            { id: 'ver_paquete_xv', title: '🎉 Ver Paquete Completo' }
        ]);
    } 
    else if (messageLower === 'evento_boda') {
        await sendInteractiveMessage(from, '💍 *Paquete Wedding* 🎊\n\n' +
            '✅ Cabina 360 + Carrito de Shots\n' +
            '✅ 4 Letras Gigantes\n' +
            '✅ 2 Chisperos\n' +
            '💰 *Precio:* $4,450 con descuento\n\n' +
            '¿Cómo te gustaría continuar?', [
            { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
            { id: 'ver_paquete_wedding', title: '💍 Ver Paquete Completo' }
        ]);
    }
    else if (messageLower === 'evento_otro') {
        await sendInteractiveMessage(from, '🎊 *Paquete Party* 🎉\n\n' +
            '✅ Cabina de Fotos\n' +
            '✅ 4 Letras Gigantes\n' +
            '💰 *Precio:* $3,000\n\n' +
            '¿Cómo te gustaría continuar?', [
            { id: 'armar_paquete', title: '🛠 Armar mi paquete' },
            { id: 'ver_paquete_party', title: '🎊 Ver Paquete Completo' }
        ]);
    }
    else if (messageLower === 'armar_paquete') {
        await sendWhatsAppList(from, "🛠 Personaliza tu paquete", "Selecciona los servicios que quieres agregar 🎉", "Ver opciones", [
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
        ]);
    } 
    else {
        responseText = "Lo siento, no entendí bien tu mensaje. ¿Puedes reformularlo?";
        await sendWhatsAppMessage(from, responseText);
    }
}

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

// 📌 Función para enviar botones interactivos
async function sendInteractiveMessage(to, message, buttons) {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: message },
            action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) }
        }
    };

    await axios.post(url, data, {
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        }
    });
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

// 📌 Iniciar servidor
app.listen(PORT, () => console.log(`🚀 Servidor funcionando en http://localhost:${PORT}`));

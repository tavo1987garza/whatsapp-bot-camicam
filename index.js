//codigo CAMIBOT funcionando SIN plantillas de API de Whatsapp
//26 de enero 2025   13:00 hrs
//v2.0

//require('dotenv').config(); // Importa dotenv para cargar variables de entorno

//const express = require('express');
//const bodyParser = require('body-parser');
//const axios = require('axios'); // Importa axios para realizar solicitudes HTTP
//const OpenAI = require('openai'); // Importa la biblioteca de OpenAI

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

// Información de tu negocio
const businessInfo = {
  services: [
    "Cabina de Fotos",
    "Cabina 360",
    "Letras gigantes",
    "Niebla de Piso",
    "Carrito de Shots CON alcohol",
    "Carrito de Shots SIN alcohol",
    "Lluvia de Mariposas",
    "Lluvia Metálica",
    "Chisperos de Piso",
    "Chisperos de Mano",
    "Scrapbook",
    "Audio Guest Book",
  ],
  promotions:
    "Este mes tenemos estamos promocionando el paquete MIS XV que Incluye: Cabina de fotos por 3 Horas, 6 Letras Gigantes, Lluvia de Mariposas ó Niebla de Piso y 2 Chisperos",
  precios:
    "Cabina de Fotos: $3,500, Cabina 360: $3500, Letras gigantes: $3,500, Niebla de Piso: $3,000, Carrito de Shots CON alcohol $2,800, Carrito de Shots SIN alcohol $2,200, Lluvia de Mariposas: $2,700, Lluvia Metálica: $2,000, Chisperos de Piso, Chisperos de Mano, Scrapbook: $1,300, Audio Guest Book: $2,000",
  Dirección: "Estamos en la colonia independencia, en Monterrey N.L",
  Paquetes: [
    "Paquete MIS XV",
    "Paquete WEDDING",
    "Paquete PARTY",
    "Paquete OH BABY",
    "Paquete MARRY ME",
    "Paquete CHISPEROS DE MANO",
    "Paquete XMAS",
  ],
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

// Ruta para manejar eventos de WhatsApp
app.post('/webhook', async (req, res) => {
  const body = req.body;

  console.log('Cuerpo recibido:', JSON.stringify(body, null, 2));

  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from; // Número del remitente
      const text = message.text?.body || ''; // Texto del mensaje
  
      console.log(`Mensaje recibido de ${from}: ${text}`);
  
      if (!text) {
        await sendWhatsAppMessage(from, 'No recibí un mensaje válido. Inténtalo de nuevo.');
        return;
      }
  
      const lowerText = text.toLowerCase();
  
      if (lowerText.includes('ayuda')) {
        await sendWhatsAppMessage(
          from,
          '¡Hola! Estoy aquí para ayudarte. Puedes preguntar sobre "servicios", "cotización", "confirmación" o "promociones".'
        );
      } else if (lowerText.includes('servicio')) {
        await sendWhatsAppMessage(
          from,
          `Estos son los servicios que ofrecemos:\n- ${businessInfo.services.join('\n- ')}`
        );
      } else if (lowerText.includes('coti')) {
        await sendWhatsAppMessage(
          from,
          '¡Claro! Por favor envíame los detalles de tu evento: tipo de evento, fecha y servicios requeridos.'
        );
      } else if (lowerText.includes('confirm')) {
        await sendWhatsAppMessage(from, businessInfo.confirmation);
      } else if (lowerText.includes('promo')) {
        await sendWhatsAppMessage(from, businessInfo.promotions);
      } else {
        await sendWhatsAppMessage(from, 'Lo siento, no entiendo tu solicitud. ¿Puedes intentar de nuevo?');
      }
    } else {
      console.log('No se encontraron mensajes en el evento recibido.');
    }
  
    res.status(200).send('EVENT_RECEIVED');
  } else {
    console.error('Evento no válido.');
    res.sendStatus(404);
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
    console.log(`Enviando mensaje a ${to}...`);
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Mensaje enviado a WhatsApp:', response.data);
  } catch (error) {
    console.error('Error al enviar mensaje a WhatsApp:', error.response?.data || error.message);
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

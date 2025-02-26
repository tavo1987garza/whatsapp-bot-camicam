
// Importar dependencias en modo ES Modules
import dotenv from 'dotenv'; // Para cargar variables de entorno
import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

// Cargar variables de entorno
dotenv.config();

// Crear instancia de Express
const app = express();
const PORT = process.env.PORT || 3000;



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
  console.log("📩 Webhook activado:", JSON.stringify(req.body, null, 2));

  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  const userMessage = message?.text?.body || '';
  const plataforma = "WhatsApp"; // O "Messenger", si proviene de allí

  console.log(`📩 Enviando mensaje de ${from} al CRM: ${userMessage}`);

  try {
    const response = await axios.post('https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje', {
      plataforma: plataforma,
      remitente: from,
      mensaje: userMessage
    });
    console.log("✅ Respuesta del CRM:", response.data);
  } catch (error) {
    console.error("❌ Error al enviar mensaje al CRM:", error.message);
  }

  // 📌 Endpoint para recibir mensajes desde el CRM y enviarlos a WhatsApp
app.post('/enviar_mensaje', async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;

    if (!telefono || !mensaje) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    console.log(`📩 Enviando mensaje desde el CRM a WhatsApp: ${telefono} -> ${mensaje}`);

    await sendWhatsAppMessage(telefono, mensaje);

    res.status(200).json({ mensaje: 'Mensaje enviado a WhatsApp correctamente' });
  } catch (error) {
    console.error('❌ Error al reenviar mensaje a WhatsApp:', error.message);
    res.status(500).json({ error: 'Error al enviar mensaje a WhatsApp' });
  }
});

});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});



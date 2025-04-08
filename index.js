

//CODIGO FUNCIONANDO YA CON LA VARIANTE DE CABINA DE FOTOS O CABINA 360, YA NO HAY ERROR, 
//CUANDO EL CLIENTE ESCRIBE "CABINA DE FOTOS" EL BOT YA NO LO TOMA COMO PREGUNTA FRECUENTE 
//AHORA SI LO  AGREGA A LA COTIZACION. YA NO HAY DUDAS CON EL FLUJO FINAL
//SE ACOMODARON LAS FUNCIONES Y SE DEPURÓ, YA SE ARREGLO EL PROBLEMA DE ARMAR PAQUETE----> NO ACPTABA NI LETRAS, NI 5 LETRAS, LETRAS 5 ACEPTA,
//PREGUNTA CUANTAS LETRAS OCUPAS?
//ESTO YA SE CORRIGIÓ, 
//TAMBIEN SE CORRIGIO LA VERIFICACION DE QUE CHISPEROS SE INGRESE EN PARES
//SE AJUSTÓ EL FORMATO DE FECHA: "20 DE MARZO 2025 DISPONIBLE"
//PQTE BODA, XV Y OTRO SIGUEN EL MISMO FORMATO DE PRESENTACION
//OBSERVACION, CUANDO EL CLINETE NO CONTESTA, SE VUELVE A ENVIAR EL MENSAJE, HAY QUE PONER ATENCION A ESTO


// Importar dependencias en modo ES Modules
import dotenv from 'dotenv'; 
import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import NodeCache from 'node-cache';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';


// Cargar variables de entorno
dotenv.config();

// Crear instancia de Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para manejar JSON
app.use(express.json());


// 🔹 Configurar AWS (S3)
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});
const s3 = new AWS.S3();

// 🔹 Configurar multer con almacenamiento en memoria
const upload = multer({ storage: multer.memoryStorage() });

  
/*===================================================
📌 Endpoint para subir la imagen a S3 desde FormData
=====================================================*/
app.post('/upload_imagen', upload.single('imagen'), async (req, res) => {
  try {
    // Verificar si llegó el archivo
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo en la key 'imagen'" });
    }

    const fileBuffer = req.file.buffer;        // El contenido binario
    const originalName = req.file.originalname; // Nombre del archivo original
    const mimeType = req.file.mimetype || 'application/octet-stream';

    const bucketName = process.env.S3_BUCKET_NAME;
    if (!bucketName) {
      return res.status(500).json({ error: "No está configurado S3_BUCKET_NAME" });
    }

    // Generar un nombre único en el bucket
    const nombreArchivo = `${uuidv4()}_${originalName}`;

    // Subir a S3
    const uploadResult = await s3.upload({
      Bucket: bucketName,
      Key: nombreArchivo,
      Body: fileBuffer,
      ContentType: mimeType
      // ACL: 'public-read' si tu bucket policy lo requiere
    }).promise();

    // uploadResult.Location = URL del objeto subido
    console.log("✅ Imagen subida a S3:", uploadResult.Location);

    // Retornamos la URL al frontend
    return res.json({ url: uploadResult.Location });

  } catch (error) {
    console.error("❌ Error en /upload_imagen:", error);
    return res.status(500).json({ error: error.message });
  }
});

  
/*============================
📌 Rutas (webhook, raíz, etc.)
==============================*/ 
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

app.get('/', async (req, res) => {
  res.send('¡Servidor funcionando correctamente! 🚀');
  console.log("Ruta '/' accedida correctamente.");
  try {
    console.log('Enviando mensaje de prueba a WhatsApp...');
    await sendWhatsAppMessage('528133971595', 'Hola, ¿en qué puedo ayudarte hoy? 😊');
    console.log('Mensaje de prueba enviado exitosamente.');
  } catch (error) {
    console.error('Error al enviar mensaje de prueba:', error.message);
  }
});

  
/*===========================================
📌 Webhook para manejar mensajes de WhatsApp
=============================================*/ 
app.post('/webhook', async (req, res) => {
  console.log("📩 Webhook activado:", JSON.stringify(req.body, null, 2));

  // 1) Extraemos el mensaje
  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  // 2) Checamos si es imagen
  if (message.type === "image") {
    try {
      // a) Obtener el media_id
      const mediaId = message.image.id;
      const from = message.from; // teléfono remitente

      // b) Obtener la URL de descarga de la Cloud API
      const respMedia = await axios.get(
        `https://graph.facebook.com/v21.0/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
          }
        }
      );
      const directUrl = respMedia.data.url; // la URL temporal

      // c) Descargar los bytes de la imagen
      const respImagen = await axios.get(directUrl, {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
        },
        responseType: 'arraybuffer'
      });
      const bufferImagen = respImagen.data;

       // d) Subir la imagen a S3
       const fileName = `${uuidv4()}.jpg`;       // nombre único
       const bucketName = process.env.S3_BUCKET_NAME;  // tu bucket
 
       // Subida con 'upload' (retorna una promesa)
       const uploadResult = await s3.upload({
         Bucket: bucketName,
         Key: fileName,
         Body: bufferImagen,
         ContentType: 'image/jpeg',
         // Si usas Bucket Owner Enforced + bucket policy, no necesitas ACL
         // ACL: 'public-read',
       }).promise();
 
       // uploadResult.Location es la URL pública del objeto
       const urlPublica = uploadResult.Location;
 
       console.log("✅ Imagen subida a S3:", urlPublica);
 
       // e) Enviar al CRM para que se guarde como "recibido_imagen"
       await axios.post("https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje", {
         plataforma: "WhatsApp",
         remitente: message.from, // "521xxxxxx"
         mensaje: urlPublica,      // la URL en S3
         tipo: "recibido_imagen"
       });
       console.log("✅ Imagen recibida y reportada al CRM:", urlPublica);
 
     } catch (error) {
       console.error("❌ Error al manejar la imagen:", error.message);
     }
     
     // Finalmente, responde 200 al webhook
     return res.sendStatus(200);
   }
  
  const from = message.from;
  let userMessage = "";
  if (message.text && message.text.body) {
    userMessage = message.text.body;
  } else if (message.interactive && message.interactive.button_reply) {
    userMessage = message.interactive.button_reply.title || message.interactive.button_reply.id;
  } else if (message.interactive && message.interactive.list_reply) {
    userMessage = message.interactive.list_reply.title || message.interactive.list_reply.id;
  }
  const plataforma = "WhatsApp";
  console.log(`📩 Mensaje de ${from} al CRM: ${userMessage}`);
  try {
    await axios.post('https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje', {
      plataforma,
      remitente: from,
      mensaje: userMessage
    });
    console.log("✅ Respuesta del CRM recibida");
  } catch (error) {
    console.error("❌ Error al enviar mensaje al CRM:", error.message);
  }


  const buttonReply = message?.interactive?.button_reply?.id || '';
  const listReply = message?.interactive?.list_reply?.id || '';
  const messageLower = buttonReply ? buttonReply.toLowerCase() : listReply ? listReply.toLowerCase() : userMessage.toLowerCase();
  console.log("📌 Mensaje recibido:", userMessage);
  console.log("🔘 Botón presionado:", buttonReply);
  console.log("📄 Lista seleccionada:", listReply);
  
  // Si el usuario ya está en un flujo específico, se omite el chequeo de FAQs 
  if (
    !userContext[from] ||
    ![
      "EsperandoServicios",
      "EsperandoFecha",
      "EsperandoLugar",
      "EsperandoCantidadLetras",
      "EsperandoDudas",
      "EsperandoTipoCabina",
      "ConfirmarAgregarCabinaCambio",
      "EsperandoTipoCarritoShots"
    ].includes(userContext[from].estado)
  ) {
    if (await handleFAQs(from, userMessage)) return res.sendStatus(200);
  }
  
  
  try {
    const handledFlow = await handleUserMessage(from, userMessage, messageLower);
    if (handledFlow) return res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error al manejar el mensaje:", error.message);
    await sendWhatsAppMessage(from, "😔 Perdona, hubo un problema al procesar tu solicitud. ¿Podrías intentarlo de nuevo?");
  }
  res.sendStatus(200);
 });

  
/*====================================================================
📌 Endpoint para recibir mensajes desde el CRM y enviarlos a WhatsApp
======================================================================*/ 
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

  
/*====================================================================
📌 Endpoint para recibir imagenes desde el CRM y enviarlos a WhatsApp
======================================================================*/ 
  app.post('/enviar_imagen', async (req, res) => {
    try {
      const { telefono, imageUrl, caption } = req.body;
      if (!telefono || !imageUrl) {
        return res.status(400).json({ error: 'Faltan datos (telefono, imageUrl)' });
      }
  
      console.log(`Enviando imagen a ${telefono}: ${imageUrl}`);
  
      // Reutilizar la función 'sendImageMessage' que tuviste en tu código:
      await sendImageMessage(telefono, imageUrl, caption);
  
      res.status(200).json({ mensaje: 'Imagen enviada a WhatsApp correctamente' });
    } catch (error) {
      console.error('❌ Error al enviar imagen a WhatsApp:', error.message);
      res.status(500).json({ error: 'Error al enviar imagen a WhatsApp' });
    }
  });
  

/*************************************
FUNCION para reportar mensajes al CRM.
*************************************/ 
async function reportMessageToCRM(to, message, tipo = "enviado") {
  const crmUrl = "https://camicam-crm-d78af2926170.herokuapp.com/recibir_mensaje";
  const crmData = {
    plataforma: "WhatsApp",
    remitente: to,
    mensaje: message,
    tipo: tipo
  };
  console.log("Enviando al CRM:", crmData);
  try {
    const response = await axios.post(crmUrl, crmData, { timeout: 5000 });
    console.log("✅ Reporte al CRM exitoso:", response.data);
  } catch (error) {
    console.error("❌ Error al reportar al CRM:", error.response?.data || error.message);
    throw error;
  }
}


/***********************************************
FUNCION para enviar mensajes simples con emojis.
***********************************************/ 
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
    const mensajeHTML = `<p>${message}</p>`;
    await reportMessageToCRM(to, mensajeHTML, "enviado");
  } catch (error) {
    if (error.response) {
      console.error('❌ Error en la respuesta de WhatsApp:', error.response.data);
    } else if (error.request) {
      console.error('❌ No se recibió respuesta de WhatsApp:', error.request);
    } else {
      console.error('❌ Error en la solicitud:', error.message);
    }
  }
}


/****************************
FUNCION para enviar Imagenes.
*****************************/ 
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
    const resumen = `
      <div>
        <img src="${imageUrl}" alt="Imagen enviada" style="max-width:200px;">
        ${ caption ? `<p>Caption: ${caption}</p>` : '' }
      </div>
    `;
    await reportMessageToCRM(to, resumen, "enviado");
  } catch (error) {
    console.error('Error al enviar imagen:', error.response?.data || error.message);
  }
}

// Configurar cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Objeto para almacenar el contexto de cada usuario
const userContext = {};

// Instancia global de caché para respuestas de OpenAI (disponible en todo el código)
const responseCache = new NodeCache({ stdTTL: 3600 });

// Función para construir el contexto para OpenAI (ajustado para sonar más humano)
function construirContexto() {
  return `
Eres un agente de ventas de "Camicam Photobooth" 😃. 
Nos dedicamos a la renta de servicios para eventos sociales, con especialización en bodas y XV años. 
Ofrecemos los siguientes servicios:
  - Cabina de fotos: $3,500
  - Cabina 360: $3,500
  - Lluvia de mariposas: $2,500
  - Carrito de shots con alcohol: $2,800
  - Letras gigantes: $400 cada una
  - Niebla de piso: $3,000
  - Lluvia matalica: $2,000
  - Scrapbook: $1,300
  - Audio Guest Book: $2,000
  - Chisperos (por pares):
       • 2 chisperos = $1,000  
       • 4 chisperos = $1,500  
       • 6 chisperos = $2,000  
       • 8 chisperos = $2,500  
       • 10 chisperos = $3,000
  
Atendemos el centro de Monterrey, Nuevo León y el área metropolitana hasta 25 km a la redonda. 
Responde de forma profesional, clara, concisa y persuasiva, como un vendedor experto en nuestros servicios.
  `;
} 

// Función para enviar mensajes interactivos con botones
async function sendInteractiveMessage(to, body, buttons) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    recipient_type: "individual",
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
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
    const resumen = `
      <div>
        <p>${body}</p>
        <ul>
          ${buttons.map(b => `<li>${b.title}</li>`).join('')}
        </ul>
      </div>
    `;
    await reportMessageToCRM(to, resumen, "enviado");
  } catch (error) {
    console.error('Error al enviar mensaje interactivo:', error.response?.data || error.message);
  }
}

// Función para enviar mensajes interactivos con imagen y control de estado
async function sendInteractiveMessageWithImageWithState(from, message, imageUrl, options, estadoEsperado) {
  await sendMessageWithTypingWithState(from, message, 3000, estadoEsperado);
  if (userContext[from].estado !== estadoEsperado) return;
  await sendImageMessage(from, imageUrl);
  await delay(2000); 
  if (userContext[from].estado !== estadoEsperado) return;
  await sendInteractiveMessage(from, options.message, options.buttons);
}

// Función para enviar videos
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
    const resumen = `
      <div>
        <video controls style="max-width:200px;">
          <source src="${videoUrl}" type="video/mp4">
          Tu navegador no soporta la etiqueta de video.
        </video>
        ${ caption ? `<p>Caption: ${caption}</p>` : '' }
      </div>
    `;
    await reportMessageToCRM(to, resumen, "enviado");
  } catch (error) {
    console.error('❌ Error al enviar el video:', error.response?.data || error.message);
  }
}


// Función para enviar mensajes con indicador de escritura
async function sendMessageWithTyping(from, message, delayTime) {
  await activateTypingIndicator(from);
  await delay(delayTime);
  await sendWhatsAppMessage(from, message);
  await deactivateTypingIndicator(from);
}

// Función interna para enviar mensajes con indicador de escritura y control de estado
async function sendMessageWithTypingWithState(from, message, delayTime, estadoEsperado) {
  console.log(`Iniciando sendMessageWithTypingWithState para ${from} con estado esperado: ${estadoEsperado}`);
  await activateTypingIndicator(from);
  await delay(delayTime);
  console.log(`Estado actual de ${from}: ${userContext[from].estado}`);
  if (userContext[from].estado === estadoEsperado) {
    console.log(`Enviando mensaje: "${message}" a ${from}`);
    await sendWhatsAppMessage(from, message);
  } else {
    console.log(`No se envía mensaje porque el estado no coincide.`);
  }
  await deactivateTypingIndicator(from);
}

// Función para crear un retraso
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Función para activar el indicador de "escribiendo"
async function activateTypingIndicator(to) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const headers = {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'typing',
    status: 'typing'
  };
  try {
    await axios.post(url, data, { headers });
    console.log('✅ Indicador de "escribiendo" activado');
  } catch (error) {
    console.error('❌ Error al activar el indicador de "escribiendo":', error.response?.data || error.message);
  }
}

// Función para desactivar el indicador de "escribiendo"
async function deactivateTypingIndicator(to) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const headers = {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'typing',
    status: 'paused'
  };
  try {
    await axios.post(url, data, { headers });
    console.log('✅ Indicador de "escribiendo" desactivado');
  } catch (error) {
    console.error('❌ Error al desactivar el indicador de "escribiendo":', error.response?.data || error.message);
  }
}

//Funcion para solicitar fecha
async function solicitarFecha(from, context) {
  await sendMessageWithTypingWithState(
    from,
    "De acuerdo\n\nPara continuar, por favor indícame la fecha de tu evento\n\nFormato: DD/MM/AAAA 📆\n\nEjemplo: 30/04/2025",
    2000, // Retraso de 2 segundos
    context.estado
  );
  context.estado = "EsperandoFecha";
}

// Función para parsear fechas en formato textual (e.g., "20 de mayo 2025")
function parseFecha(dateString) {
  // Si ya está en formato DD/MM/AAAA, la retornamos limpia
  const regexStandard = /^\d{2}\/\d{2}\/\d{4}$/;
  if (regexStandard.test(dateString.trim())) {
    return dateString.trim();
  }
  
  // Expresión regular para fechas en formato "20 de mayo 2025" o variantes similares
  const regexText = /^(\d{1,2})\s*(?:de\s+)?([a-záéíóú]+)\s*(?:de\s+)?(\d{4})$/i;
  const match = dateString.match(regexText);
  if (!match) return null; // No se pudo parsear
  
  // Extraer día, mes y año
  let day = match[1].padStart(2, '0'); // Se asegura que el día tenga 2 dígitos
  const monthName = match[2].toLowerCase();
  const year = match[3];
  
  // Mapeo de nombres de meses en español a números
  const monthMap = {
    'enero': '01',
    'febrero': '02',
    'marzo': '03',
    'abril': '04',
    'mayo': '05',
    'junio': '06',
    'julio': '07',
    'agosto': '08',
    'septiembre': '09',
    'setiembre': '09', // variante
    'octubre': '10',
    'noviembre': '11',
    'diciembre': '12'
  };
  
  const month = monthMap[monthName];
  if (!month) return null; // Mes no reconocido
  
  return `${day}/${month}/${year}`;
}

function formatFechaEnEspanol(fechaStr) {
  // Suponiendo que fechaStr es "DD/MM/AAAA"
  const [dia, mes, anio] = fechaStr.split("/");
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const mesNombre = meses[parseInt(mes, 10) - 1];
  return `${dia} de ${mesNombre} ${anio}`;
}

// Función para validar formato y existencia de la fecha (DD/MM/AAAA)
function isValidDate(dateString) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/; // Formato DD/MM/AAAA
  if (!regex.test(dateString)) return false;
  const [day, month, year] = dateString.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

// Función extendida para validar la fecha (acepta formatos numérico o textual)
function isValidDateExtended(dateString) {
  const formattedDate = parseFecha(dateString);
  if (!formattedDate) return false;
  return isValidDate(formattedDate);
}

// Función para validar que la fecha no esté en el pasado
function isValidFutureDate(dateString) {
  const formattedDate = parseFecha(dateString);
  if (!formattedDate) return false;
  if (!isValidDate(formattedDate)) return false;
  
  // Extraer día, mes y año y crear objeto Date
  const [day, month, year] = formattedDate.split('/').map(Number);
  const inputDate = new Date(year, month - 1, day);
  
  // Fecha actual sin considerar hora, minutos, etc.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return inputDate >= today;
}

// Función para validar que la fecha esté dentro de los próximos 2 años
function isWithinTwoYears(dateString) {
  const formattedDate = parseFecha(dateString);
  if (!formattedDate) return false;
  if (!isValidDate(formattedDate)) return false;
  
  const [day, month, year] = formattedDate.split('/').map(Number);
  const inputDate = new Date(year, month - 1, day);
  
  // Fecha actual sin horas
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Fecha máxima permitida: hoy + 2 años
  const maxDate = new Date(today);
  maxDate.setFullYear(maxDate.getFullYear() + 2);
  
  return inputDate <= maxDate;
}

// Función original para verificar disponibilidad (simulada)
function checkAvailability(dateString) {
  // Simulación de fechas ocupadas (en formato DD/MM/AAAA)
  const occupiedDates = ["15/02/2024", "20/02/2024"];
  return !occupiedDates.includes(dateString);
}

// Función para enviar mensjae al administrador
async function sendMessageToAdmin(message) {
  const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!adminNumber) {
    console.error("El número de WhatsApp del administrador no está definido en .env");
    return;
  }
  try {
    await sendWhatsAppMessage(adminNumber, message);
    console.log("Mensaje enviado al administrador:", message);
  } catch (error) {
    console.error("Error al enviar mensaje al administrador:", error);
  }
}


// Objeto para asociar servicios a medios (imágenes y videos)
const mediaMapping = {
  "cabina de fotos": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-2.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-3.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-4.jpg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-multicolor-2.jpeg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Blanca.mp4",
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Rosa.mp4",
      "http://cami-cam.com/wp-content/uploads/2025/03/cabina-multicolor.mp4"
    ]
  },
  "cabina 360": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Rosa.mp4"
    ]
  },
  "lluvia de mariposas": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/lluvia1.jpg"
    ],
    videos: []
  },
  "carrito de shots con alcohol": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/carrito1.jpg"
    ],
    videos: []
  },
  "niebla de piso": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/niebla1.jpg"
    ],
    videos: []
  },
  "scrapbook": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-4.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-3.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-2.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-5.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-7.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-6.jpeg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook.mp4"
    ]
  },
  "audio guest book": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/audio1.jpg"
    ],
    videos: []
  },
  "letras gigantes": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"
    ]
  },
  "chisperos": {
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/07/chisperos1.jpg"
    ],
    videos: []
  }
};

// FAQs con emojis y nuevos servicios
const faqs = [
  { question: /hacen contrato|contrato/i, answer: "📄 ¡Sí! Una vez que se acredite el anticipo, llenamos el contrato y te enviamos una foto." },
  { question: /con cuanto tiempo separo mi fecha|separar/i, answer: "⏰ Puedes separar tu fecha en cualquier momento, siempre y cuando esté disponible." },
  { question: /se puede separar para 2026|2026/i, answer: "📆 Claro, tenemos agenda para 2025 y 2026. ¡Consulta sin compromiso!" },
  { question: /cuánto se cobra de flete|flete/i, answer: "🚚 El flete varía según la ubicación. Contáctanos y lo calculamos juntos." },
  { question: /cómo reviso si tienen mi fecha disponible/i, answer: "🔎 Cuéntame, ¿para cuándo es tu evento? Así reviso la disponibilidad." },
  { question: /ubicación|dónde están|donde son|ubican|oficinas/i, answer: "📍 Nos encontramos en la Colonia Independencia en Monterrey. Cubrimos hasta 30 km a la redonda." },
  { question: /pago|método de pago|tarjeta|efectivo/i, answer: "💳 Aceptamos transferencias, depósitos y pagos en efectivo. ¡Lo que te resulte más cómodo!" },
  { 
    question: /que servicios manejas|servicios/i, 
    answer: "🎉 Aquí tienes nuestros servicios:",
    imageUrl: "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg" 
  },
  { 
    question: /con cuánto se separa|con cuanto separo|como se separa|como separo|para separar|cuanto de anticipo/i, 
    answer: "⏰ Puedes separar tu fecha en cualquier momento, siempre y cuando esté disponible.\n\nSeparamos fecha con $500, el resto puede ser ese dia, al inicio del evento.\n\nUna vez acreditado el anticipo solo pedire Nombre y los datos del evento, lleno tu contrato y te envío foto.\n\nSi tienes una vuelta para el centro de Monterrey me avisas para entregarte tu contrato original"    
  },
  /*{
    question: /me interesa\b/i, // Coincide con "me interesa" pero no con "Sí, me interesa"
    answer: "Genial!! \n\nPara continuar por favor indicame la fecha de tu evento para revisar disponibilidad "
  },*/  
  { 
    question: /para depositarte|datos para deposito|transfiero|transferencia|depositar|depósito/i, 
    imageUrl: "http://cami-cam.com/wp-content/uploads/2025/03/Datos-Transferencia-1.jpeg", 
    answer: "722969010494399671"
  },
  { 
    question: /que incluye la cabina de fotos|cabina de fotos/i, 
    answer: "📸 La CABINA DE FOTOS incluye 3 horas de servicio, iluminación profesional, fondo personalizado, accesorios temáticos y más.",
    images: [
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-2.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-3.jpg",
      "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-4.jpg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-multicolor-2.jpeg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Blanca.mp4",
      "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Rosa.mp4",
      "http://cami-cam.com/wp-content/uploads/2025/03/cabina-multicolor.mp4"
    ]
  },
  { 
    question: /que es el scrapbook|scrapbook/i, 
    answer: "📚 El Scrapbook es un álbum interactivo donde tus invitados pegan una de las fotos de la cabina y escriben un lindo mensaje para que recuerdes cada detalle.",
    images: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-4.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-3.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-2.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-5.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-7.jpeg",
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-6.jpeg"
    ],
    videos: [
      "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook.mp4"  
    ]
  }
];

// Función para buscar FAQs (retorna el objeto completo)
function findFAQ(userMessage) {
  for (const faq of faqs) {
    if (faq.question.test(userMessage)) {
      return faq;
    }
  }
  return null;
}

// Función para manejar FAQs
async function handleFAQs(from, userMessage) {
  const faqEntry = findFAQ(userMessage);
  if (faqEntry) {
    await sendWhatsAppMessage(from, faqEntry.answer + " 😊");
    if (faqEntry.imageUrl) {
      await sendImageMessage(from, faqEntry.imageUrl);
    }
    if (faqEntry.images && Array.isArray(faqEntry.images)) {
      for (const imageUrl of faqEntry.images) {
        await sendImageMessage(from, imageUrl);
      }
    }
    if (faqEntry.videoUrl) {
      await sendWhatsAppVideo(from, faqEntry.videoUrl);
    }
    if (faqEntry.videos && Array.isArray(faqEntry.videos)) {
      for (const videoUrl of faqEntry.videos) {
        await sendWhatsAppVideo(from, videoUrl);
      }
    }
    return true; // Indicar que se manejó una FAQ
  }
  return false; // No se manejó ninguna FAQ
}


/***************************************************
 FUNCION para seleccionar el Tipo de evento: Boda, XV Años, Otros sugeridos
 y enviar la información
 ****************************************************/
 async function handleTipoEvento(from, messageLower, context) {
  // Caso: Boda (cuando el usuario indica "boda" o "evento_boda")
  if (messageLower.includes("boda") || messageLower.includes("evento_boda")) {
    context.tipoEvento = "Boda";

        // Paquete Recomendado PAQUETE WEDDING
    context.paqueteRecomendado = {
      paquete: "PAQUETE WEDDING"
    };

    await sendMessageWithTypingWithState(
      from,
      "¡Muchas felicidades por tu Boda! 👏 Hagámos que sea un día inolvidable!! ❤️",
      3000,
      context.estado
    );
    await delay(2000);
    await sendWhatsAppMessage (from, "Mira, éstos son los sevicios que ofrecemos en Camicam Photobooth");
    await delay(4000);
    await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg");
    await delay(6000);
    await sendMessageWithTypingWithState(
      from,
      "Puedes armar tu paquete a tu gusto, con todo lo que necesites, incluso si requieres un solo servicio,\n\nO si prefieres, puedes ver nuestro Paquete Exclusivo para Bodas.\n\n¿Cómo quieres continuar?",
      3000,
      context.estado
    );
    await sendInteractiveMessage(
      from,
      "Selecciona una opción: 👇",
      [
        { id: "armar_paquete", title: "Armar mi paquete" },
        { id: "paquete_wedding", title: "Paquete Para Bodas" }
      ]
    );
    context.estado = "EsperandoConfirmacionPaquete";
    return true;
  }

  //CASO XV 
  else if (messageLower.includes("xv") || messageLower.includes("quince")) {
    context.tipoEvento = "XV";

    // Paquete Recomendado PAQUETE MIS XV
    context.paqueteRecomendado = {
      paquete: "PAQUETE MIS XV"
    };

    await sendMessageWithTypingWithState(
      from,
      "¡Muchas felicidades! 👏\n\nHagámos que tu fiesta de XV Años sea un día maravilloso!! ✨",
      3000,
      context.estado
    );
    await delay(2000);
    await sendWhatsAppMessage (from, "Mira, éstos son los sevicios que ofrecemos en Camicam Photobooth");
    await delay(4000);
    await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg");
    await delay(6000);
    await sendMessageWithTypingWithState(
      from,
      "Puedes armar tu paquete a tu gusto, con todo lo que necesites, incluso si requieres un solo servicio,\n\nO si prefieres, puedes ver nuestro Paquete exclusivo para XV.\n\n¿Cómo quieres continuar?",
      3000,
      context.estado
    );
    await sendInteractiveMessage(
      from,
      "Selecciona una opción: 👇",
      [
        { id: "armar_paquete", title: "Armar mi paquete" },
        { id: "paquete_xv", title: "Paquete Para XV" }
      ]
    );

    // -> Directamente a "EsperandoConfirmacionPaquete"
    context.estado = "EsperandoConfirmacionPaquete";
    return true;
  }

  // CASO OTRO
  else {
    // Obtener la recomendación basada en el tipo de evento escrito por el usuario
    const recomendacion = getOtherEventPackageRecommendation(messageLower);

    // Guardar en el contexto el paquete recomendado para posteriores referencias
    context.paqueteRecomendado = recomendacion;

      // Mensaje de felicitación y presentación de servicios
  await sendMessageWithTypingWithState(
    from,
    "¡Muchas felicidades! 👏\n\nHagámos que tu evento sea único y especial!! ✨",
    3000,
    context.estado
  );
  await delay(2000);
  await sendWhatsAppMessage(from, "Mira, éstos son los servicios que ofrecemos en Camicam Photobooth");
  await delay(4000);
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg");
  await delay(6000);
  await sendMessageWithTypingWithState(
    from,
    "Puedes armar tu paquete a tu gusto, con todo lo que necesites, incluso si requieres un solo servicio,\n\nO si prefieres, puedes ver la información de nuestro Paquete exclusivo para este tipo de evento.\n\n¿Cómo quieres continuar?",
    3000,
    context.estado
  );
  
  // Enviar botones interactivos: "Armar mi paquete" y "Paquete Para Este Evento"
  await sendInteractiveMessage(
    from,
    "Selecciona una opción: 👇",
    [
      { id: "armar_paquete", title: "Armar mi paquete" },
      { id: "paquete_otro", title: context.paqueteRecomendado?.paquete || "Paq Para Este Evento" }

    ]
  );
  
  // Se actualiza el estado para esperar la confirmación
  context.estado = "EsperandoConfirmacionPaquete";
  return true;
}
}  
 

/***************************************************
FUNCION para identificar el subtipo de evento 
y devolver una recomendación de paquete.
 ****************************************************/
function getOtherEventPackageRecommendation(userMessage) {
  const mensaje = userMessage.toLowerCase();

  // Detectar cumpleaños: se pueden buscar números o palabras como "cumpleaños"
   if (/cumpleaños|numero|numeros|#|número|números|birthday|\b\d+\b/.test(mensaje)) {
    return {
      paquete: "PAQUETE NÚMEROS",
      descripcion: "Nuestros números son ideales para cumpleaños. Miden 1.20 mts de alto, están pintados de blanco y los focos son de luz led con 83 secuencias de distintos colores, también se pueden programar en una sola secuencia. El 'Paquete Números' incluye 2 números gigantes por un precio de $600, más flete dependiendo de la ubicación de tu evento.",
      media: {
        images: ["http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"],
        videos: ["http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"]
      }
    };
  }
  // Detectar revelación de género
 else if (/revelación de género|revelacion|baby|oh baby|girl|boy/.test(mensaje)) {
  return {
    paquete: "PAQUETE REVELACION",
    descripcion: "Ideal para eventos de revelación de género, con letras decorativas y opciones que resaltan 'BABY', 'OH BABY' o 'GIRL BOY'.",
    media: {
      images: ["http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"],
      videos: ["http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"]
    }
  };
}
// Detectar propuesta
else if (/propuesta|casate|casar|cásate conmigo|pedir matrimonio|marry me/.test(mensaje)) {
  return {
    paquete: "PAQUETE MARRY ME",
    descripcion: "Perfecto para una propuesta inolvidable, con letras románticas y personalizadas que dicen 'MARRY ME'.",
    media: {
      images: ["http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"],
      videos: ["http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"]
    }
  };
}
// Detectar graduación
else if (/graduación|grad|class|gen\b/.test(mensaje)) {
  return {
    paquete: "PAQUETE GRADUACION",
    descripcion: "Ofrece letras gigantes modernas ideales para graduaciones, por ejemplo, 'CLASS 2025', 'GRAD 25' o 'GEN 2022'.",
    media: {
      images: ["http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"],
      videos: ["http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"]
    }
  };
}

// Si no se detecta un subtipo específico
return {
  paquete: "OTRO PAQUETE",
  descripcion: "Tenemos varias opciones personalizadas. ¿Podrías contarnos un poco más sobre tu evento para ofrecerte la mejor recomendación?",
  media: {
    images: ["http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg"],
    videos: []
  }
};
}

/***************************************************
 FUNCION que maneja la logica de las sugerencias
 ****************************************************/
function checkUpsellSuggestions(context) {
  let suggestions = [];
  const servicios = context.serviciosSeleccionados.toLowerCase();
  const availableServices = [
    "cabina de fotos", "cabina 360", "lluvia de mariposas", "carrito de shots con alcohol",
    "carrito de shots sin alcohol", "niebla de piso", "lluvia matálica",
    "scrapbook", "audio guest book", "letras gigantes", "chisperos"
  ];

  // Si previamente se había sugerido algo pero ahora ya se agregó el scrapbook,
  // reiniciamos la bandera para permitir nuevas sugerencias.
  if (context.upsellSuggested && servicios.includes("scrapbook")) {
    context.upsellSuggested = false;
  }

  // Contar la cantidad de servicios seleccionados
  let serviceCount = 0;
  availableServices.forEach(service => {
    if (servicios.includes(service)) serviceCount++;
  });

  // Regla 1: Si se seleccionó "cabina de fotos" pero no "scrapbook"
  if (servicios.includes("cabina de fotos") && !servicios.includes("scrapbook")) {
    suggestions.push("👉 Sugerencia: Al agregar *Scrapbook*, tu evento se verá aún más espectacular\n¡Además, podrías aprovechar un mayor descuento!🤩\n\nEscribe *Agregar Scrapbook* si lo deseas");
    // Activar flag para enviar el video del scrapbook
    context.suggestScrapbookVideo = true;
    context.upsellSuggested = true;
  }
  // Regla 2: Si ya se agregó Scrapbook (o no aplica la Regla 1) y se tienen exactamente 2 servicios
  else if (serviceCount === 2) {
    suggestions.push("¡Sugerencia! Si agregas un tercer servicio, obtendrás un 30% de descuento, y con 4 servicios, ¡hasta un 40%!");
    context.upsellSuggested = true;
  }

  return suggestions;
}

/***************************************************
 FUNCION para contar solo letras (ignorando números y caracteres especiales)
 ****************************************************/
 function contarLetras(texto) {
  return texto.replace(/[^a-zA-Z]/g, "").length;
}

/**************************************
 FUNCION para CALCULAR la cotizacion
 **************************************/
function calculateQuotation(servicesText) {
  // Diccionario de precios
  const prices = {
    "cabina de fotos": 3500,
    "cabina 360": 3500,
    "lluvia de mariposas": 2500,
    "carrito de shots con alcohol": 2800,
    "carrito de shots sin alcohol": 2200,
    "niebla de piso": 3000,
    "lluvia matálica": 2000,
    "scrapbook": 1300,
    "audio guest book": 2000,
    "letras gigantes": 400 // precio por letra
  };

  // Precios para chisperos según cantidad
  const chisperosPrices = {
    2: 1000,
    4: 1500,
    6: 2000,
    8: 2500,
    10: 3000
  };

  // Separar servicios (se asume que están separados por comas)
  const servicesArr = servicesText.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);

  let subtotal = 0;
  let serviceCount = 0; // para aplicar descuentos
  let details = [];
  let servicesRecognized = [];
  let letrasCount = 0;

  for (const service of servicesArr) {
    // Caso de chisperos (o chispero)
    if (/chispero[s]?\b/i.test(service)) {
      const match = service.match(/chispero[s]?\s*(\d+)/i);
      if (match && match[1]) {
        // Si hay cantidad, procesar normalmente
        const qty = parseInt(match[1]);
        if (chisperosPrices[qty]) {
          subtotal += chisperosPrices[qty];
          serviceCount++;
          details.push(`🔸 *${qty} Chisperos*: $${chisperosPrices[qty].toLocaleString()}`);
          servicesRecognized.push("chisperos");
        } else {
          details.push(`🔸 Chisperos: cantidad inválida (${service})`);
        }
      } else {
        // Si no hay cantidad, retornar un objeto indicando que falta la cantidad
        return {
          error: true,
          needsInput: 'chisperos',
          details: ["🔸 *Chisperos*: Por favor, indícanos cuántos chisperos necesitas."],
          subtotal: 0,
          discountPercent: 0,
          discountAmount: 0,
          total: 0,
          servicesRecognized: []
        };
      }
    }

    // Caso de letras o letras gigantes
    else if (/letras(?:\s*gigantes)?\b/.test(service)) {
      const match = service.match(/letras(?:\s*gigantes)?\s*(\d+)/);
      if (match && match[1]) {
        const qty = parseInt(match[1]);
        const precioLetras = qty * prices["letras gigantes"];
        subtotal += precioLetras;
        serviceCount++;
        details.push(`🔸 *${qty} Letras Gigantes* (5 Horas): $${precioLetras.toLocaleString()}`);
        servicesRecognized.push("letras gigantes");
        letrasCount = qty;
      } else {
        // En este punto, gracias a la actualización, no debería ocurrir
        details.push(`🔸 *Letras*: cantidad no especificada`);
      }
    }

     
     // Caso de lluvia metálica (o lluvia metalica)
    else if (/lluvia m(?:e|é)t(?:a|á)lica\b/i.test(service)) {
        subtotal += prices["lluvia matálica"];
        serviceCount++;
        details.push(`🔸 *Lluvia Metálica*: $${prices["lluvia matálica"].toLocaleString()}`);
        servicesRecognized.push("lluvia metálica");
    }

    // Otros servicios definidos
    else {
      let baseService;
      let qty = 1;
      // Primero comprobamos si el servicio completo coincide con alguna clave de precios
      if (prices.hasOwnProperty(service)) {
        baseService = service;
      } else {
        // Si no, intentamos extraer el nombre y la cantidad usando regex
        const matchService = service.match(/^(.+?)(?:\s+(\d+))?$/);
        if (matchService) {
          baseService = matchService[1].trim();
          qty = matchService[2] ? parseInt(matchService[2]) : 1;
        }
      }

      if (prices[baseService] !== undefined) {
        const precioTotal = prices[baseService] * qty;
        subtotal += precioTotal;
        serviceCount++;

        // Formatear el nombre del servicio
        let serviceNameFormatted = baseService.charAt(0).toUpperCase() + baseService.slice(1);

        // Agregar "(3 horas)" para cabina de fotos y cabina 360
        if (baseService.toLowerCase() === "cabina de fotos" || baseService.toLowerCase() === "cabina 360") {
          serviceNameFormatted += " (3 horas)";
        }

        // Construir el detalle del servicio
        let serviceDetail = "";
        if (qty === 1) {
          serviceDetail = `🔸 *${serviceNameFormatted}:* $${precioTotal.toLocaleString()}`;
        } else {
          serviceDetail = `🔸 *${serviceNameFormatted} ${qty}:* $${precioTotal.toLocaleString()}`;
        }

        details.push(serviceDetail);
        servicesRecognized.push(baseService);
      } else {
        console.warn(`Servicio no reconocido: ${service}`);
        details.push(`🔸 ${service}: servicio no reconocido`);
      }
    }
  }

  // Aplicar descuento según cantidad de servicios reconocidos
  let discountPercent = 0;
  if (serviceCount === 1) {
    // Caso único: si es chisperos y la cantidad es exactamente 2, sin descuento.
    if (/chispero[s]?\s*2\b/i.test(servicesArr[0])) {
      discountPercent = 0;
    }
    // Si es letras (o letras gigantes) y se especifica la cantidad
    else if (/letras(?:\s*gigantes)?\s*(\d+)/i.test(servicesArr[0])) {
      const match = servicesArr[0].match(/letras(?:\s*gigantes)?\s*(\d+)/i);
      const qty = parseInt(match[1]);
      // Si la cantidad es 1, sin descuento; si es mayor (2 o más), se aplica 10%
      discountPercent = (qty === 1) ? 0 : 10;
    }
    // Para cualquier otro servicio único, aplicar 10%
    else {
      discountPercent = 10;
    }
  } else if (serviceCount === 2) {
    discountPercent = 25;
  } else if (serviceCount === 3) {
    discountPercent = 30;
  } else if (serviceCount >= 4) {
    discountPercent = 40;
  }

  const discountAmount = subtotal * (discountPercent / 100);
  const total = subtotal - discountAmount;

  return {
    error: false,
    subtotal,
    discountPercent,
    discountAmount,
    total,
    details,
    servicesRecognized
  };
}

/**************************************
 FUNCION para ACTUALIZAR la cotizacion
 **************************************/
 async function actualizarCotizacion(from, context, mensajePreliminar = null) {
   // 1) Calcular la cotización
   const cotizacion = calculateQuotation(context.serviciosSeleccionados);

   // 2) Mensajes de cabecera (si lo deseas)
   const cabecera = mensajePreliminar ? mensajePreliminar : "*PAQUETE PERSONALIZADO*";
   // Este mensaje se puede enviar antes o después. 
   // Si quieres enviarlo luego de las imágenes, puedes omitirlo aquí.
  
   // 3) Preparar texto de detalles y texto de resumen
   const mensajeDetalles = `${cabecera}\n\n` + cotizacion.details.join("\n");
   const mensajeResumen = `Subtotal: $${cotizacion.subtotal.toLocaleString()}\nDescuento (${cotizacion.discountPercent}%): -$${cotizacion.discountAmount.toLocaleString()}\n\n*TOTAL A PAGAR: $${cotizacion.total.toLocaleString()}*`;

   // 4) Enviar primero las imágenes y videos (en base a los servicios reconocidos) 
   //    antes de mostrar la descripción textual de la cotización.
   if (cotizacion.servicesRecognized && cotizacion.servicesRecognized.length > 0) {
    for (const service of cotizacion.servicesRecognized) {
      // Verifica si ya se enviaron medios previamente
      if (mediaMapping[service] && (!context.mediosEnviados || !context.mediosEnviados.has(service))) {
        if (mediaMapping[service].images && mediaMapping[service].images.length > 0) {
          for (const img of mediaMapping[service].images) {
            await sendImageMessage(from, img);
            await delay(1000);
          }
        }
        if (mediaMapping[service].videos && mediaMapping[service].videos.length > 0) {
          for (const vid of mediaMapping[service].videos) {
            await sendWhatsAppVideo(from, vid);
            await delay(1000);
          }
        }
        // Marcar como enviado
        if (!context.mediosEnviados) context.mediosEnviados = new Set();
        context.mediosEnviados.add(service);
      }
    }
   }

   // 5) Después de mostrar los archivos, se envían los detalles de la cotización (servicios)
   await sendMessageWithTypingWithState(from, mensajeDetalles, 2000, context.estado);
   await delay(2000);

   // 6) Y finalmente el resumen (subtotal, descuento y total)
   await sendMessageWithTypingWithState(from, mensajeResumen, 2000, context.estado);

   // 7) Checar si hay sugerencias de upsell
   const upsellSuggestions = checkUpsellSuggestions(context);
   if (upsellSuggestions.length > 0) {
    const mensajeUpsell = upsellSuggestions.join("\n");
    await delay(2000);
    await sendMessageWithTypingWithState(from, mensajeUpsell, 2000, context.estado);

    // Si había que mostrar video de scrapbook
    if (context.suggestScrapbookVideo) {
      const scrapbookMedia = mediaMapping["scrapbook"];
      if (scrapbookMedia && scrapbookMedia.videos && scrapbookMedia.videos.length > 0) {
        await delay(2000);
        await sendWhatsAppVideo(from, scrapbookMedia.videos[0]);
      }
      context.suggestScrapbookVideo = false;
    }
   }

    // OBTENER el nombre del paquete que guardaste en context.paqueteRecomendado
    // Si no existe, mostramos "Paquete Sugerido"
    //Sucede despues de seleccionar "Armar mi paquete" y presentar la cotizacion
    const tituloPaquete = context.paqueteRecomendado?.paquete || "Paquete👏Sugerido";

   await delay(3000);
   await sendInteractiveMessage( 
    from,
    `Te gustaría continuar con el ${tituloPaquete}?\n\nO tu Paquete Personalizado?`,
    [
      { id: "si_me_interesa_sugerido", title: tituloPaquete },
      { id: "si_me_interesa", title: "PAQ. PERSONALIZADO" },
      { id: "modificar_cotizacion", title: "Modificar Cotización" }
    ]
   );

   context.estado = "EsperandoDudas";
  }

/*'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
🟢 FUNCION PARA MANEJAR EL FLUJO DE MENSAJES DEL USUARIO CON TONO NATURAL 🟢
'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''*/
async function handleUserMessage(from, userMessage, messageLower) {
  if (!userContext[from]) {
    userContext[from] = {
      estado: "Contacto Inicial",
      tipoEvento: null,
      nombre: null,
      fecha: null,
      lugar: null,
      serviciosSeleccionados: [],
      total: 0,
      mediosEnviados: new Set(), // Para evitar enviar medios repetidos
    };
  }
  const context = userContext[from];

  /* ============================================
   Si el estado es "EsperandoConfirmacionPaquete", no procesar FAQs
   ============================================ */
  if (context.estado === "EsperandoConfirmacionPaquete") {
    // Procesar FAQs solo si no está en el estado "EsperandoConfirmacionPaquete"
    if (await handleFAQs(from, userMessage)) {
      return true; // Si se manejó una FAQ, salir de la función
    }
  }

  /* ============================================
   Interceptamos el botón "armar_paquete"
   ============================================ */
  if (
    messageLower.includes("armar_paquete") || messageLower.includes("armar mi paquete")) {
    // Solo si el estado actual es uno de estos:
    if ([
      "EsperandoConfirmacionPaquete",
      "EsperandoDudas",
      "EsperandoTipoEvento"
      // ...puedes agregar más si quieres
    ].includes(context.estado)) {
      // Lógica genérica de “Arma tu paquete”
      await sendMessageWithTypingWithState(
        from,
        "¡Genial! 🤩 ¡Vamos a personalizar tu paquete!\n\n✏️ *Escribe lo que necesitas separado por comas*.\n\nPor ejemplo:\ncabina de fotos, cabina 360, 6 letras gigantes, 4 chisperos, carrito de shots con alcohol, carrito de shots sin alcohol, lluvia de mariposas, lluvia metálica, niebla de piso, scrapbook, audio guest book",
        2000,
        context.estado
      );
      context.estado = "EsperandoServicios";
      return true;
    }
  } 

  /* ============================================
   Interceptamos el botón "si_me_interesa_sugerido" y "si_me_interesa"
   ============================================ */
if (
  messageLower === "si_me_interesa_sugerido" || messageLower === "si_me_interesa") {
  // Verificamos estado
  if (context.estado === "EsperandoConfirmacionPaquete" || context.estado === "EsperandoDudas") {
    // Solicitamos fecha
    context.estado = "EsperandoFecha";
    await solicitarFecha(from, context);
    return true; // Salimos
  }
}
  
  /* ============================================
   Interceptamos el botón "modificar_cotizacion"
   ============================================ */
  if (messageLower === "modificar_cotizacion") {
    // Cambiamos el estado al que maneja "Agregar" y "Quitar"
    context.estado = "EsperandoDudas";

    // Enviamos las instrucciones
    await sendWhatsAppMessage(
      from,
      "😊 Para modificar tu cotización\nEscribe:\n\n'*Agregar* y el nombre del servicio' ó\n\n'*Quitar* y el nombre del servicio'"
    );

    return true; // Evitamos procesar otros estados, ya que se manejó aquí
  }

  /* ============================================
   Interceptamos el botón "paquete_wedding"
   CASO BODA
   ============================================ */
  if (messageLower === "paquete_wedding" || messageLower.includes("Paquete Para Bodas")) {
    await sendMessageWithTypingWithState(
      from,
      "Te presento el *Paquete Wedding* que estamos promocionando: \n\nIncluye Cabina 360, iniciales decorativas, 2 chisperos y un carrito de shots con alcohol, por *$4,450*.",
      2000,
      context.estado
    );
    await delay(2000);
    await sendWhatsAppVideo(from, mediaMapping["cabina de fotos"].videos[0]);
    await delay(2000);
    await sendImageMessage(from, mediaMapping["cabina de fotos"].images[0]);
    await delay(2000);
    await sendImageMessage(from, mediaMapping["cabina de fotos"].images[1]);
    await delay(2000);
    await sendImageMessage(from, mediaMapping["cabina de fotos"].images[2]);
    await delay(2000);
    await sendImageMessage(from, mediaMapping["cabina de fotos"].images[3]);
    await delay(2000);
    await sendInteractiveMessage(
      from,
      "¿Te gustaría continuar con el *PAQUETE WEDDING*?\n\nO prefieres armar tu paquete?",
      [
        { id: "si_me_interesa", title: "PAQUETE WEDDING" },
        { id: "armar_paquete", title: "Armar mi paquete" }
      ]
    );
    context.estado = "EsperandoConfirmacionPaquete";
    return true;
  }


  /* ============================================
   Interceptamos el botón "paquete_xv"
   CASO BODA
   ============================================ */
   if (messageLower === "paquete_xv" || messageLower.includes("Paquete Para XV")) {


    
      // PARTE 1
  const textoA = `  
Te presento el paquete que estamos promocionando:

    *PAQUETE MIS XV*

        Incluye: 

🔸*Cabina de fotos* (3 Horas) 
Impresion ilimitada de fotos en calidad Kodak.
¡Tus invitados se divertirán mucho con los accesorios chuzcos que ponemos dentro de la cabina!

🔸*6 letras Gigantes* (5 Horas)
De 1.20 mts de alto y luces led con secuencias multicolor.
¡Para que tu nombre se vea espectacular!

y Escoge

🔸*Niebla de piso*
Que cubre TODA la pista de baile durante TODO el vals principal.
¡Lucirás hermosa con tu papá!

Ó

🔸*Lluvia de mariposas* 
Durante el vals principal realizamos 4 detonaciones de papel china cortado en forma de mariposa
¡Tus invitados quedarán sorprendidos!

Todo esto con un valor de $8,900
`;
  
   // PARTE 2
   const textoB = `  
*¡Contrata ahora y recibe de REGALO!*

🔸*2 Chisperos* de Luz Fría De 2.5 mts
Ideales para la presentación

Con un valor de $1,000

¡¡Y eso no es todo!! 

A las primeras 10 Quinceañeras que contraten éste paquete les estaremos Regalando 

🔸*1 Scrapbook* personalizado para la cabina de fotos
Donde tus invitados pegarán una de sus fotos y escribirán un lindo mensaje que podrán personalizar con nuestra plantilla de Stickers exclusiva para XV años

Con un valor de $1,300

¡Te lo llevamos también Completamente Gratis!

¡Será un recuerdo muy bonito de tu evento!

Si contrataras todo esto por separado, el precio Regular sería de $11,200

*¡¡SOLO HOY CONTRATA TODO POR UN EXCELENTE PRECIO!!*
`;
      
      const textoC = `
Y no te preocupes que nosotros cubrimos los gastos DE FLETE y transportacion!! a una distancia de hasta 20 km del centro de Monterrey

   *¡¡Aprovecha!!*

¡Solo este mes disfruta de un *45% DE DESCUENTO* sobre el precio regular!

¡¡Un Gran Ahorro que puedes ocupar en otras cosas!!
  
      En Resumen:
  
🔸 *Cabina de fotos* (3 Horas)
🔸 *6 letras Gigantes* (5 Horas)
🔸 *Niebla de piso* ó 
    *Lluvia de mariposas* 
🔸 *2 Chisperos de luz fría*
🔸 *1 Scrapbook*
🔸 *Descuento de $5,040*
🔸 *Flete Incluido*

*¡¡SOLO HOY CONTRATA TODO POR TAN SOLO!!*

        ✨ *$6,160* ✨

¡¡Aprovecha esta oportunidad!!

Separa tu fecha con $500, el resto puede ser el dia de tu evento

Revisa Disponibilidad ahora y asegura tu paquete antes de que te ganen tu fecha 😱      
`;
  
  
  
      // Enviamos imagen de presentacion
      await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2023/10/PAQUETE-MIS-XV-2.jpg");
      
      // Primer mensaje
      await delay(2000);
      await sendMessageWithTypingWithState(from, textoA, 2000, context.estado);
  
      // Segundo mensaje
      await delay(2000);
      await sendMessageWithTypingWithState(from, textoB, 2000, context.estado);
  
      // Tercer mensaje
      await delay(2000);
      await sendMessageWithTypingWithState(from, textoC, 2000, context.estado);
  
      // Archivos multimedia
      await delay(2000);
      await sendWhatsAppVideo(from, mediaMapping["cabina de fotos"].videos[0]);
  
      await delay(2000);
      await sendImageMessage(from, mediaMapping["cabina de fotos"].images[0]);
  
      await delay(2000);
      await sendImageMessage(from, mediaMapping["cabina de fotos"].images[1]);
  
      await delay(2000);
      await sendImageMessage(from, mediaMapping["cabina de fotos"].images[2]);
  
      await delay(2000);
      await sendImageMessage(from, mediaMapping["cabina de fotos"].images[3]);
      
      // Botones
      await delay(2000);
      await sendInteractiveMessage(
        from,
        "¿Te gustaría continuar con el *PAQUETE MIS XV*?\n\nO prefieres armar tu Paquete Personalizado?",
        [
          { id: "si_me_interesa", title: "PAQUETE MIS XV" },
          { id: "armar_paquete", title: "Armar mi paquete" }
        ]
      );
    context.estado = "EsperandoConfirmacionPaquete";
    return true;
  }






  /* ============================================
   Interceptamos el botón "paquete_xv"
   CASO BODA
   ============================================ */
   if (messageLower === "paquete_otro") {
    // Aseguramos que la recomendación esté en el contexto
    const recomendacion = context.paqueteRecomendado;
    
    if (recomendacion) {
      // Enviar primero la imagen si existe
      if (recomendacion.media?.images?.length > 0) {
        for (const imageUrl of recomendacion.media.images) {
          await sendImageMessage(from, imageUrl);
          await delay(2500); // Pequeño delay entre imágenes
        }
      }
    
      // Luego enviar el video si existe
      if (recomendacion.media?.videos?.length > 0) {
        for (const videoUrl of recomendacion.media.videos) {
          await sendWhatsAppVideo(from, videoUrl);
          await delay(2500); // Pequeño delay entre videos
        }
      }
    
      // Enviar la recomendación de forma personalizada
      const mensajeRecomendacion = `🎉 *${recomendacion.paquete}*\n${recomendacion.descripcion}`;
      await sendMessageWithTypingWithState(from, mensajeRecomendacion, 3000, context.estado);
    
      // Enviar botones interactivos con "aceptar paquete" y "armar mi paquete"
      await sendInteractiveMessage(
        from,
        `Te gustaría continuar con el ${recomendacion.paquete}?\n\nO prefieres Armar tu Paquete?`,
        [
          { id: "si_me_interesa", title: recomendacion.paquete },
          { id: "armar_paquete", title: "Armar mi paquete" }
        ]
      );
    
      // Actualizar el estado para manejar la respuesta en el siguiente flujo
      context.estado = "EsperandoConfirmacionPaquete";
      return true;
    } else {
      await sendWhatsAppMessage(from, "No se encontró una recomendación para este paquete. Por favor, intenta nuevamente.");
      return true;
    }
  }
  


/*''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
🟢 1. INICIO: DAR LA BIENVENIDA, MOSTRAR UNA IMAGEN Y LAS OPCIONES 🟢
'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''*/
if (context.estado === "Contacto Inicial") {
  // Mensaje inicial explicando que es un asistente virtual
  await sendMessageWithTypingWithState(
    from,
    "¡Hola! 👋\n\nEstoy aquí para ayudarte",
    1500, // Retraso de 2 segundos
    "Contacto Inicial"
  );

  /*await sendMessageWithTypingWithState(
    from,
    "Te presento los Servicios que ofrecemos 🤩",
    2500, // Retraso de 2 segundos
    "Contacto Inicial"
  );*/

  // Enviar la imagen de servicios con un retraso
  /*await delay(3000); */// Retraso de 3 segundos antes de enviar la imagen
  /*await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg");

  // Enviar los botones con otro retraso
  await delay(6000);
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2024/08/Visita.jpg");*/

  // Mensaje adicional para eventos no listados
  await delay(500); // Retraso de 1.5 segundos antes de enviar el mensaje
  await sendMessageWithTypingWithState(
    from,
    "Para iniciar, dime por favor\n¿Qué tipo de evento tienes?",
    2000,
    "Contacto Inicial"
  );

  /*await sendInteractiveMessage(
    from,
    "O selecciona una Opción 👇",
    [
      { id: "evento_boda", title: "💍 Boda" },
      { id: "evento_xv", title: "🎉 XV Años" }
    ]
  );*/

  

  // Actualizar el estado del contexto
  context.estado = "EsperandoTipoEvento";
  return true;
}

/*''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
🟢 2. CAPTURAMOS EK TIPO DE EVENTO 🟢
'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''*/
 if (context.estado === "EsperandoTipoEvento" || context.estado === "EsperandoSubtipoOtroEvento") {
  // Se invoca la función que procesa la elección del cliente
  const messageLower = userMessage.toLowerCase();
  await handleTipoEvento(from, messageLower, context);
  return true;
}   

/*''''''''''''''''''''''''''''''''''''''''''''
🟢 3. ESPRAMOS LA CONFIRMACION DEL PAQUETE 🟢
''''''''''''''''''''''''''''''''''''''''''''*/
   if (context.estado === "EsperandoConfirmacionPaquete") {
    const msg = userMessage.toLowerCase();
  
    // a) si al usuario le interesa cualquier paquete
      if (msg === "si_me_interesa_sugerido" || msg === "si_me_interesa") {

      context.estado = "EsperandoFecha";
      await solicitarFecha(from, context);
      return true;
    }
      
   
    // d) cualquier otra respuesta
    else {
      await sendMessageWithTypingWithState(
        from,
        "No entendí tu respuesta. Por favor, selecciona una opción válida.",
        2000,
        context.estado
      );
      await sendInteractiveMessage(
        from,
        "Elige una opción:",
        [
          { id: "si_me_interesa", title: "Sí, me interesa" },
          { id: "armar_paquete",  title: "Armar mi paquete" }
        ]
      );
      return true;
    }
  }

/*''''''''''''''''''''''''''''''''
🟢 4. ESPERAMOS LOS SERVICIOS 🟢
''''''''''''''''''''''''''''''''*/
   if (context.estado === "EsperandoServicios") {
    // Si el usuario indica agregar o quitar en su mensaje inicial:
    if (messageLower.includes("agregar")) {
      const serviciosAAgregar = userMessage.replace(/agregar/i, "").trim();
      
      // 🟢 TRANSFORMACIÓN: "6 letras" => "letras gigantes 6", "4 chisperos" => "chisperos 4"
      serviciosAAgregar = serviciosAAgregar
        .replace(/\b(\d+)\s+letras(?:\s*gigantes)?\b/gi, 'letras gigantes $1')
        .replace(/\b(\d+)\s+chisperos?\b/gi, 'chisperos $1');

      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + serviciosAAgregar;
      await sendWhatsAppMessage(from, `✅ Se ha agregado: ${serviciosAAgregar}`);

    } else if (messageLower.includes("quitar")) {
      const serviciosAQuitar = userMessage.replace(/quitar/i, "").trim();
      context.serviciosSeleccionados = context.serviciosSeleccionados
        .split(",")
        .map(s => s.trim())
        .filter(s => !s.toLowerCase().includes(serviciosAQuitar.toLowerCase()))
        .join(", ");
      await sendWhatsAppMessage(from, `✅ Se ha quitado: ${serviciosAQuitar}`);
    } else {
      // Si el usuario pone directamente la lista sin "agregar"
      // => También se hace la TRANSFORMACIÓN antes de asignar.
      let listaServicios = userMessage;
      
      listaServicios = listaServicios
        .replace(/\b(\d+)\s+letras(?:\s*gigantes)?\b/gi, 'letras gigantes $1')
        .replace(/\b(\d+)\s+chisperos?\b/gi, 'chisperos $1');
      
      context.serviciosSeleccionados = listaServicios;
    }
  
    // Inicializamos flags para servicios sin cantidad
    context.faltanLetras = false;
    context.faltanChisperos = false;
    context.faltaVarianteCarritoShots = false;
  
    // Verificar si "letras gigantes" ya contiene un número, de lo contrario, marcar que falta la cantidad
    if (!/letras\s*gigantes\s+\d+/i.test(context.serviciosSeleccionados)) {
    context.faltanLetras = true;
    }
    // Verificar si "chisperos" está presente sin cantidad
    if (/chisperos(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
      context.faltanChisperos = true;
    }
    //Verifica si carrito de shots se escribio con la variable
    if (/carrito de shots/i.test(context.serviciosSeleccionados)) {
      if (!/carrito de shots\s+(con|sin)\s*alcohol/i.test(context.serviciosSeleccionados)) {
        context.faltaVarianteCarritoShots = true;
        // Eliminar la entrada "carrito de shots" sin variante de la cotización
        context.serviciosSeleccionados = context.serviciosSeleccionados
          .split(",")
          .map(s => s.trim())
          .filter(s => !/^carrito de shots$/i.test(s))  // Filtra entradas exactas sin variante
          .join(", ");
        
        // Cambiar el estado para preguntar la variante
        context.estado = "EsperandoTipoCarritoShots";
        await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
        return true; // Detener el flujo actual y esperar la respuesta del cliente.
      }
    } 
    // Verificar si se incluye "cabina" sin especificar tipo (de fotos o 360)
    if (/cabina(?!\s*(de fotos|360))/i.test(context.serviciosSeleccionados)) {
       context.faltaTipoCabina = true;
       // Eliminar la entrada "cabina" sin especificar de la cotización
       context.serviciosSeleccionados = context.serviciosSeleccionados
         .split(",")
         .map(s => s.trim())
         .filter(s => !/^cabina$/i.test(s))
         .join(", ");
  
        context.estado = "EsperandoTipoCabina";
        await sendWhatsAppMessage(from, "¿Deseas agregar Cabina de fotos o Cabina 360?");
        return true;
    }

    // Priorizar preguntar primero por las letras si faltan
    if (context.faltanLetras) {
      context.estado = "EsperandoCantidadLetras";
      await sendWhatsAppMessage(from, "¿Cuántas letrassss necesitas? 🔠");
      return true;
    }
  
    // Si no faltan letras pero faltan chisperos, preguntar por ellos
    if (context.faltanChisperos) {
      context.estado = "EsperandoCantidadChisperos";
      await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
      return true;
    }
  
    // Finalmente, si ya se resolvieron letras y chisperos pero falta la variante del carrito de shots
    if (context.faltaVarianteCarritoShots) {
      context.estado = "EsperandoTipoCarritoShots";
      await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
      return true;
    }
  
    // Si ya se especificaron cantidades para ambos, actualizar la cotización
    await actualizarCotizacion(from, context);
    return true;
  }

/*''''''''''''''''''''''''''''''''''''''
🟢 4.1 ESPRAMOS CANTIDAD DE CHISPEROS 🟢
''''''''''''''''''''''''''''''''''''''*/
if (context.estado === "EsperandoCantidadChisperos") {
  const cantidad = parseInt(userMessage);
  if (isNaN(cantidad) || cantidad <= 0) {
    await sendWhatsAppMessage(from, "Por favor, ingresa un número válido para la cantidad de chisperos.");
    return true;
  }

  // Verificar que la cantidad sea par
  if (cantidad % 2 !== 0) {
    await sendWhatsAppMessage(from, "Cantidad inválida. Las opciones válidas para los chisperos son cantidades pares: 2, 4, 6, 8, 10, etc.");
    return true;
  }
 
  // Regex para capturar "chisperos" con o sin número
  const regex = /chisperos(\s*\d+)?/i;
  if (regex.test(context.serviciosSeleccionados)) {
    context.serviciosSeleccionados = context.serviciosSeleccionados.replace(regex, `chisperos ${cantidad}`);
  } else {
    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + `chisperos ${cantidad}`;
  }
  await sendWhatsAppMessage(from, `✅ Se han agregado ${cantidad} chisperos.`);
  // Actualizar la cotización final
  await actualizarCotizacion(from, context);
  return true;
}

/*'''''''''''''''''''''''''''''''''''
🟢 4.2 ESPRAMOS CANTIDAD DE LETRAS 🟢
'''''''''''''''''''''''''''''''''''*/
if (context.estado === "EsperandoCantidadLetras") {
  const cantidad = parseInt(userMessage);
  if (isNaN(cantidad) || cantidad <= 0) {
    await sendWhatsAppMessage(from, "Por favor, ingresa un número válido para la cantidad de letras.");
    return true;
  }
  
  // Separar la lista de servicios por coma y limpiar espacios
  let serviciosArray = context.serviciosSeleccionados.split(",").map(s => s.trim());
  let encontrado = false;
  
  // Buscar una entrada que contenga "letras" (sin cantidad) para actualizarla
  serviciosArray = serviciosArray.map(service => {
    // Si coincide exactamente con "letras" o "letras gigantes" sin número
    if (/^letras(\s*gigantes)?$/i.test(service)) {
      encontrado = true;
      return `letras gigantes ${cantidad}`;
    }
    return service;
  });
  
  // Si no se encontró ninguna entrada para "letras", se agrega al final
  if (!encontrado) {
    serviciosArray.push(`letras gigantes ${cantidad}`);
  }
  
  // Actualizar la variable de servicios con la lista modificada
  context.serviciosSeleccionados = serviciosArray.join(", ");
  
  await sendWhatsAppMessage(from, `✅ Se han agregado ${cantidad} letras gigantes.`);
  
  // Si además faltan chisperos, cambia el estado para solicitarlos
  if (context.faltanChisperos) {
    context.estado = "EsperandoCantidadChisperos";
    await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
    return true;
  }
  
  // Si ya se tienen todos los datos, actualiza la cotización
  await actualizarCotizacion(from, context);
  return true;
}

/*''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
🟢 4.2.1 TRANSORMA A NUMERO DE LETRAS EN CASO DE ("Ocupo el nombre de...") 🟢
''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''*/
// Cuando el usuario escribe "Ocupo el nombre de [nombre]"
if (context.estado === "EsperandoDudas" && messageLower.includes("ocupo el nombre de")) {
  context.nombreCliente = userMessage.replace(/ocupo el nombre de/i, "").trim();
  const cantidadLetras = contarLetras(context.nombreCliente);
  context.estado = "ConfirmandoLetras";
  await sendWhatsAppMessage(from, `De acuerdo, entiendo que ocupas ${cantidadLetras} letras gigantes. ¿Es correcto?`);
  return true;
}

/*''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
🟢 4.2.2 EL CLIENTE CONFIRMA EL NUMERO LETRAS EN CASO DE ("Ocupo el nombre de...") 🟢
''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''*/
if (context.estado === "ConfirmandoLetras") {
  if (messageLower.includes("sí") || messageLower.includes("si")) {
    const cantidadLetras = contarLetras(context.nombreCliente);
    const regex = /letras gigantes\s*\d*/i;
    if (regex.test(context.serviciosSeleccionados)) {
      context.serviciosSeleccionados = context.serviciosSeleccionados.replace(regex, `letras gigantes ${cantidadLetras}`);
    } else {
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + `letras gigantes ${cantidadLetras}`;
    }
    await sendWhatsAppMessage(from, `✅ Se han agregado ${cantidadLetras} letras gigantes basadas en el nombre '${context.nombreCliente}'.`);
    await actualizarCotizacion(from, context);
  } else {
    // Si la respuesta es negativa, se solicita la cantidad manualmente
    context.estado = "EsperandoCantidadLetras";
    await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
  }
  return true;
}


/*'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
🟢 4.3 ESPERAMOS VARIANTE CARRITO DE SHOTS CON O SIN ALCOHOL 🟢
'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''*/
if (context.estado === "EsperandoTipoCarritoShots") {
  const respuesta = userMessage.toLowerCase();
  let varianteSeleccionada = "";
  
  if (respuesta.includes("con")) {
    varianteSeleccionada = "carrito de shots con alcohol";
  } else if (respuesta.includes("sin")) {
    varianteSeleccionada = "carrito de shots sin alcohol";
  } else {
    await sendWhatsAppMessage(from, "Por favor, responde 'con' o 'sin' para el carrito de shots.");
    return true;
  }
  
  // Verificamos si la variante seleccionada ya está en la cotización.
  if (context.serviciosSeleccionados.toLowerCase().includes(varianteSeleccionada)) {
    // Si ya está, se determina la otra variante.
    let otraVariante = (varianteSeleccionada === "carrito de shots con alcohol")
      ? "carrito de shots sin alcohol"
      : "carrito de shots con alcohol";
      
    // Si la otra variante ya está agregada, se notifica que se requieren intervención.
    if (context.serviciosSeleccionados.toLowerCase().includes(otraVariante)) {
      await sendWhatsAppMessage(from, `Ya tienes ambos tipos de carrito de shots en tu cotización. Por favor, contacta a nuestro administrador para mayor asistencia.`);
      sendMessageToAdmin("El cliente ha intentado agregar duplicados de carrito de shots.");
      context.estado = "EsperandoDudas";
      return true;
    } else {
      // Se pregunta si desea agregar la otra variante.
      context.estado = "ConfirmarAgregarCarritoShotsCambio";
      context.carritoShotsToAgregar = otraVariante;
      await sendWhatsAppMessage(from, `Ya tienes agregado ${varianteSeleccionada} en tu cotización.\n¿Deseas agregar ${otraVariante}?`);
      return true;
    }
  } else {
    // Si la variante seleccionada no está en la cotización, se agrega.
    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + varianteSeleccionada;
    await sendWhatsAppMessage(from, `✅ Se ha seleccionado ${varianteSeleccionada}.`);

    // Verificar si faltan letras o chisperos antes de mostrar la cotización
    if (/letras(?:\s*gigantes)?(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
      context.estado = "EsperandoCantidadLetras";
      await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
      return true;
    }

    if (/chisperos(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
      context.estado = "EsperandoCantidadChisperos";
      await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
      return true;
    }

    // Si no faltan letras ni chisperos, mostrar la cotización
    await actualizarCotizacion(from, context);
    context.estado = "EsperandoDudas";
    return true;
  }
}



/*''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
🟢 4.3.1 CONFIRMAMOS VARIANTE DEL CARRITO DE SHOTS CON O SIN ALCOHOL 🟢
''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''*/
if (context.estado === "ConfirmarAgregarCarritoShotsCambio") {
  const respuesta = userMessage.toLowerCase();
  if (respuesta.includes("si")) {
    // Se agrega la otra variante.
    let variante = context.carritoShotsToAgregar;
    if (!context.serviciosSeleccionados.toLowerCase().includes(variante)) {
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + variante;
      await sendWhatsAppMessage(from, `✅ Se ha agregado ${variante}.`);
      await actualizarCotizacion(from, context, "¡Paquete Personalizado actualizado!");
    }
    context.estado = "EsperandoDudas";
    return true;
  } else {
    // Si la respuesta es otra, se notifica al administrador para intervención manual.
    await sendWhatsAppMessage(from, "Entendido. Se requiere intervención para este caso.");
    sendMessageToAdmin("El cliente intentó agregar un carrito de shots adicional pero no confirmó la variante correctamente.");
    context.estado = "EsperandoDudas";
    return true;
  }
}

/*'''''''''''''''''''''''''''''''''''
🟢 4.4 ESPERAMOS EL TIPO DE CABINA 🟢
'''''''''''''''''''''''''''''''''''*/
   if (context.estado === "EsperandoTipoCabina") {
    const respuesta = userMessage.toLowerCase().trim();
    let varianteSeleccionada = "";
  
    // 1) Verificar primero si el usuario escribió "cabina de fotos" textual
    if (respuesta.includes("cabina de fotos")) {
      varianteSeleccionada = "cabina de fotos";
    }
    // 2) Verificar si escribió solo "fotos", "inflable" (que a veces lo tomas también como cabina de fotos)
    else if (respuesta.includes("fotos") || respuesta.includes("inflable")) {
      varianteSeleccionada = "cabina de fotos";
    }
    // 3) Verificar primero si el usuario escribió "cabina 360" textual
    else if (respuesta.includes("cabina 360")) {
      varianteSeleccionada = "cabina 360";
    }
    // 4) Verificar si escribió solo "360", "giratoria"
    else if (respuesta.includes("360") || respuesta.includes("giratoria")) {
      varianteSeleccionada = "cabina 360";
    } else {
      await sendWhatsAppMessage(from, "Por favor, responde 'fotos' o '360' para seleccionar el tipo de cabina.");
      return true;
    }
      
    // Verificar si la variante seleccionada ya está en la cotización.
    if (context.serviciosSeleccionados.toLowerCase().includes(varianteSeleccionada)) {
      // Si ya está, se determina la otra variante.
      let otraVariante = (varianteSeleccionada === "cabina de fotos")
        ? "cabina 360"
        : "cabina de fotos";
        
      // Si la otra variante ya está agregada, se notifica que se requiere intervención.
      if (context.serviciosSeleccionados.toLowerCase().includes(otraVariante)) {
        await sendWhatsAppMessage(from, `Ya tienes ambas variantes de cabina en tu cotización. Por favor, contacta a nuestro administrador para mayor asistencia.`);
        sendMessageToAdmin("El cliente ha intentado agregar duplicados de cabina.");
        context.estado = "EsperandoDudas";
        return true;
      } else {
        // Se pregunta si desea agregar la otra variante.
        context.estado = "ConfirmarAgregarCabinaCambio";
        context.cabinaToAgregar = otraVariante;
        await sendWhatsAppMessage(from, `Ya tienes agregada ${varianteSeleccionada} en tu cotización.\n¿Deseas agregar ${otraVariante}?`);
        return true;
      }
    } else {
      // Si la variante seleccionada no está en la cotización, se agrega.
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + varianteSeleccionada;
      await sendWhatsAppMessage(from, `✅ Se ha seleccionado ${varianteSeleccionada}.`);
  
      // Verificar si aún faltan otros datos (prioridad: letras, chisperos, carrito de shots)
      if (/letras(?:\s*gigantes)?(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
        context.estado = "EsperandoCantidadLetras";
        await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
        return true;
      }
      if (/chisperos(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
        context.estado = "EsperandoCantidadChisperos";
        await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
        return true;
      }
      if (context.faltaVarianteCarritoShots) {
        context.estado = "EsperandoTipoCarritoShots";
        await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
        return true;
      }
  
      // Si ya se tienen todos los datos, se actualiza la cotización.
      await actualizarCotizacion(from, context);
      context.estado = "EsperandoDudas";
      return true;
    }
  }

/*'''''''''''''''''''''''''''''''''''
🟢 4.4.1 CONFIRMAMOS EL TIPO DE CABINA 🟢
'''''''''''''''''''''''''''''''''''*/
if (context.estado === "ConfirmarAgregarCabinaCambio") {
  const respuesta = userMessage.toLowerCase();
  if (respuesta.includes("si")) {
    // Se agrega la otra variante.
    let variante = context.cabinaToAgregar;
    if (!context.serviciosSeleccionados.toLowerCase().includes(variante)) {
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + variante;
      await sendWhatsAppMessage(from, `✅ Se ha agregado ${variante}.`);
      await actualizarCotizacion(from, context, "¡Paquete Personalizado actualizado!");
    }
    context.estado = "EsperandoDudas";
    return true;
  } else {
    // Si la respuesta no es afirmativa, se notifica al administrador para intervención manual.
    await sendWhatsAppMessage(from, "Entendido. Se requiere intervención para este caso.");
    sendMessageToAdmin("El cliente intentó agregar duplicados de cabina, pero no confirmó la adición de la otra variante correctamente.");
    context.estado = "EsperandoDudas";
    return true;
  }
}

/*'''''''''''''''''''''''''''''''''''''''''''''''''''
🟢 5. ESPERANDO DUDAS, AGREGAR O QUITAR SERVICIOS 🟢
'''''''''''''''''''''''''''''''''''''''''''''''''''*/
 if (context.estado === "EsperandoDudas") {
  // --- Manejo de quitar servicios ---
  if (messageLower.includes("quitar")) {
    const serviciosDisponibles = [
      "cabina de fotos", "cabina 360", "lluvia de mariposas", "carrito de shots con alcohol", "carrito de shots sin alcohol",
      "niebla de piso", "lluvia matálica", "scrapbook", "audio guest book",
      "letras gigantes", "chisperos"
    ];
    let servicioAQuitar = null;
    for (const servicio of serviciosDisponibles) {
      if (servicio === "letras gigantes" && messageLower.includes("letras")) {
        servicioAQuitar = "letras gigantes";
        break;
      } else if (servicio === "chisperos" && (messageLower.includes("chispero") || messageLower.includes("chisperos"))) {
        servicioAQuitar = "chisperos";
        break;
      } else if (messageLower.includes(servicio)) {
        servicioAQuitar = servicio;
        break;
      }
    }
    if (servicioAQuitar) {
      const matchCantidad = userMessage.match(/(?:quitar|quitame)\s*(\d+)\s*/i);
      const cantidadAQuitar = matchCantidad ? parseInt(matchCantidad[1]) : null;
      if (cantidadAQuitar !== null && (servicioAQuitar === "letras gigantes" || servicioAQuitar === "chisperos")) {
        const regex = new RegExp(`${servicioAQuitar}\\s*(\\d+)`, "i");
        const matchActual = context.serviciosSeleccionados.match(regex);
        let cantidadActual = matchActual ? parseInt(matchActual[1]) : 0;
        if (cantidadAQuitar > cantidadActual) {
          await sendWhatsAppMessage(from, `No puedes quitar más de ${cantidadActual} ${servicioAQuitar}.`);
          return true;
        }
        const nuevaCantidad = cantidadActual - cantidadAQuitar;
       
        // Si se trata de chisperos, la nueva cantidad debe ser 0 o par
      if (servicioAQuitar === "chisperos" && nuevaCantidad > 0 && nuevaCantidad % 2 !== 0) {
        await sendWhatsAppMessage(from, "Cantidad inválida. Las opciones válidas para los chisperos son cantidades pares: 2, 4, 6, 8, 10, etc. No se ha actualizado la cotización.");
        return true;
      }

        if (nuevaCantidad > 0) {
          context.serviciosSeleccionados = context.serviciosSeleccionados.replace(regex, `${servicioAQuitar} ${nuevaCantidad}`);
          await sendWhatsAppMessage(from, `✅ Se han quitado ${cantidadAQuitar} ${servicioAQuitar}. Ahora tienes ${nuevaCantidad}.`);
        } else {
          context.serviciosSeleccionados = context.serviciosSeleccionados.split(",")
            .map(s => s.trim())
            .filter(s => !s.toLowerCase().includes(servicioAQuitar))
            .join(", ");
          await sendWhatsAppMessage(from, `✅ Se han eliminado todos los ${servicioAQuitar}.`);
        }
      } else {
        // Si no se especifica cantidad, se elimina el servicio completo
        context.serviciosSeleccionados = context.serviciosSeleccionados.split(",")
          .map(s => s.trim())
          .filter(s => !s.toLowerCase().includes(servicioAQuitar))
          .join(", ");
        await sendWhatsAppMessage(from, `✅ ${servicioAQuitar.charAt(0).toUpperCase() + servicioAQuitar.slice(1)} eliminado de tu cotización.`);
      }
      await actualizarCotizacion(from, context, "¡Paquete Personalizado actualizado!");
      return true;
    } else {
      await sendWhatsAppMessage(from, "No entendí qué servicio deseas quitar. Por favor, escribe: 'Quitar y el servicio que deseas quitar'");
      return true;
    }
  }
  
  // --- Manejo de agregar servicios --- 
  if (messageLower.includes("agregar")) {
    const serviciosDisponibles = [
      "cabina de fotos", "cabina 360", "lluvia de mariposas", "carrito de shots con alcohol", "carrito de shots sin alcohol",
      "niebla de piso", "lluvia matálica", "scrapbook", "audio guest book",
      "letras gigantes", "chisperos"
    ];
    let servicioAAgregar = null;
    for (const servicio of serviciosDisponibles) {
      if (servicio === "letras gigantes" && messageLower.includes("letras")) {
        servicioAAgregar = "letras gigantes";
        break;
      } else if (servicio === "chisperos" && (messageLower.includes("chispero") || messageLower.includes("chisperos"))) {
        servicioAAgregar = "chisperos";
        break;
      } else if (messageLower.includes(servicio)) {
        servicioAAgregar = servicio;
        break;
      }
    }

     // Si el mensaje contiene "agregar carrito de shots", se activa el flujo específico:
     if (messageLower.includes("agregar carrito de shots")) {
      context.estado = "EsperandoTipoCarritoShots";
    await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
    return true;
    }

    // Caso especial: "agregar cabina" sin especificar tipo
  if (messageLower.includes("agregar cabina") && !messageLower.includes("cabina de fotos") && !messageLower.includes("cabina 360")) {
    context.estado = "EsperandoTipoCabina";
    await sendWhatsAppMessage(from, "¿Deseas agregar Cabina de fotos o Cabina 360?");
    return true;
  }
    
    if (servicioAAgregar) {
      // Verificar si ya está agregado en la cotización
      const regex = new RegExp(`${servicioAAgregar}(\\s*\\d+)?`, "i");
      if (regex.test(context.serviciosSeleccionados)) {
        await sendWhatsAppMessage(from, `Ya tienes agregado ${servicioAAgregar} en tu cotización.`);
        return true;
      }
      
      // Para "chisperos" y "letras gigantes", si no se especifica cantidad, se solicita al usuario
      const matchCantidad = userMessage.match(/(?:agregar|añadir)\s*(\d+)\s*/i);
      if ((servicioAAgregar === "chisperos" || servicioAAgregar === "letras gigantes") && !matchCantidad) {
        if (servicioAAgregar === "chisperos") {
          context.estado = "EsperandoCantidadChisperos";
          await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
        } else if (servicioAAgregar === "letras gigantes") {
          context.estado = "EsperandoCantidadLetras";
          await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
        }
        return true;
      }
      
      // Si ya se especificó la cantidad, se extrae
      const cantidadAAgregar = matchCantidad ? parseInt(matchCantidad[1]) : 1;
    
      if (cantidadAAgregar <= 0) {
        await sendWhatsAppMessage(from, "La cantidad a agregar debe ser mayor que cero.");
        return true;
      }
 
      
      // Se agrega el servicio a la cotización
      context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + `${servicioAAgregar} ${cantidadAAgregar}`;
      await sendWhatsAppMessage(from, `✅ Se ha agregado ${cantidadAAgregar} ${servicioAAgregar}.`);
      await actualizarCotizacion(from, context);
      return true;
    } else {
      // Si no se reconoce el servicio a agregar
      await sendWhatsAppMessage(from, "No entendí qué servicio deseas agregar. Por favor, escribe: 'Agregar y el servicio que deseas agregar'");
      return true;
    }
  }
}

/*''''''''''''''''''''''''''''''''''''''
🟢 6. PROCESAMOS LA FECHA DEL EVENTO 🟢
''''''''''''''''''''''''''''''''''''''*/
if (context.estado === "EsperandoFecha") {
  // Validar el formato extendido de la fecha (acepta "DD/MM/AAAA" o "20 de mayo 2025")
  if (!isValidDateExtended(userMessage)) {
    await sendMessageWithTypingWithState(
      from,
      "😕 El formato de la fecha es incorrecto. Por favor, utiliza el formato:\n\nDD/MM/AAAA o\n\n*20 de mayo 2025*",
      2000,
      context.estado
    );
    return true; // Se mantiene en "EsperandoFecha"
  }

  // Validar que la fecha sea futura (no haya pasado)
  if (!isValidFutureDate(userMessage)) {
    await sendMessageWithTypingWithState(
      from,
      "La fecha ingresada ya pasó. Por favor, ingresa una fecha futura.",
      2000,
      context.estado
    );
    return true;
  }

  // Validar que la fecha esté dentro de los próximos 2 años
  if (!isWithinTwoYears(userMessage)) {
    await sendMessageWithTypingWithState(
      from,
      "La agenda aún no está abierta para esa fecha. Por favor, ingresa una fecha dentro de los próximos 2 años.",
      2000,
      context.estado
    );
    return true;
  }

  // Convertir la fecha al formato DD/MM/AAAA utilizando parseFecha
  const fechaDDMMYYYY = parseFecha(userMessage);
  // Formatear la fecha a "DD de Mes AAAA"
  const formattedDate = formatFechaEnEspanol(fechaDDMMYYYY);

  // Verificar disponibilidad de la fecha (simulado)
  if (!checkAvailability(formattedDate)) {
    await sendMessageWithTypingWithState(
      from,
      "😔 Lo siento, esa fecha ya está reservada. Prueba con otra o contáctanos para más detalles.",
      2000,
      context.estado
    );
    return true;
  }

  // Si todas las validaciones son exitosas, guardar la fecha en el contexto
  context.fecha = formattedDate;
  
  // Cambiar el estado para solicitar el lugar del evento
  context.estado = "EsperandoLugar";

  // Solicitar el lugar del evento, mostrando la fecha registrada
  await sendMessageWithTypingWithState(
    from,
    `¡Perfecto!\n\n*${formattedDate}*\nDISPONIBLE 👏👏👏\n\nAhora, indicame por favor el nombre del Salon donde se realizará tu evento 🏢`,
    2000,
    context.estado
  );
  return true;
}

/*''''''''''''''''''''''''''''''''''''''''''
🟢 7. PROCESAMOS LA UBICACION DEL EVENTO 🟢
''''''''''''''''''''''''''''''''''''''''''*/
if (context.estado === "EsperandoLugar") {
  // Guardar el lugar ingresado
  context.lugar = userMessage;
  
 
  // Mensaje 1: Explicación del anticipo para separar la fecha
  await sendMessageWithTypingWithState(
    from,
    "ℹ️ IMPORTANTE\n\nPara separar la fecha ✅ solicitamos un anticipo de $500, el resto puede ser el día del evento.",
    4000,
    context.estado
  );
  
  // Enviar mensaje con datos para transferencia y una imagen (ajusta la URL y texto según convenga)
 
  await sendImageMessage(
    from,
    "http://cami-cam.com/wp-content/uploads/2025/03/Datos-Transferencia-1.jpeg", "722969010494399671",
    5000,
    context.estado
  );
  
  
  // Mensaje 2: Explicación del siguiente paso una vez acreditado el anticipo
  await sendMessageWithTypingWithState(
    from,
    "Una vez acreditado el anticipo, pediré tu nombre completo y los datos que hagan falta.\n\nLleno tu contrato 📃 y te envío foto.",
    5000,
    context.estado
  );
  
  // Enviar mensaje interactivo con botón "Preguntas frecuentes"
  await sendWhatsAppMessage(
    from,
    "❓ Aqui puedes consultar algunas Preguntas Frecuentes:👇\nhttps://cami-cam.com/preguntas-frecuentes/",
    4000,
    context.estado
  );
  
  // Mensaje final de cierre del flujo
  await sendMessageWithTypingWithState(
    from,
    "Y si tienes alguna duda adicional, por favor con toda confianza.\n\nMi nombre es Gustavo González y estoy a tus órdenes 😀",
    4000,
    context.estado
  );
  
  // Actualizar el estado para finalizar el flujo
  context.estado = "Finalizado";
  return true;
}

/*''''''''''''''''''''''''''''''''''''''''''''''''''''
🟢 8. FINALIZAMOS EL FLUJO, OPEN AI YA NO RESPONDE 🟢
''''''''''''''''''''''''''''''''''''''''''''''''''''*/
if (context.estado === "Finalizado") {
  console.log("El flujo está finalizado. No se enviará la pregunta a OpenAI.");
  return true; 
}

/*''''''''''''''''''''''''''''''''''''''''''''''''
🟢 9. EN OTROS CASOS, RESPONDEMOS CON OPEN AI 🟢
''''''''''''''''''''''''''''''''''''''''''''''''*/
  try {
    function getCacheKey(query) {
      return query.toLowerCase();
    }
    async function getResponseFromOpenAI(query) {
      const contextoPaquetes = construirContexto();
      const fullQuery = `
  ${contextoPaquetes}
  
  El cliente dice: "${query}"
  Responde de forma clara y corta, profesional y cercana, utilizando el contexto proporcionado.
      `;
      const key = getCacheKey(fullQuery);
      const cachedResponse = responseCache.get(key);  // Uso de la instancia global
      if (cachedResponse) {
        console.log("Usando respuesta en caché para la consulta:", fullQuery);
        return cachedResponse;
      }
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Eres un asesor de ventas amigable y cercano en servicios para eventos. Responde de forma breve, clara y natural." },
          { role: "user", content: fullQuery }
        ],
        temperature: 0.7,
        max_tokens: 80,
      });
      const answer = response.choices[0].message.content;
      if (!answer || answer.trim() === "") {
        throw new Error("Respuesta vacía");
      }
      responseCache.set(key, answer); 
      return answer;
    }
    async function handleOpenAIResponse(from, userMessage) {
      try {
        const answer = await getResponseFromOpenAI(userMessage);
        await sendWhatsAppMessage(from, answer);
        if (answer.includes("Lamentablemente, la información proporcionada no incluye detalles")) {
          const adminMessage = `El cliente ${from} preguntó: "${userMessage}" y la respuesta fue: "${answer}". Se requiere intervención humana.`;
          await sendWhatsAppMessage(process.env.ADMIN_WHATSAPP_NUMBER, adminMessage);
        }
      } catch (error) {
        console.error("Error de OpenAI:", error.message);
        const adminMessage = `El cliente ${from} preguntó: "${userMessage}" y OpenAI no pudo responder. Se requiere intervención humana.`;
        await sendWhatsAppMessage(process.env.ADMIN_WHATSAPP_NUMBER, adminMessage);
        await sendWhatsAppMessage(from, "Tu consulta requiere la intervención de un agente. Pronto nos pondremos en contacto contigo.");
      }
    }
    await handleOpenAIResponse(from, userMessage);
    return true;
  } catch (error) {
    console.error("❌ Error en handleUserMessage:", error.message);
    await sendWhatsAppMessage(from, "😔 Perdona, ocurrió un error inesperado. Por favor, inténtalo de nuevo.");
    return false;
  }  
}

/*''''''''''''''''''''''''
🟢 INICIAR EL SERVIDOR 🟢
''''''''''''''''''''''''*/
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});



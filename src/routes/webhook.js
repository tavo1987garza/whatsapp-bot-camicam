// src/routes/webhook.js Define las rutas y endpoints.
import { Router } from 'express';
import {
  verifyWebhook,      // Verificación inicial del webhook
  handleRoot,         // Ruta raíz de prueba (envío de mensaje de prueba)
  testInteractive,    // Ruta para probar mensajes interactivos
  processWebhook,     // Procesa los mensajes entrantes de WhatsApp
  enviarMensajeFromCRM // Recibe mensajes del CRM y los reenvía a WhatsApp
} from '../controllers/messageController.js';

const router = Router();

// Verificación del webhook (GET /webhook)
router.get('/webhook', verifyWebhook);

// Ruta raíz de prueba (GET /)
router.get('/', handleRoot);

// Ruta para enviar mensajes interactivos de prueba (GET /test-interactive)
router.get('/test-interactive', testInteractive);

// Webhook para recibir mensajes desde WhatsApp (POST /webhook)
router.post('/webhook', processWebhook);

// Endpoint para recibir mensajes desde el CRM y reenviarlos a WhatsApp (POST /enviar_mensaje)
router.post('/enviar_mensaje', enviarMensajeFromCRM);

export default router;

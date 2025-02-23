// src/routes/webhook.js Define las rutas y endpoints.
import { Router } from 'express';
import {
  verifyWebhook,
  handleRoot,
  testInteractive,
  processWebhook
} from '../controllers/messageController.js';

const router = Router();

// Ruta de verificación del webhook
router.get('/webhook', verifyWebhook);

// Ruta raíz (prueba)
router.get('/', handleRoot);

// Ruta para mensajes interactivos de prueba
router.get('/test-interactive', testInteractive);

// Webhook para recibir mensajes de WhatsApp
router.post('/webhook', processWebhook);

// Puedes agregar aquí otras rutas, por ejemplo, para enviar mensajes desde el CRM
// router.post('/enviar_mensaje', enviarMensajeCRM);

export default router;

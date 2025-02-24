// index.js Punto de entrada de la aplicación.
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import webhookRoutes from './src/routes/webhook.js';

dotenv.config(); // Carga las variables de entorno

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(bodyParser.json());

// Usar las rutas del webhook
app.use('/', webhookRoutes);

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
});
 
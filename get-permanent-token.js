// get-permanent-token.js
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function getPermanentToken() {
    const APP_ID = process.env.META_APP_ID;
    const APP_SECRET = process.env.META_APP_SECRET;
    const SHORT_LIVED_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

    console.log('🔍 Iniciando generación de token permanente...');
    console.log('App ID:', APP_ID ? '✅ Presente' : '❌ Faltante');
    console.log('App Secret:', APP_SECRET ? '✅ Presente' : '❌ Faltante');
    console.log('Token actual:', SHORT_LIVED_TOKEN ? '✅ Presente' : '❌ Faltante');

    if (!APP_ID || !APP_SECRET || !SHORT_LIVED_TOKEN) {
        console.log('❌ Faltan variables en el archivo .env');
        return null;
    }

    try {
        const url = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${SHORT_LIVED_TOKEN}`;
        
        console.log('🔄 Solicitando token permanente...');
        const response = await axios.get(url);

        const newToken = response.data.access_token;
        const expiresIn = response.data.expires_in;

        console.log('\n🎉 ¡TOKEN PERMANENTE GENERADO EXITOSAMENTE!');
        console.log('🔑 Nuevo token:', newToken);
        console.log('⏰ Expira en:', Math.floor(expiresIn / 86400), 'días');
        
        console.log('\n💡 INSTRUCCIONES:');
        console.log('1. Copia el token de arriba');
        console.log('2. Actualiza en Heroku: heroku config:set WHATSAPP_ACCESS_TOKEN="tu_nuevo_token"');

        return newToken;

    } catch (error) {
        console.error('❌ Error generando token permanente:');
        
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Error de Facebook:', error.response.data);
            
            if (error.response.status === 400) {
                console.log('⚠️ Posibles causas:');
                console.log('- Token temporal expirado');
                console.log('- App ID o Secret incorrectos');
                console.log('- El token ya es permanente');
            }
        } else {
            console.log('Error de conexión:', error.message);
        }
        return null;
    }
}

// Ejecutar solo si se llama directamente
if (process.argv[1].includes('get-permanent-token.js')) {
    getPermanentToken().then(token => {
        if (token) {
            console.log('\n📋 Comando para Heroku:');
            console.log(`heroku config:set WHATSAPP_ACCESS_TOKEN="${token}"`);
        } else {
            console.log('\n❌ No se pudo generar el token permanente');
            process.exit(1);
        }
    });
}

export { getPermanentToken };
// 📌 Función para enviar mensajes interactivos con botones
async function sendInteractiveMessage(to, body, buttons) {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: {
                text: body
            },
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

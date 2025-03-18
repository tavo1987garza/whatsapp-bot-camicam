async function actualizarCotizacion(from, context, mensajePreliminar = null) {
  const cotizacion = calculateQuotation(context.serviciosSeleccionados);
  const cabecera = mensajePreliminar ? mensajePreliminar : "💰 *Tu cotización:*";
  const mensajeDetalles = `${cabecera}\n\n` + cotizacion.details.join("\n");

  await sendMessageWithTypingWithState(from, mensajeDetalles, 2000, context.estado);
  await delay(2000);

  const mensajeResumen = `Subtotal: $${cotizacion.subtotal.toLocaleString()}\nDescuento (${cotizacion.discountPercent}%): -$${cotizacion.discountAmount.toLocaleString()}\n*TOTAL A PAGAR: $${cotizacion.total.toLocaleString()}*`;
  await sendMessageWithTypingWithState(from, mensajeResumen, 2000, context.estado);

  // Envío de imágenes y videos solo para nuevos servicios (no se reenvían si ya fueron enviados)
  await delay(4000);
  if (cotizacion.servicesRecognized && cotizacion.servicesRecognized.length > 0) {
    for (const service of cotizacion.servicesRecognized) {
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
        if (!context.mediosEnviados) context.mediosEnviados = new Set();
        context.mediosEnviados.add(service);
      }
    }
  }

  await delay(2000);
  await sendMessageWithTypingWithState(
    from,
    "Si deseas modificar tu cotización escribe: \n\n*Agregar* y agrega lo que necesites.\n\n*Quitar* para quitar lo que no necesites. 😊",
    2000,
    context.estado
  );
  context.estado = "EsperandoDudas";
}
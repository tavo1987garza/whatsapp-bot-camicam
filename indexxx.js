if (context.estado === "EsperandoCantidadChisperos") {
  const cantidad = parseInt(userMessage);
  if (isNaN(cantidad) || cantidad <= 0) {
    await sendWhatsAppMessage(from, "Por favor, ingresa un número válido para la cantidad de chisperos.");
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
  await actualizarCotizacion(from, context, "¡Perfecto! Hemos actualizado tu cotización:");
  return true;
}



await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
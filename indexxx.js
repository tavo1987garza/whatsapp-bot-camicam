if (context.estado === "EsperandoConfirmacionPaqueteOtroEvento") {
  const messageLower = userMessage.toLowerCase();
  // Si el usuario acepta el paquete recomendado
  if (messageLower.includes("aceptar_paquete")) {
    await sendMessageWithTypingWithState(
      from,
      "¡Excelente! Hemos agregado el paquete recomendado a tu cotización.",
      2000,
      context.estado
    );
    // Procede a solicitar la fecha del evento
    await solicitarFecha(from, context);
    context.estado = "EsperandoFecha";
  }
  // Si el usuario prefiere armar su paquete personalizado
  else if (messageLower.includes("armar_paquete")) {
    await sendMessageWithTypingWithState(
      from,
      "¡Perfecto! Vamos a armar tu paquete personalizado. Por favor, indícame los servicios que deseas incluir.",
      2000,
      context.estado
    );
    context.estado = "EsperandoServicios";
  }
  // En caso de no reconocer la respuesta, se reenvían los botones
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
        { id: "aceptar_paquete", title: "Sí, quiero este paquete" },
        { id: "armar_paquete", title: "Armar mi paquete" }
      ]
    );
  }
  return true;
}
  //Manipula el Boton "Continuar"
  if (context.estado === "EsperandoDudas" && messageLower === "continuar") {
    // Lógica para continuar con el flujo
    await sendMessageWithTypingWithState(
      from,
      "¡Perfecto! Para continuar, por favor indícame la fecha de tu evento (Formato DD/MM/AAAA) 📆.",
      2000,
      "EsperandoFecha" // Cambia al siguiente estado
    );
    context.estado = "EsperandoFecha"; // Actualiza el estado
    return true;
  }



  // Enviar mensaje con botón "CONTINUAR"
await sendInteractiveMessage(
  from,
  "O toca el botón para continuar:",
  [
    { id: "continuar", title: "CONTINUAR" } 
  ]
);
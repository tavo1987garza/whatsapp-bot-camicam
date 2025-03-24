async function handleTipoEvento(from, messageLower, context) {
    // Caso Boda
    if (messageLower.includes("boda") || messageLower.includes("evento_boda")) {
      context.tipoEvento = "Boda";
      // GUARDAR el objeto
      context.paqueteRecomendado = {
        paquete: "PAQUETE WEDDING",
        descripcion: "🎉Incluye Cabina 360, iniciales decorativas, 2 chisperos y un carrito de shots con alcohol, todo por *$4,450*",
        // puedes agregar más campos si gustas (precio, etc.)
      };
    
      // Luego envías los botones
      await sendInteractiveMessage(
        from,
        `¡Muchas felicidades! Tu Boda será increíble!! ✨\n\n
    Te presento el paquete que estamos promocionando:\n\n🎉 *${context.paqueteRecomendado.paquete}*: ${context.paqueteRecomendado.descripcion}.\n\n
    Te gustaría contratar el *${context.paqueteRecomendado.paquete}* o prefieres Armar tu Paquete?`,
        [
          { id: "si_me_interesa", title: "PAQUETE WEDDING" },
          { id: "armar_paquete", title: "🛠️ Armar mi paquete" }
        ]
      );
      context.estado = "OpcionesSeleccionadas";
    }
    // Caso XV
    else if (messageLower.includes("xv") || messageLower.includes("quince")) {
      context.tipoEvento = "XV";
    
    
      // Texto del PAQUETE MIS XV
      context.paqueteRecomendado = {
        paquete: "PAQUETE MIS XV"
      };

      
  // PARTE 1
  const textoA = `
¡Muchas felicidades! 👏
  
Tu fiesta de XV años será Inolvidable!! ✨

Te presento el paquete que estamos promocionando:

*PAQUETE MIS XV*

    Incluye: 
🔸 Cabina de fotos (3 Horas) 
🔸 6 letras Gigantes (5 Horas)
🔸 Niebla de piso ó 
    Lluvia de mariposas 
   
      por tan sólo

     ✨ $8,900 ✨

¡Contrata ahora y recibe de REGALO!
  
🔸 2 Chisperos de luz fría
  
Con un valor de $1,000
  
     *¡¡Pero espera!!*
  
¡Solo este mes disfruta de un *30% DE DESCUENTO*!
`;
  
    // PARTE 2
    const textoB = `
¡¡Y eso no es todo!! 

A los primeros 10 contratos les estaremos Regalando 
  
🔸 1 Scrapbook personalizado para la cabina de fotos
  
Con un valor de $1,300

¡Te lo llevamos Completamente Gratis!

¡Será un recuerdo muy bonito de tu evento!
  
Si contrataras todo por separado el precio Regular sería de $11,200
  
*¡¡SOLO HOY CONTRATA TODO POR TAN SOLO!!*
  
      ✨ *$6,230* ✨
  
Flete Incluido!! a una distancia de 20 km del centro de Monterrey
  
    En Resumen:
🔸 Cabina de fotos (3 Horas)
🔸 6 letras Gigantes (5 Horas)
🔸 Niebla de piso ó 
    Lluvia de mariposas 
🔸 2 Chisperos de luz fría
🔸 1 Scrapbook
🔸 Descuento de $2,670
🔸 Flete Incluido
  
*¡¡SOLO HOY CONTRATA TODO POR TAN SOLO!!*
  
      ✨ *$6,230* ✨
  
¡¡Aprovecha esta oportunidad!!
  
Revisa Disponibilidad ahora y asegura tu paquete antes de que te ganen la fecha
  
  `;
    
      // (1) Enviar imagen (opcional)
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2023/10/PAQUETE-MIS-XV-2.jpg");
  await delay(2000);

  // 2) Enviar la primera parte de texto
  await sendMessageWithTypingWithState(from, textoA, 2000, context.estado);

  await delay(2000);

  // 3) Enviar la segunda parte de texto
  await sendMessageWithTypingWithState(from, textoB, 2000, context.estado);
    
   // Enviar imagenes u videos del paquete
  await sendImageMessage(from, "http://cami-cam.com/wp-content/uploads/2023/10/PAQUETE-MIS-XV-2.jpg");
  await delay(2000);
 
    
    
      // Al mostrar los botones, usas la misma propiedad
      await sendInteractiveMessage(
        from,
        `Te gustaría continuar con el *PAQUETE MIS XV*?\n\nO prefieres Armar tu paquete? 👇`,
        [
          { id: "si_me_interesa", title: "PAQUETE MIS XV" },
          { id: "armar_paquete", title: "🛠️ ARMAR MI PAQUETE" }
        ]
      );
    
      context.estado = "OpcionesSeleccionadas";
      return true;
    }
    
    // Caso "Otro"
    else {
      // Obtener la recomendación basada en el tipo de evento escrito por el usuario
      const recomendacion = getOtherEventPackageRecommendation(messageLower);
  
      // Guardar en el contexto el paquete recomendado para posteriores referencias
      context.paqueteRecomendado = recomendacion;
  
      // Enviar la recomendación de forma personalizada
      const mensajeRecomendacion = `🎉 *${recomendacion.paquete}*\n${recomendacion.descripcion}\n\nTe interesa contratar el ${recomendacion.paquete} o prefieres Armar tu Paquete?`;
      await sendMessageWithTypingWithState(from, mensajeRecomendacion, 2000, context.estado);
  
      // Enviar botones interactivos con "aceptar paquete" y "armar mi paquete"
      await sendInteractiveMessage(from, "Elige una opción:", [
        { id: "si_me_interesa", title: "CONTRATAR" },
        { id: "armar_paquete", title: "Armar mi paquete" }
      ]);
     
      // Actualizar el estado para manejar la respuesta en el siguiente flujo
      context.estado = "EsperandoConfirmacionPaquete";
    } 
  }
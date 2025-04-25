
// FAQs con emojis y nuevos servicios
const faqs = [
    { question: /hacen contrato|contrato/i, answer: "📄 ¡Sí! Una vez que se acredite el anticipo, llenamos el contrato y te enviamos una foto." },
    { question: /con cuanto tiempo separo mi fecha|separar/i, answer: "⏰ Puedes separar tu fecha en cualquier momento, siempre y cuando esté disponible." },
    { question: /se puede separar para 2026|2026/i, answer: "📆 Claro, tenemos agenda para 2025 y 2026. ¡Consulta sin compromiso!" },
    { question: /cuánto se cobra de flete|flete/i, answer: "🚚 El flete varía según la ubicación. Contáctanos y lo calculamos juntos." },
    { question: /cómo reviso si tienen mi fecha disponible/i, answer: "🔎 Cuéntame, ¿para cuándo es tu evento? Así reviso la disponibilidad." },
    { question: /ubicación|dónde están|donde son|ubican|oficinas/i, answer: "📍 Nos encontramos en la Colonia Independencia en Monterrey. Cubrimos hasta 30 km a la redonda." },
    { question: /pago|método de pago|tarjeta|efectivo/i, answer: "💳 Aceptamos transferencias, depósitos y pagos en efectivo. ¡Lo que te resulte más cómodo!" },
    { 
      question: /que servicios manejas|servicios/i, 
      answer: "🎉 Aquí tienes nuestros servicios:",
      imageUrl: "http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg" 
    },
    { 
      question: /con cuánto se separa|con cuanto separo|como se separa|como separo|para separar|cuanto de anticipo/i, 
      answer: "⏰ Puedes separar tu fecha en cualquier momento, siempre y cuando esté disponible.\n\nSeparamos fecha con $500, el resto puede ser ese dia, al inicio del evento.\n\nUna vez acreditado el anticipo solo pedire Nombre y los datos del evento, lleno tu contrato y te envío foto.\n\nSi tienes una vuelta para el centro de Monterrey me avisas para entregarte tu contrato original"    
    },
    /*{
      question: /me interesa\b/i, // Coincide con "me interesa" pero no con "Sí, me interesa"
      answer: "Genial!! \n\nPara continuar por favor indicame la fecha de tu evento para revisar disponibilidad "
    },*/  
    { 
      question: /para depositarte|datos para deposito|transfiero|transferencia|depositar|depósito/i, 
      imageUrl: "http://cami-cam.com/wp-content/uploads/2025/03/Datos-Transferencia-1.jpeg", 
      answer: "722969010494399671"
    },
    { 
      question: /que incluye la cabina de fotos|cabina de fotos/i, 
      answer: "📸 La CABINA DE FOTOS incluye 3 horas de servicio, iluminación profesional, fondo personalizado, accesorios temáticos y más.",
      images: [
        "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg",
        "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-2.jpg",
        "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-3.jpg",
        "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-4.jpg",
        "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-multicolor-2.jpeg"
      ],
      videos: [
        "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Blanca.mp4",
        "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Rosa.mp4",
        "http://cami-cam.com/wp-content/uploads/2025/03/cabina-multicolor.mp4"
      ]
    },
    { 
      question: /que es el scrapbook|scrapbook/i, 
      answer: "📚 El Scrapbook es un álbum interactivo donde tus invitados pegan una de las fotos de la cabina y escriben un lindo mensaje para que recuerdes cada detalle.",
      images: [
        "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-4.jpeg",
        "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-3.jpeg",
        "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-2.jpeg",
        "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-5.jpeg",
        "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-7.jpeg",
        "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-6.jpeg"
      ],
      videos: [
        "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook.mp4"  
      ]
    }
  ];


  // Objeto para asociar servicios a medios (imágenes y videos)
const mediaMapping = {
    "cabina de fotos": {
      images: [
        "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg",
        "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-2.jpg"
      ],
      videos: [
        "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Blanca.mp4"
      ]
    },
    "cabina 360": {
      images: [
        "http://cami-cam.com/wp-content/uploads/2023/05/INCLUYE-1.jpg"
      ],
      videos: [
        "http://cami-cam.com/wp-content/uploads/2025/03/Cabina-Rosa.mp4"
      ]
    },
    "lluvia de mariposas": {
      images: [
        "http://cami-cam.com/wp-content/uploads/2023/07/lluvia1.jpg"
      ],
      videos: []
    },
    "carrito de shots con alcohol": {
      images: [
        "http://cami-cam.com/wp-content/uploads/2023/07/carrito1.jpg"
      ],
      videos: []
    },
    "niebla de piso": {
      images: [
        "http://cami-cam.com/wp-content/uploads/2023/07/niebla1.jpg"
      ],
      videos: []
    },
    "scrapbook": {
      images: [
        "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook-4.jpeg"
      ],
      videos: [
        "http://cami-cam.com/wp-content/uploads/2025/03/Scrapbook.mp4"
      ]
    },
    "audio guest book": {
      images: [
        "http://cami-cam.com/wp-content/uploads/2023/07/audio1.jpg"
      ],
      videos: []
    },
    "letras gigantes": {
      images: [
        "http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"
      ],
      videos: [
        "http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"
      ]
    },
    "chisperos": {
      images: [
        "http://cami-cam.com/wp-content/uploads/2023/07/chisperos1.jpg"
      ],
      videos: []
    }
  };






/***************************************************
FUNCION para identificar el subtipo de evento 
y devolver una recomendación de paquete.
 ****************************************************/
function getOtherEventPackageRecommendation(userMessage) {
    const mensaje = userMessage.toLowerCase();
  
    // Detectar cumpleaños: se pueden buscar números o palabras como "cumpleaños"
     if (/cumpleaños|numero|numeros|#|número|números|birthday|\b\d+\b/.test(mensaje)) {
      return {
        paquete: "PAQUETE NÚMEROS",
        descripcion: "Nuestros números son ideales para cumpleaños. Miden 1.20 mts de alto, están pintados de blanco y los focos son de luz led con 83 secuencias de distintos colores, también se pueden programar en una sola secuencia. El 'Paquete Números' incluye 2 números gigantes por un precio de $600, más flete dependiendo de la ubicación de tu evento.",
        media: {
          images: ["http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"],
          videos: ["http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"]
        }
      };
    }
    // Detectar revelación de género
   else if (/revelación de género|revelacion|baby|oh baby|girl|boy/.test(mensaje)) {
    return {
      paquete: "PAQUETE REVELACION",
      descripcion: "Ideal para eventos de revelación de género, con letras decorativas y opciones que resaltan 'BABY', 'OH BABY' o 'GIRL BOY'.",
      media: {
        images: ["http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"],
        videos: ["http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"]
      }
    };
  }
  // Detectar propuesta
  else if (/propuesta|casate|casar|cásate conmigo|pedir matrimonio|marry me/.test(mensaje)) {
    return {
      paquete: "PAQUETE MARRY ME",
      descripcion: "Perfecto para una propuesta inolvidable, con letras románticas y personalizadas que dicen 'MARRY ME'.",
      media: {
        images: ["http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"],
        videos: ["http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"]
      }
    };
  }
  // Detectar graduación
  else if (/graduación|grad|class|gen\b/.test(mensaje)) {
    return {
      paquete: "PAQUETE GRADUACION",
      descripcion: "Ofrece letras gigantes modernas ideales para graduaciones, por ejemplo, 'CLASS 2025', 'GRAD 25' o 'GEN 2022'.",
      media: {
        images: ["http://cami-cam.com/wp-content/uploads/2025/03/Letras-Gigantes.jpeg"],
        videos: ["http://cami-cam.com/wp-content/uploads/2025/02/LETRAS-GIGANTES-ILUMINADAS.mp4"]
      }
    };
  }
  
  // Si no se detecta un subtipo específico
  return {
    paquete: "OTRO PAQUETE",
    descripcion: "Tenemos varias opciones personalizadas. ¿Podrías contarnos un poco más sobre tu evento para ofrecerte la mejor recomendación?",
    media: {
      images: ["http://cami-cam.com/wp-content/uploads/2025/02/Servicios.jpg"],
      videos: []
    }
  };
  }




  /*'''''''''''''''''''''''''''''''''''
🟢 4. ESPERAMOS LOS SERVICIOS 🟢
''''''''''''''''''''''''''''''''''*/
if (context.estado === "EsperandoServicios") {
  // Si el usuario indica agregar o quitar en su mensaje inicial:
  if (messageLower.includes("agregar")) {
    const serviciosAAgregar = userMessage.replace(/agregar/i, "").trim();
    
    // 🟢 TRANSFORMACIÓN: "6 letras" => "letras gigantes 6", "4 chisperos" => "chisperos 4"
    serviciosAAgregar = serviciosAAgregar
      .replace(/\b(\d+)\s+letras(?:\s*gigantes)?\b/gi, 'letras gigantes $1')
      .replace(/\b(\d+)\s+chisperos?\b/gi, 'chisperos $1');

    context.serviciosSeleccionados += (context.serviciosSeleccionados ? ", " : "") + serviciosAAgregar;
    await sendWhatsAppMessage(from, `✅ Se ha agregado: ${serviciosAAgregar}`);

  } else if (messageLower.includes("quitar")) {
    const serviciosAQuitar = userMessage.replace(/quitar/i, "").trim();
    context.serviciosSeleccionados = context.serviciosSeleccionados
      .split(",")
      .map(s => s.trim())
      .filter(s => !s.toLowerCase().includes(serviciosAQuitar.toLowerCase()))
      .join(", ");
    await sendWhatsAppMessage(from, `✅ Se ha quitado: ${serviciosAQuitar}`);
  } else {
    // Si el usuario pone directamente la lista sin "agregar"
    // => También se hace la TRANSFORMACIÓN antes de asignar.
    let listaServicios = userMessage;
    
    listaServicios = listaServicios
      .replace(/\b(\d+)\s+letras(?:\s*gigantes)?\b/gi, 'letras gigantes $1')
      .replace(/\b(\d+)\s+chisperos?\b/gi, 'chisperos $1');
    
    context.serviciosSeleccionados = listaServicios;
  }

  // Inicializamos flags para servicios sin cantidad
  context.faltanLetras = false;
  context.faltanChisperos = false;
  context.faltaVarianteCarritoShots = false;
  context.faltaTipoCabina = false;

  // Verificar si mencionó letras pero sin cantidad
  if (/(letras|letras gigantes)(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
    context.faltanLetras = true;
  }
  
  // Verificar si "chisperos" está presente sin cantidad
  if (/chisperos(?!\s*\d+)/i.test(context.serviciosSeleccionados)) {
    context.faltanChisperos = true;
  }
  
  // Verificar si carrito de shots se escribió sin la variante
  if (/carrito de shots/i.test(context.serviciosSeleccionados)) {
    if (!/carrito de shots\s+(con|sin)\s*alcohol/i.test(context.serviciosSeleccionados)) {
      context.faltaVarianteCarritoShots = true;
      // Eliminar la entrada "carrito de shots" sin variante de la cotización
      context.serviciosSeleccionados = context.serviciosSeleccionados
        .split(",")
        .map(s => s.trim())
        .filter(s => !/^carrito de shots$/i.test(s))
        .join(", ");
    }
  } 
  
  // Verificar si se incluye "cabina" sin especificar tipo
  if (/cabina(?!\s*(de fotos|360))/i.test(context.serviciosSeleccionados)) {
    context.faltaTipoCabina = true;
    // Eliminar la entrada "cabina" sin especificar de la cotización
    context.serviciosSeleccionados = context.serviciosSeleccionados
      .split(",")
      .map(s => s.trim())
      .filter(s => !/^cabina$/i.test(s))
      .join(", ");
  }

  // Preguntar primero por el tipo de cabina si falta
  if (context.faltaTipoCabina) {
    context.estado = "EsperandoTipoCabina";
    await sendWhatsAppMessage(from, "¿Deseas agregar Cabina de fotos o Cabina 360?");
    return true;
  }

  // Preguntar por letras solo si se mencionaron y faltan cantidades
  if (context.faltanLetras && /(letras|letras gigantes)/i.test(context.serviciosSeleccionados)) {
    context.estado = "EsperandoCantidadLetras";
    await sendWhatsAppMessage(from, "¿Cuántas letras necesitas? 🔠");
    return true;
  }

  // Preguntar por chisperos solo si se mencionaron y faltan cantidades
  if (context.faltanChisperos && /chisperos/i.test(context.serviciosSeleccionados)) {
    context.estado = "EsperandoCantidadChisperos";
    await sendWhatsAppMessage(from, "¿Cuántos chisperos ocupas? 🔥 Opciones: 2, 4, 6, 8, 10, etc");
    return true;
  }

  // Preguntar por tipo de carrito de shots si se mencionó
  if (context.faltaVarianteCarritoShots) {
    context.estado = "EsperandoTipoCarritoShots";
    await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
    return true;
  }

  // Si ya se especificaron todos los datos, actualizar la cotización
  await actualizarCotizacion(from, context);
  return true;
}



/*''''''''''''''''''''''''''''''''''''''
🟢 4.1 ESPRAMOS CANTIDAD DE CHISPEROS 🟢
''''''''''''''''''''''''''''''''''''''*/
if (context.estado === "EsperandoCantidadChisperos") {
  const cantidad = parseInt(userMessage);
  if (isNaN(cantidad) || cantidad <= 0) {
    await sendWhatsAppMessage(from, "Por favor, ingresa un número válido para la cantidad de chisperos.");
    return true;
  }

  // Verificar que la cantidad sea par
  if (cantidad % 2 !== 0) {
    await sendWhatsAppMessage(from, "Cantidad inválida. Las opciones válidas para los chisperos son cantidades pares: 2, 4, 6, 8, 10, etc.");
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
  
  // Verificar si aún falta información sobre el carrito de shots
  if (context.faltaVarianteCarritoShots) {
    context.estado = "EsperandoTipoCarritoShots";
    await sendWhatsAppMessage(from, "¿El carrito de shots lo deseas CON alcohol o SIN alcohol? 🍹");
    return true;
  }
  
  // Si no falta información, actualizar la cotización final
  await actualizarCotizacion(from, context);
  return true;
}
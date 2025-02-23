// src/utils/helpers.js Agrupa funciones utilitarias y de validación.

// Función para crear un retraso
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Función para validar el formato de la fecha (DD/MM/AAAA)
export function isValidDate(dateString) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(dateString)) return false;
  const [day, month, year] = dateString.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

// Función para verificar disponibilidad (simulada)
export function checkAvailability(dateString) {
  const occupiedDates = ['15/02/2024', '20/02/2024'];
  return !occupiedDates.includes(dateString);
}

// Función para formatear precios (por ejemplo, $5,600)
export function formatPrice(amount) {
  return `$${amount.toLocaleString('en-US')}`;
}

// Función para aplicar formato a un mensaje (cursiva, negrita, etc.)
export function formatMessage(text, style = "normal") {
  if (style === "italic") return `_${text}_`;
  if (style === "bold") return `*${text}*`;
  return text;
}

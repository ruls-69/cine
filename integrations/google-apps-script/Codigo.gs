/**
 * CINe-Correo — receptor firmado para envío individual.
 *
 * Desplegar como Web App: Ejecutar como «Yo», acceso «Cualquiera».
 * El endpoint es público; NUNCA confíes en su URL como autenticación.
 * Los envíos reales aceptan exclusivamente solicitudes HMAC del servidor CINe.
 * No pegar secretos en este archivo ni publicarlos en GitHub.
 */

const CINE_MAX_BODY = 1600000;        // Solicitud JSON de prueba (aprox. 1 MiB PDF)
const CINE_MAX_PDF_BYTES = 950000;
const CINE_JOB_PREFIX = "CINE_JOB_";

function respuestaCINe(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return respuestaCINe({
    servicio: "CINe-Correo",
    estado: "operativo",
    envio: "protegido"
  });
}

function prepararSeguridadCINe() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty("CINE_HMAC_SECRET")) {
    const clave = (Utilities.getUuid() + Utilities.getUuid() +
                   Utilities.getUuid()).replace(/-/g, "");
    p.setProperty("CINE_HMAC_SECRET", clave);
  }
  const correo = Session.getEffectiveUser().getEmail();
  if (!correo) throw new Error("No se identificó el Gmail del propietario.");
  p.setProperty("CINE_TEST_RECIPIENT", correo);
  p.setProperty("CINE_MAIL_ENABLED", "false");
  console.log("Configuración creada/verificada. Envíos DESACTIVADOS.");
}

function firmasIguales(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function validaFirmaYDatos(cuerpo) {
  const p = PropertiesService.getScriptProperties();
  const clave = p.getProperty("CINE_HMAC_SECRET");
  if (!clave || clave.length < 32) return {error: "no_configurado"};
  if (typeof cuerpo !== "string" || cuerpo.length > CINE_MAX_BODY)
    return {error: "solicitud_invalida"};

  let mensaje;
  try { mensaje = JSON.parse(cuerpo); }
  catch (_) { return {error: "solicitud_invalida"}; }
  if (!mensaje || typeof mensaje.payload !== "string" ||
      typeof mensaje.signature !== "string" || mensaje.payload.length > CINE_MAX_BODY)
    return {error: "no_autorizado"};

  const correcta = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(mensaje.payload, clave, Utilities.Charset.UTF_8)
  );
  if (!firmasIguales(mensaje.signature, correcta))
    return {error: "no_autorizado"};

  let datos;
  try { datos = JSON.parse(mensaje.payload); }
  catch (_) { return {error: "solicitud_invalida"}; }

  if (!datos || typeof datos !== "object") return {error: "solicitud_invalida"};
  const fecha = typeof datos.timestamp === "string" ? Date.parse(datos.timestamp) : NaN;
  if (!Number.isFinite(fecha) || Math.abs(Date.now() - fecha) > 180000)
    return {error: "solicitud_expirada"};
  if (typeof datos.requestId !== "string" ||
      !/^[a-zA-Z0-9_-]{16,80}$/.test(datos.requestId))
    return {error: "identificador_invalido"};
  return {datos: datos, propiedades: p};
}

function recibirPDFCINe(datos, p) {
  // Dos interruptores independientes: Apps Script y Render.
  if (p.getProperty("CINE_MAIL_ENABLED") !== "true")
    return {ok: false, estado: "envio_desactivado"};

  const real = datos.operation === "send_employee_pdf";
  if (real && p.getProperty("CINE_REAL_DELIVERY_ENABLED") !== "true")
    return {ok: false, estado: "entrega_real_desactivada"};

  // Envío real: Render incluye el destinatario aprobado en el cuerpo firmado.
  // No se mantiene una lista manual de correos en Script Properties.
  // La validación HMAC se realiza antes de llegar a esta función.
  if (typeof datos.recipient !== "string" ||
      datos.recipient.length > 254 ||
      !/^[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+$/.test(datos.recipient.trim()))
    return {ok: false, estado: "destinatario_invalido"};
  const permitido = datos.recipient.trim();
  if (!real && permitido.toLowerCase() !==
      String(p.getProperty("CINE_TEST_RECIPIENT") || "").toLowerCase())
    return {ok: false, estado: "destinatario_no_permitido"};

  if (typeof datos.subject !== "string" ||
      !/^Reporte salarial 20\d{2}-(0[1-9]|1[0-2]) · Multicine Universal$/.test(datos.subject) ||
      typeof datos.filename !== "string" ||
      !/^reporte-salarial-20\d{2}-(0[1-9]|1[0-2])\.pdf$/.test(datos.filename) ||
      typeof datos.pdfBase64 !== "string" ||
      datos.pdfBase64.length > Math.ceil(CINE_MAX_PDF_BYTES * 4 / 3) + 10 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(datos.pdfBase64)) {
    return {ok: false, estado: "reporte_invalido"};
  }
  let bytes;
  try { bytes = Utilities.base64Decode(datos.pdfBase64); }
  catch (_) { return {ok: false, estado: "reporte_invalido"}; }
  if (bytes.length < 5 || bytes.length > CINE_MAX_PDF_BYTES ||
      (bytes[0] & 255) !== 37 || (bytes[1] & 255) !== 80 ||
      (bytes[2] & 255) !== 68 || (bytes[3] & 255) !== 70 ||
      (bytes[4] & 255) !== 45)
    return {ok: false, estado: "reporte_invalido"};

  // El identificador es el de la cola del ERP (persistente entre reintentos).
  // Guardar ANTES de llamar a Gmail: un timeout no provocará doble envío.
  const claveJob = CINE_JOB_PREFIX + datos.requestId;
  // Enlazar el identificador con el destinatario, operación y PDF.
  const huellaBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    datos.operation + "|" + permitido.toLowerCase() + "|" +
    datos.subject + "|" + datos.pdfBase64,
    Utilities.Charset.UTF_8
  );
  const huella = huellaBytes.map(b => ("0" + (b & 255).toString(16)).slice(-2)).join("");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(12000))
    return {ok: false, estado: "bloqueado"};

  try {
    const previo = p.getProperty(claveJob);
    if (previo === "sent|" + huella)
      return {ok: true, estado: "ya_enviado", requestId: datos.requestId};
    if (previo)
      return {ok: false, estado: "resultado_incierto_o_id_reutilizado"};

    if (MailApp.getRemainingDailyQuota() < 1)
      return {ok: false, estado: "sin_cuota"};

    p.setProperty(claveJob, "sending|" + huella);
  } finally {
    lock.releaseLock();
  }

  // Nunca reintentar automáticamente esta llamada si hay excepción.
  try {
    const adjunto = Utilities.newBlob(bytes, "application/pdf", datos.filename);
    MailApp.sendEmail({
      to: permitido,
      subject: datos.subject,
      body: real
        ? "Hola, adjuntamos tu reporte salarial individual. Este documento es informativo y no acredita pago ni transferencia."
        : "CINe: reporte salarial individual ficticio para validación técnica. No acredita ningún pago ni transferencia.",
      name: "Multicine Universal - CINe",
      attachments: [adjunto]
    });
    p.setProperty(claveJob, "sent|" + huella);
    return {ok: true, estado: "enviado", requestId: datos.requestId};
  } catch (_) {
    // Mantener "sending": no sabemos si Gmail llegó a aceptar el mensaje.
    return {ok: false, estado: "resultado_incierto"};
  }
}

function procesarSolicitudCINe(cuerpo) {
  const revisada = validaFirmaYDatos(cuerpo);
  if (revisada.error) return {ok: false, estado: revisada.error};
  const d = revisada.datos;
  if (d.operation === "ping")
    return {ok: true, estado: "autenticado",
            envio: revisada.propiedades.getProperty("CINE_MAIL_ENABLED") === "true"
                   ? "activado" : "desactivado"};
  if (d.operation !== "send_test_pdf" && d.operation !== "send_employee_pdf")
    return {ok: false, estado: "operacion_no_habilitada"};
  return recibirPDFCINe(d, revisada.propiedades);
}

function doPost(e) {
  try {
    return respuestaCINe(procesarSolicitudCINe(e && e.postData && e.postData.contents));
  } catch (_) {
    return respuestaCINe({ok: false, estado: "error_controlado"});
  }
}

function probarSeguridadCINe() {
  const clave = PropertiesService.getScriptProperties().getProperty("CINE_HMAC_SECRET");
  const payload = JSON.stringify({
    operation: "ping", requestId: Utilities.getUuid().replace(/-/g, ""),
    timestamp: new Date().toISOString()
  });
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, clave, Utilities.Charset.UTF_8)
  );
  const legitima = procesarSolicitudCINe(JSON.stringify({payload, signature}));
  const falsa = procesarSolicitudCINe(JSON.stringify({payload, signature: "firma-falsa"}));
  const desactivada = PropertiesService.getScriptProperties().getProperty("CINE_MAIL_ENABLED") !== "true";
  if (!legitima.ok || falsa.ok || !desactivada) throw new Error("Prueba de seguridad fallida.");
  console.log("Firma válida: AUTORIZADA");
  console.log("Firma falsa: RECHAZADA");
  console.log("Envío de correos: DESACTIVADO");
}

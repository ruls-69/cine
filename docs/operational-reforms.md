# CINe — Operaciones de caja e inventario

## Caja de Boletería

- **Cierre a ciegas:** el cajero introduce únicamente efectivo físico y observaciones. Ni la interfaz ni su proyección de API muestran ventas del período, saldo esperado o diferencia al cerrar. Contabilidad y Gerencia conservan la conciliación.
- **Reapertura manual:** una caja cerrada impide vender y registrar ingresos/egresos; es necesario crear otra apertura desde el panel. La primera apertura sigue recomendada por el panel antes de iniciar ventas.
- **Caja cerrada:** la vista de Boletería solo muestra la cartelera, formato, horario y precio. No se pueden consultar comprobantes anteriores ni ejecutar impresión/reimpresión de entradas por API mientras no se abra otra caja.
- **Impresiones:** el cajero puede imprimir la constancia de efectivo declarado de su cierre. No muestra totales internos. El reporte de cierre completo es exclusivo de Contabilidad y Gerencia.
- **Reporte contable:** presenta desglose de ventas por película/función, formato, precio, unidades e importes, además de ingresos, egresos y diferencia.

## Contabilidad y movimientos

- Los ingresos y egresos registran cajero, sucursal, rol y sesión; al cerrar se añaden `closureId` y `archivedAt`, conservando una fotografía con detalle en el reporte.
- Los registros cerrados dejan de aparecer en la lista de **movimientos activos**; no se borran de Supabase, para mantener trazabilidad. Se prohíbe anular un movimiento ya incorporado a un cierre; una corrección posterior debe tratarse como observación/revisión documentada sin alterar el saldo esperado congelado.
- El valor esperado se calcula en el servidor al cerrar; `close_review` permite revisar el efectivo físico, pero ignora cualquier `expected` enviado desde el navegador.

## Administración

- No recibe las colecciones de ventas, órdenes, movimientos ni cierres de caja; los comprobantes comerciales también están protegidos por permisos en el servidor.
- El menú **Reportes de movimientos** permite imprimir una hoja **en blanco** por sucursal con películas, formatos, precios y horarios del día y casillas para completar manualmente boletos vendidos e importes. No muestra ni presupone ventas efectivas. Administración y Contabilidad/Gerencia pueden confrontar posteriormente la hoja con el cierre real.
- Se quitó el botón duplicado **Nuevo reporte**; las entradas y salidas de bóveda se registran desde Inventarios.

## Códigos de inventario

Al registrar un producto, CINe asigna un SKU numérico de cuatro dígitos (`0001`–`9999`), aleatorio pero único dentro de la combinación sucursal + tipo de inventario. El SKU **no sustituye el ID interno**. Los códigos preexistentes se conservan para no romper recibos ni búsquedas.

**Alternativa futura:** una codificación correlativa por familias (por ejemplo, `01xx` pipocas, `02xx` bebidas) hace la entrada manual más fácil que códigos aleatorios. Debe construirse con un catálogo de familias, reglas de colisión y posibilidad de etiquetas/lector de código de barras antes de adoptarla.

## Planillas

- En el formulario de importación se puede seleccionar el mes de pago independientemente del mes actual. Se generan el primer y último día del mes seleccionado.
- Desde el borrador, Contabilidad puede autorizar un **día laborable sin marcación válida** con una justificación obligatoria. Se guarda la fecha, empleado, período, autor y motivo. El sistema lo acredita como jornada pagable, **sin inventar horas** ni aplicar descuento por tardanza no comprobada. Hay que recalcular el borrador antes de validarlo. La validación congela el mes.
- Existe un comando para anular la autorización antes de validar; los registros permanecen en el historial. Ninguna de estas operaciones despacha correos ni cambia planillas ya validadas.

## Verificación y despliegue

La rama tiene pruebas de caja cerrada, visibilidad por rol, hoja manual, SKU y asistencia aprobada, además de las suites existentes de correo y ERP. Los cambios solo llegarán a producción cuando el PR esté fusionado y se despliegue Render explícitamente. No es necesario modificar variables de entorno ni Google Apps Script.

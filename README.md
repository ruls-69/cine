# Universal Control — Multicine Universal

ERP de cine con web pública y áreas de Gerencia, Contabilidad, Administración, Boletería y Candy bar.

## Desplegar en Render + Cloudflare + Supabase

La preparación y las instrucciones están en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). La configuración `render.yaml` ejecuta el servidor de producción; Supabase conserva la información en un esquema privado de PostgreSQL y Cloudflare gestiona el dominio y HTTPS.

**La entrega no crea cuentas ni publica el sistema.** No incluye contraseñas de producción, datos empresariales ni la base local. La nube arranca con un estado vacío; importar datos requiere un paso explícito. Las credenciales conocidas de la demo se mantienen únicamente para el entorno local y se rechazan en producción.

- [Preparación, despliegue, respaldo y recuperación](docs/DEPLOYMENT.md).
- [Conectar la Epson TM-T20III de cada caja](docs/PRINTING.md).
- `.env.example`: nombres de las variables, sin secretos reales.
- `supabase/schema.sql`: esquema privado y permisos del usuario de conexión.
- `migrate_data.py`: inicialización, exportación e importación controlada. `--help` muestra las opciones.

## Demo local

Usa Python 3.13 o posterior. Ejecuta `python server.py` en esta carpeta o `iniciar-erp.cmd`. Abre `http://127.0.0.1:8765/admin.html` para el ERP y `/index.html` para la web. No abras el HTML directamente.

Sin `DATABASE_URL` y fuera de producción se utiliza `erp.sqlite3`. Los registros existentes se conservan. Las sesiones tienen vencimiento y pueden sobrevivir al reinicio del servidor. No mezcles variables de producción con esta demo.

Contraseña local de todas las cuentas de prueba: **Cine2026!**

| Usuario | Área | Sucursal |
| --- | --- | --- |
| gerencia | Dueño / Gerencia | Selección de sucursal |
| contabilidad | Contabilidad | Selección de sucursal |
| admin.potosi | Administración | Potosí |
| boleteria.potosi | Boletería | Potosí |
| boleteria2.potosi | Segundo boletero | Potosí |
| candy.potosi | Candy bar | Potosí |
| candy2.potosi | Segundo vendedor | Potosí |

Las cuentas de sucursal también existen con `.sucre` y `.oruro`. Usa perfiles de navegador separados para probar varios roles: las pestañas de un perfil comparten sesión.

## Operación

- Gerencia selecciona la sucursal y gestiona salas sin mapa de butacas, películas, banners, tráileres y programación de uno o siete días. Se comprueban cruces de horarios y limpieza entre funciones. La web y Boletería consultan esa programación.
- Miércoles 2×1 mantiene el precio y cada boleto vendido ocupa dos butacas: 246 butacas permiten 123 boletos. La impresión genera una entrada individual para cada persona.
- Boletería agrupa horarios por película. Permite agregar distintas funciones a una venta, cambiar cantidades y ver total y disponibilidad. La confirmación es transaccional y tiene un identificador para recuperar el resultado sin duplicar ventas. No se registra medio de pago.
- Candy muestra el historial propio por defecto y permite consultar el grupo de su sucursal. Busca productos por código o nombre, edita cantidades y emite recibos. La anulación requiere solicitud y revisión de Contabilidad.
- Administración reporta entradas y salidas de bóveda; Contabilidad valida antes de actualizar las existencias. Contabilidad registra los ingresos de Candy y administra su inventario.
- Los arqueos congelan las existencias de referencia, permiten descargar la hoja de conteo y calculan diferencias en BOB. Candy bloquea ventas durante su arqueo. Los empleados solo ven inventario mientras está activo. Al finalizar se aplican las cantidades físicas verificadas.
- Boletería y Candy registran ingresos y egresos mediante ventanas. Saldo esperado = ventas + ingresos − egresos. Cerrar bloquea ventas hasta la apertura siguiente; el reporte sigue disponible para impresión. Contabilidad revisa los movimientos y la conciliación.

## Salarios, biométrico y correo

Contabilidad configura empleados por sucursal, código biométrico, sueldo mensual, descanso semanal fijo y política de atrasos. Los empleados de nómina son independientes de las cuentas de acceso al ERP.

El sueldo devengado se calcula como sueldo mensual × días laborables con entrada/salida válidas ÷ días laborables programados del mes. Los descansos no entran en el denominador. Se aplica solo el nivel de atraso más alto del día y luego se suman los extras autorizados: funciones especiales o días extras. Un día extra requiere asistencia válida en un descanso y no puede duplicarse.

El importador acepta `.xlsx`, CSV, TXT o TSV con código, fecha, entrada y salida, hasta 2 MB y 10.000 filas. Los códigos con ceros iniciales deben exportarse como texto. Se revisan duplicados, turnos incompletos y solapamientos; los días sin marcación no acreditan por sí solos una falta injustificada.

Contabilidad revisa y valida la planilla una vez terminado el mes. La validación congela los importes y prepara un reporte individual por empleado. **El reporte no acredita una transferencia o pago ejecutado** y no calcula automáticamente retenciones legales.

El correo queda desactivado hasta configurar la cuenta emisora en las variables del servidor. Al activarlo se procesan los reportes aprobados que estén pendientes. Se usa SMTP con TLS; “Enviado” significa aceptación por el servidor de correo. Un resultado incierto requiere revisión antes de reintentar. La configuración completa está en la guía de despliegue.

## Impresión y recuperación

En producción, la Epson USB necesita el agente Windows descrito en [PRINTING.md](docs/PRINTING.md), o la impresión manual del navegador. Render no puede acceder directamente al USB de una sucursal. Los trabajos y su resultado se conservan; no se reenvían automáticamente las impresiones inciertas. Los comprobantes son internos y no constituyen factura fiscal.

Los respaldos contienen información empresarial y salarial: deben guardarse fuera del repositorio con acceso restringido. La restauración de `migrate_data.py` solo acepta un destino vacío; nunca sustituye silenciosamente una base en uso. No restaura sesiones de acceso ni envía automáticamente correos o impresiones importados.

## Arquitectura y alcance

El servidor verifica rol y sucursal. El navegador nunca recibe credenciales de PostgreSQL, contraseñas de usuarios ni la cola privada de impresión. Los datos operativos usan un documento JSONB privado; cada escritura bloquea esa fila dentro de una transacción para evitar actualizaciones perdidas. Las sesiones y el control de intentos tienen tablas independientes.

Este almacenamiento conserva compatibilidad con la aplicación actual, pero serializa las escrituras y lee el estado completo: no equivale a un modelo relacional por ventas/productos ni a una validación de capacidad para alto volumen. Antes de la apertura real deben completarse la configuración de accesos, restauración de prueba, comprobación de carga y salida física en cada caja. El registro de operaciones no es un libro de auditoría inmutable.

## Verificaciones

La estructura modular, los puertos y las dependencias están documentados en
[docs/architecture.md](docs/architecture.md). El backend mantenido vive en `erp/`
y el frontend en `src/`; `admin.js`, `app.js`, `trailers.js` y `ui.js` son salidas
del build. Las rutas y los comandos de arranque existentes se conservan.

El rediseño y su capa compartida están documentados en [docs/FRONTEND.md](docs/FRONTEND.md).
El servidor local usa los assets compilados incluidos. Para desarrollar la UI:

```powershell
npm ci
npm run typecheck
npm run build
npm run lint
npm test
npm run test:e2e
```

Playwright usa Edge instalado en Windows; en otros equipos instala Chromium con
`npx playwright install chromium`. Las pruebas generan su propia base temporal en
`tmp/` y no usan la base operativa. Puedes elegir el Python con la variable `PYTHON`.

Las pruebas de infraestructura usan bases temporales y servicios simulados; no envían correos ni imprimen. `test_storage.py` cubre concurrencia, reversión de transacciones, persistencia y vencimiento de sesiones, límites de acceso y protección de respaldos. Las pruebas HTTP, correo e impresión están separadas por módulo. La conexión a un proyecto Supabase real, el dominio y los dispositivos se verifican después de crear esas plataformas.

Para ejecutar las comprobaciones incluidas en el paquete:

```powershell
python -m unittest discover -v
```

`test_erp.py` está actualizado a los permisos actuales: Candy sólo ve existencias durante un arqueo. La impresión local se simula explícitamente. `npm test` ejecuta Vitest; Playwright incluye axe para revisar accesibilidad y registra errores de consola.

# Impresión desde Render hacia Epson TM-T20III

Render ejecuta el ERP en Linux. La impresora USB sigue instalada en el Windows de
cada caja. `print_agent.py` consulta el ERP por HTTPS y entrega los boletos a la
cola de Windows. No abre puertos, no publica la impresora en internet y no necesita
acceder a Supabase. Cada terminal recibe exclusivamente ventas de su usuario de
Boletería y su sucursal, aunque existan otros cajeros en la misma sucursal.

## Dos formas de imprimir

- **Manual:** `ERP_PRINT_MODE=manual` en Render. Al finalizar se conserva la venta;
  el cajero abre **Ver entradas → Imprimir boletos** en su equipo. El diálogo del
  navegador permite elegir la Epson. Es la alternativa inicial si aún no se
  configuraron las terminales.
- **Automática:** `ERP_PRINT_MODE=agent`. Se guarda un trabajo en Supabase y el
  agente instalado en esa caja lo recoge. El agente debe estar abierto y conectado.
  La venta sigue registrada aunque la impresora no esté disponible.

La impresión automática cubre las **entradas individuales de Boletería**. Los
recibos de Candy, cierres y otros informes mantienen su opción de impresión desde
el navegador. No se cambia la lógica de descuentos, precios o 2×1.

## 1. Preparar cada terminal Windows

1. Instalar Python 3.11 o posterior y el controlador Windows de la Epson TM-T20III.
2. Crear una carpeta de trabajo accesible solo para los responsables del equipo.
   Copiar `print_agent.py` y la carpeta `erp` del mismo paquete de entrega,
   conservando su estructura. El controlador térmico está ahora en
   `erp/modules/ticketing/thermal.py` y usa `admissions.py`. No requiere paquetes
   Python adicionales para ejecutar el agente.
3. Dar a esa caja un **usuario propio de Boletería** en la configuración de usuarios
   de producción. No compartirlo con otra terminal.
4. Generar un secreto exclusivo **en ese equipo**, sin pegarlo en chats o commits:

   ```powershell
   python print_agent.py --generate-token
   ```

   El comando muestra `ERP_PRINT_TOKEN` (secreto del equipo) y `tokenSha256` (huella
   que se registra en Render). Guardar el secreto en el administrador de secretos
   de la empresa. No subir capturas ni archivos con su contenido.

## 2. Registrar las terminales en Render

Configurar estas variables del servicio como secretos del proveedor:

```text
ERP_PRINT_MODE=agent
ERP_PRINT_AGENTS_JSON={"potosi-caja-1":{"user":"boleteria.potosi","tokenSha256":"HUELLA_SHA256_DE_64_CARACTERES"}}
```

El JSON es un objeto con una entrada por terminal. `user` debe existir en
`ERP_USERS_JSON`, tener el rol `ticketing` y la sucursal asignada. El ejemplo utiliza
un nombre de usuario conocido; no obliga a mantener la contraseña de prueba en
producción. Dos terminales no pueden compartir usuario ni token. La sucursal se
obtiene del usuario; el agente no puede seleccionarla ni alterarla.

Configurar todas las terminales antes de operar y redesplegar. Un usuario sin
terminal recibe una indicación para imprimir manualmente, sin perder su venta.

## 3. Configurar y arrancar el agente

En el usuario Windows que ejecutará el agente, definir estas variables de entorno
mediante la configuración del equipo o el gestor de secretos. No poner el token en
el repositorio, en accesos directos con argumentos ni en registros de consola:

| Variable | Valor |
| --- | --- |
| `ERP_PRINT_SERVER` | Origen HTTPS exacto del ERP, por ejemplo `https://erp.sudominio.bo`, sin `/admin.html` |
| `ERP_PRINT_TOKEN` | Secreto exclusivo generado en el paso 1 |
| `ERP_TICKET_PRINTER` | Nombre exacto de la Epson instalada en Windows |
| `ERP_TICKET_WIDTH` | `80` para papel de 80 mm, o `58` si se configuró físicamente ese ancho |
| `ERP_PRINT_JOURNAL` | Opcional: ruta absoluta local a `print-journal.sqlite3` |

Si `ERP_TICKET_PRINTER` se omite, debe existir exactamente una Epson TM-T20III.
El registro local se guarda de forma predeterminada en
`%LOCALAPPDATA%\UniversalERP\print-journal.sqlite3`.

Desde la carpeta que contiene `print_agent.py` y `erp/`:

```powershell
# Valida la configuración y el controlador. No imprime ni crea ventas.
python print_agent.py

# Activa la impresión automática de ventas que le corresponden a esta caja.
python print_agent.py --run
```

Para arrancarlo al iniciar sesión, registrar una tarea en el Programador de tareas
de Windows con el ejecutable de Python, el argumento completo de `print_agent.py
--run`, la carpeta de trabajo y el mismo usuario que tiene instalada la impresora.
Configurar **no iniciar una nueva instancia** si ya está ejecutándose. No cambiar
el usuario de Windows ni la ruta del registro local entre reinicios.

## Cloudflare

- Mantener HTTPS entre terminal, Cloudflare y Render. El agente verifica el
  certificado y rechaza redirecciones para no reenviar su secreto a otro dominio.
- No almacenar en caché `/api/*`.
- Los POST `/api/print-agent/claim` y `/api/print-agent/ack` deben llegar al ERP sin
  páginas de desafío JavaScript ni autenticación interactiva de Cloudflare Access.
  No pueden completarlas por ser un agente de consola. Si se configura una
  excepción específica en Cloudflare, **conservar siempre la autenticación Bearer
  del ERP**. No desactivar la protección del resto del sitio.
- No usar `http://` en producción. Solo las pruebas locales pueden activar
  `ERP_PRINT_ALLOW_HTTP=1` con `localhost` o `127.0.0.1`.

## Estados y recuperación

| Estado visible | Significado y acción |
| --- | --- |
| Pendiente | Persistido, esperando su terminal. Revisar que el agente esté activo. |
| Enviando | El agente reclamó el trabajo. No pedir otra copia mientras se procesa. |
| Aceptado por Windows | Windows aceptó los bytes. Esto **no confirma salida física**: revisar papel, conexión y cola. |
| Sin confirmar | El agente falló o pasaron diez minutos sin confirmación. Revisar impresora y cola antes de reimprimir. |

El agente registra el identificador en disco **antes de enviar**. Si se interrumpe
en ese instante, no vuelve a imprimirlo automáticamente. Si se pierde la respuesta
de confirmación, reintenta únicamente la confirmación. El servidor tampoco vuelve
a asignar automáticamente un trabajo sin confirmar. Así se evita emitir entradas
duplicadas al reconectar, pero algunos incidentes requieren revisión del cajero.

No borrar el registro local ni la cola de Windows para "solucionar" un trabajo sin
confirmar. Primero revisar si las entradas salieron. Una vez resuelto el incidente,
el cajero puede solicitar una **reimpresión explícita** desde la venta. La
reimpresión no crea otra venta ni descuenta nuevamente los boletos.

Para sustituir un equipo: detener primero el agente anterior, resolver las
impresiones en curso, conservar una copia protegida del registro y rotar su token.
Nunca dejar el mismo token activo simultáneamente en dos equipos. La rotación del
secreto no elimina las ventas ni sus trabajos pendientes.

## Privacidad y alcance del comprobante

El agente solo recibe los datos necesarios de las entradas de su caja; no recibe
credenciales de usuarios, salarios o inventarios. El token permite reclamar y
confirmar sus trabajos, no iniciar sesión como empleado. Aun así, un token filtrado
puede consumir trabajos de esa caja: revocarlo cambiando su huella y reinstalarlo
solo en la terminal autorizada.

La tabla privada `printJobs` nunca se devuelve a los navegadores. Su copia de las
entradas y el registro local deben estar dentro de la política de conservación y
copias de seguridad de la empresa.

Con `ERP_ENV=production`, las entradas generadas por la cola no llevan la palabra
DEMO. Conservan **No es factura fiscal**: la impresión térmica no implementa
facturación fiscal ni sustituye una integración tributaria.

# Publicar Universal en Render, Cloudflare y Supabase

> **Variante demo gratuita:** este ZIP tiene `render.yaml` con `plan: free` solo para desarrollo/presentación. El texto que describe el plan de pago es la referencia para producción comercial.


El proyecto está preparado para subirlo. Esta entrega **no crea cuentas, repositorios, dominios ni servicios** y no realiza una publicación. Las direcciones escritas como ejemplo deben reemplazarse por las que asignen las plataformas.

## Arquitectura

```text
Navegador / terminal de caja
            │ HTTPS
            ▼
Cloudflare: dominio, TLS y proxy
            │ HTTPS
            ▼
Render: web pública + ERP + API Python / Gunicorn
            │ PostgreSQL con TLS, credencial privada erp_app
            ▼
Supabase: esquema erp_private, datos y sesiones
```

La web y el ERP se sirven desde el mismo servicio y origen. No hay que desplegar otro frontend en Cloudflare Pages ni crear una API en Workers. El navegador no recibe claves de Supabase. Las imágenes de los banners siguen siendo enlaces HTTPS y los tráileres siguen en YouTube.

En producción, `/` y `/index.html` abren la web pública; `/admin.html` abre el ERP. En la demo local se mantiene el acceso habitual. El archivo local `erp.sqlite3` y las credenciales de prueba se conservan en el equipo, pero **no se incluyen en el paquete de datos ni se activan como usuarios de producción**. El código conserva la demo para uso local.

## 1. Preparar el repositorio

1. Descomprimir `universal-render-release.zip` en una carpeta nueva. Contiene código, plantilla y documentación, no datos de empleados ni ventas.
2. Crear un repositorio privado en el proveedor Git que se conectará a Render y subir el contenido. `render.yaml` debe quedar en la raíz. No subir el ZIP como único archivo del repositorio.
3. Mantener `.env`, SQLite, respaldos, biométricos y secretos fuera del repositorio. `.gitignore` ayuda, pero no elimina archivos que ya hubieran sido publicados.
4. Instalar Python 3.13 o posterior en el equipo autorizado que preparará la base. Desde la carpeta extraída:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

En los siguientes ejemplos `python` representa ese intérprete del entorno. En Windows se puede usar su ruta `.venv\Scripts\python` sin activar el entorno. Gunicorn se instala únicamente en Linux; la demo local utiliza `python server.py`.

## 2. Crear Supabase y preparar la base vacía

1. Crear un proyecto Supabase dedicado a producción. Elegir una región próxima al servicio Render; la plantilla propone `virginia`, que se puede cambiar **antes de crear** el servicio. Guardar la contraseña propietaria en el gestor de secretos de la empresa.
2. En **Connect → Session pooler**, copiar la conexión completa. El host y referencia son propios de cada proyecto: no se deducen a partir de la región. Usar puerto `5432` y `sslmode=verify-full`. La conexión Session pooler permite conexión IPv4 desde este backend persistente. [Conexiones Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
3. Definir `MIGRATION_DATABASE_URL` **solo en el proceso local de preparación**, con el propietario `postgres.PROJECT_REF`. No subir esta conexión a Render, Git, capturas o chats. La contraseña debe codificarse como parte de una URL si contiene caracteres especiales.
4. Descargar desde Supabase la CA para verificar la conexión. Definir `ERP_DB_SSL_MODE=verify-full` y `ERP_DB_SSL_ROOT_CERT` con la ruta absoluta local al certificado. Ejecutar:

```powershell
python migrate_data.py bootstrap
python migrate_data.py set-app-password
```

`bootstrap` crea el esquema privado y un estado vacío; es repetible sin borrar registros existentes. El segundo comando solicita de forma oculta una contraseña nueva de al menos 20 caracteres para el rol `erp_app`. Elegir una contraseña aleatoria y distinta de la propietaria.

5. Construir `DATABASE_URL` para Render usando el mismo host Session pooler pero el usuario **`erp_app.PROJECT_REF`** y la contraseña del rol. La plantilla `.env.example` muestra la estructura.
6. Mantener `erp_private` fuera de los esquemas expuestos por la Data API. Este proyecto no necesita `anon`, `service_role` ni acceso directo desde el navegador. El SQL limita permisos del rol de aplicación; las reglas por usuario/sucursal siguen comprobándose en el servidor. No sustituir ese modelo por acceso público a la tabla de estado. [Seguridad de la API Supabase](https://supabase.com/docs/guides/api/securing-your-api)

En producción es obligatoria la verificación TLS completa. Guardar la CA indicada por Supabase para subirla como **Secret File** en Render con nombre `supabase-ca.crt`. La plantilla configura `ERP_DB_SSL_MODE=verify-full` y `ERP_DB_SSL_ROOT_CERT=/etc/secrets/supabase-ca.crt`. Se carga el certificado de la CA, no una clave privada. No bajar la verificación para resolver un error de conexión; comprobar CA, hostname y fecha del certificado. [Conexión y certificados](https://supabase.com/docs/guides/database/psql)

### Datos iniciales

El inicio recomendado es una base vacía. Registrar usuarios, empleados, productos, salas y cartelera reales; no se importan automáticamente los datos de ensayo.

Si se decide trasladar datos concretos de la demo, revisarlos primero y hacer copia. Estos comandos son **opcionales** y no se han ejecutado contra Supabase:

```powershell
python migrate_data.py export-sqlite --source erp.sqlite3 --output backups/local-antes-de-migrar.json
python migrate_data.py import-sqlite --source erp.sqlite3
python migrate_data.py import-sqlite --source erp.sqlite3 --apply
```

Sin `--apply` se revisan formato, conteos y destino sin importar. Con `--apply` solo se acepta un destino vacío: nunca se fusiona ni sobrescribe una operación existente. No se transfieren contraseñas o sesiones. Se marcan los envíos/impresiones pendientes importados para revisión, evitando ejecutarlos automáticamente. El informe de conteos no verifica la exactitud contable de los datos.

## 3. Definir accesos de producción

Crear una contraseña única para cada persona/terminal. Se pueden conservar nombres de usuario familiares, pero **la contraseña conocida de la demo no sirve en producción**. Generar cada hash localmente:

```powershell
python auth_config.py hash-password
```

El comando pide la contraseña de forma oculta y devuelve un hash para `ERP_USERS_JSON`. Guardar el JSON como secreto de Render, no dentro del código. Su estructura es:

```json
{
  "gerencia": {"role": "manager", "branch": null, "passwordHash": "HASH_GENERADO"},
  "contabilidad": {"role": "accounting", "branch": null, "passwordHash": "HASH_GENERADO"},
  "admin.potosi": {"role": "administrator", "branch": "Potosí", "passwordHash": "HASH_GENERADO"},
  "boleteria.potosi": {"role": "ticketing", "branch": "Potosí", "passwordHash": "HASH_GENERADO"},
  "candy.potosi": {"role": "candy", "branch": "Potosí", "passwordHash": "HASH_GENERADO"}
}
```

Reemplazar **cada** hash. Los roles globales usan `branch: null` y eligen sucursal al entrar. Los demás usan exactamente `Potosí`, `Sucre` u `Oruro`. Incluir todas las cuentas autorizadas en el mismo objeto; no mezclar registros reales con pruebas. Los empleados de planilla y las cuentas de acceso son registros distintos.

## 4. Crear el servicio Render

La plantilla propone un único servicio de pago `0.5c-512mb`, una instancia y despliegue manual. **Revisar el precio vigente antes de confirmar su creación**. Esta configuración no crea una base Render ni un disco: los datos persistentes están en Supabase. [Configuración de Blueprints](https://render.com/docs/blueprint-spec)

No cambiarlo a Free para atender las cajas: ese plan tiene suspensión por inactividad y bloquea los puertos SMTP habituales. La prueba gratuita de una plataforma no constituye una configuración de disponibilidad para la operación del cine. [Límites de servicios gratuitos](https://render.com/docs/free)

En Render, conectar el repositorio y elegir **New → Blueprint**, usando `render.yaml`. Revisar nombre y región. Si aún no se conoce la URL asignada, introducir temporalmente un origen HTTPS de ejemplo en `PUBLIC_BASE_URL`, sin empezar a operar; una vez Render asigne el subdominio, reemplazarlo por su URL exacta y redesplegar antes de iniciar sesión. Alternativamente, crear el Web Service desde el repositorio y copiar los valores del YAML.

Una vez creado el servicio, abrir **Environment → Secret Files → Add Secret File**, nombre `supabase-ca.crt`, pegar el certificado de CA completo y guardar. Render vuelve a desplegar al guardarlo. Si el Blueprint intentó arrancar antes de añadirlo, ese arranque debe fallar cerrado por falta de certificado: completar este paso y redesplegar, sin reducir la verificación TLS. [Archivos secretos en Render](https://render.com/docs/configure-environment-variables)

| Variable | Valor inicial |
| --- | --- |
| `ERP_ENV` | `production` |
| `DATABASE_URL` | Conexión privada del rol `erp_app` |
| `ERP_USERS_JSON` | JSON de accesos reales con hashes |
| `PUBLIC_BASE_URL` | Origen HTTPS exacto, inicialmente el subdominio asignado por Render, sin ruta ni barra final |
| `ERP_DB_SSL_MODE` | `verify-full` |
| `ERP_DB_SSL_ROOT_CERT` | `/etc/secrets/supabase-ca.crt`, certificado añadido en Secret Files |
| `ERP_DB_POOL_SIZE` | `8` |
| `ERP_PRINT_MODE` | `manual` hasta preparar terminales |
| `ERP_PAYROLL_MAIL_ENABLED` | `false` hasta conectar el correo |

Render establece `PORT`; Gunicorn escucha en `0.0.0.0:$PORT`. Mantener un worker, ocho threads y sin `--preload`. No añadir migraciones al arranque ni entregar al servicio credenciales de propietario. `.python-version` fija la línea 3.13; Render elige su parche disponible. [Versión de Python](https://render.com/docs/python-version)

`/healthz` indica que el proceso responde y `/readyz` comprueba disponibilidad de almacenamiento; la segunda es la ruta configurada para los controles de Render. Si falla, revisar variables, bootstrap, TLS y permisos antes de operar. La aplicación no cae silenciosamente a SQLite en producción. [Controles de salud](https://render.com/docs/health-checks)

Cuando el servicio esté listo, abrir su URL real y `/admin.html`, entrar con los accesos nuevos y comprobar cada sucursal. Una página cargada no confirma por sí sola la conexión correcta de impresora, correo o datos contables.

## 5. Conectar Cloudflare cuando exista el dominio

1. Registrar el dominio y añadir su zona a Cloudflare; configurar los nameservers que indique.
2. Añadir el dominio elegido en **Render → Settings → Custom Domains**.
3. Crear en Cloudflare un **CNAME** hacia el subdominio exacto que muestra Render. Empezar con **DNS only** hasta que Render verifique el nombre y emita su certificado. Retirar registros A/AAAA en conflicto **solo del nombre que se conectará**, conservando correo y otros servicios. Tras emitirse el certificado se puede activar **Proxied**. [Guía Render + Cloudflare](https://render.com/docs/configure-cloudflare-dns)
4. En SSL/TLS usar **Full (strict)** y activar la redirección HTTPS. Render debe presentar certificado válido para ese nombre. No utilizar Flexible. [TLS Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
5. Cambiar `PUBLIC_BASE_URL` a ese origen HTTPS y redesplegar. Usar un único origen para web y ERP. Si hay otro dominio autorizado, añadirlo expresamente a `ERP_ALLOWED_ORIGINS`, separado por coma; no usar `*`. Volver a iniciar sesión en el nuevo dominio.

### Caché y tráfico de cajas

Crear una Cache Rule **Bypass cache** para:

```text
(starts_with(http.request.uri.path, "/api/") or
 http.request.uri.path eq "/admin.html" or
 http.request.uri.path eq "/" or
 http.request.uri.path eq "/index.html" or
 http.request.uri.path eq "/healthz" or
 http.request.uri.path eq "/readyz")
```

La portada incluye tráileres elegidos por sucursal, y los recibos/planillas contienen datos privados. No usar una regla global "Cache Everything". CSS, JS y el logo pueden seguir la caché estática normal, respetando la versión en su URL. [Diagnóstico de caché Cloudflare](https://developers.cloudflare.com/cache/troubleshooting/investigating-uncached-responses/)

No aplicar desafíos JavaScript o Access interactivo a las peticiones del agente de impresión: no es un navegador. Configurar excepciones únicamente para sus rutas según [PRINTING.md](PRINTING.md), manteniendo su token obligatorio. El resto del ERP exige siempre autenticación propia. No instalar Rocket Loader u otra transformación automática de scripts durante la puesta en marcha; el reproductor de YouTube necesita conservar su carga normal.

## 6. Impresoras y correo

Render no puede ver la Epson USB del equipo local. Iniciar con impresión del navegador; después instalar el agente Windows de [PRINTING.md](PRINTING.md), un usuario/token por terminal, y activar `ERP_PRINT_MODE=agent`. El agente cubre entradas individuales de Boletería; Candy y reportes se imprimen desde el navegador. Comprobar papel/corte con la impresora real antes de atender clientes.

El correo queda apagado. Cuando la empresa disponga de cuenta/proveedor SMTP, configurar como secretos `ERP_SMTP_HOST`, `ERP_SMTP_PORT`, `ERP_SMTP_SECURITY` (`starttls` o `ssl`), `ERP_SMTP_USER`, `ERP_SMTP_PASSWORD` y `ERP_SMTP_FROM`. Verificar el remitente y los DNS de correo con ese proveedor, revisar destinatarios y activar `ERP_PAYROLL_MAIL_ENABLED=true` en una ventana controlada: podría procesar reportes ya aprobados pendientes. Contabilidad valida la planilla y cada empleado recibe solo su reporte. Un correo enviado no ejecuta un pago bancario. **Enviado** significa aceptado por el proveedor SMTP, no confirma lectura o llegada final. Si un proceso se interrumpe sin confirmar el resultado, al vencer su reserva de 15 minutos el reporte pasa a **Revisar envío**; comprobar la recepción antes de reintentar manualmente. No se reenvía automáticamente un resultado incierto.

## 7. Respaldo, cambios y recuperación

Antes de operar, configurar copias en Supabase según el plan elegido y asignar un responsable de probar restauraciones. Como copia adicional del estado de la aplicación, desde el equipo autorizado y con `MIGRATION_DATABASE_URL`:

```powershell
python migrate_data.py backup --output backups/estado-AAAA-MM-DD-HHMM.json
```

El archivo incluye datos personales y de operación: conservarlo cifrado y con acceso restringido fuera de Render/Git. El exportador rechaza sobrescribir otro archivo. Esta copia no incluye credenciales, sesiones ni configuración del proveedor; guardar esos elementos por separado en el gestor de secretos. No guardar datos únicamente en el disco temporal de Render.

Para recuperar, preparar un proyecto/base de destino **vacía**, ejecutar bootstrap y asignar contraseña `erp_app`. Revisar y aplicar:

```powershell
python migrate_data.py restore --source backups/estado-AAAA-MM-DD-HHMM.json
python migrate_data.py restore --source backups/estado-AAAA-MM-DD-HHMM.json --apply
```

Comprobar conteos, revisar impresiones y correos pendientes, y cambiar `DATABASE_URL` de Render durante una pausa de operación. No permitir escritura simultánea en el origen y en el destino. La recuperación nunca sobrescribe una base en uso.

Para volver a una versión de código, usar el despliegue anterior de Render únicamente si es compatible con el esquema. Un rollback de código **no revierte ventas ni restaura datos**. Antes de cambios de estructura, respaldar y preparar un procedimiento de migración específico. Los despliegues automáticos están desactivados para evitar publicar cada commit sin revisión.

Los cambios en el propio `render.yaml` pueden aplicarse mediante la sincronización del Blueprint; revisar también esa opción en el panel si se requiere aprobación manual de toda modificación de infraestructura. [Sincronización de Blueprints](https://render.com/docs/infrastructure-as-code)

## Alcance de esta preparación

Se conserva el modelo de estado compartido en un documento JSONB con bloqueo transaccional, sesiones separadas y acceso privado. Permite preparar esta versión para la nube conservando sus flujos; no equivale a normalizar todo el ERP ni a certificar su capacidad para un número ilimitado de sucursales. Medir tiempos y concurrencia reales antes de ampliar capacidad. La preparación local no confirma aún un despliegue, conexión a una cuenta Supabase, entrega SMTP ni salida física de la Epson.

Para regenerar el paquete después de cambios:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
python scripts/package_release.py
```

Los scripts públicos compilados se incluyen en el paquete; Render conserva su
build Python. Las fuentes mantenidas están en `src/` y el backend modular en
`erp/`. No subir solo los antiguos archivos de raíz: conservar ambas carpetas.

El empaquetador usa una lista explícita de archivos y genera un ZIP con manifiesto de huellas. No copia carpetas de datos ni archivos desconocidos automáticamente. Al añadir módulos nuevos hay que agregarlos a esa lista.

# Frontend · Universal / Sala oscura

## Arquitectura y decisiones

Se conserva Python + HTML y JavaScript sin framework, las rutas `/index.html` y
`/admin.html`, las sesiones con cookies, las APIs y todos los módulos de negocio.
La web consulta catálogo/tráileres públicos. El ERP recibe estado filtrado por
rol; Gerencia y Contabilidad eligen una sucursal antes de trabajar. La venta es
presencial: no se añade compra online, mapa de asientos, registro de clientes ni
QR de pago. Los reportes imprimibles mantienen su tamaño y datos.

La auditoría previa encontró cuatro hojas superpuestas para el ERP, colores y
medidas duplicados, formularios compactos sin nombre accesible en algunas tablas,
pósteres recortados y componentes de gestión dentro de un `admin.js` grande.
Las áreas de ventas y salarios ya tenían módulos propios y se conservaron.

La arquitectura actual está detallada en [architecture.md](architecture.md).
`src/app` compone controladores de `src/modules`; las vistas reciben puertos
explícitos y conservan sus estados visuales. Los carritos y la sesión tienen
contratos TypeScript estrictos y validación Zod. `src/shared/ui.ts` contiene
primitivas visuales sin reglas de salarios, stock o ventas.

Las vistas heredadas permanecen en JavaScript modular, con ESLint y pruebas de
interacción: no se presenta esto como una conversión completa a TypeScript.
Rolldown empaqueta los módulos a las URLs de scripts existentes. React, shadcn,
Tailwind, React Hook Form y TanStack Query no se introducen en esta refactorización.
El cálculo y la validación de negocio siguen en el servidor Python.

## Sistema visual

`design-tokens.css` centraliza carbón `#101113`, superficies `#181a1e`, marfil
`#f4f0e8`, ámbar `#e5b578`, bordes, estados semánticos, espaciado y movimiento.
DM Sans para controles; Playfair Display para marca y titulares editoriales.
Radios de 3–4 px, líneas finas, tablas legibles y acentos reservados a acciones.
Los pictogramas existentes se conservan con trazo de 1.6 px; el estado vacío usa
una entrada delineada. Las fotografías ilustrativas son locales y generadas para
esta identidad; el logo oficial no se reemplaza. Los pósteres provienen del catálogo.

- `admin.css`: acceso, sucursales, shell, tablas, formularios, gerencia, inventarios,
  reportes, arqueos, cierres e historial.
- `pos.css`: películas/horarios, carrito, confirmación, Candy y resumen móvil.
- `payroll.css`: empleados, atrasos, extras, biométrico, revisión y correos.
- `styles.css`: web pública, cartelera, detalle, experiencias, Candy y contacto.
- `reports.css`: vistas previas de entradas, recibos, cierres y salarios.

Las referencias generadas definieron la composición antes de programar. Se
conserva el logo real aunque los conceptos dibujen otro; fechas, películas y
totales son siempre los del sistema. Se omiten sinopsis inventadas por el concepto
porque el catálogo no tiene ese campo. Los controles usan sans por legibilidad.

## Desarrollo y comprobaciones

```powershell
npm ci
npm run typecheck
npm run build
npm run lint
npm test
python -m unittest discover -v
npm run test:e2e
python server.py
```

`ui.js` se entrega compilado para que `python server.py` siga funcionando sin Node.
Tras editar `src/shared/ui.ts` ejecuta `npm run build`. No subas `node_modules`,
datos de operación ni archivos biométricos. El empaquetador mantiene una lista
explícita de fuentes y assets; los archivos nuevos no se exponen automáticamente.

Playwright crea `tmp/ui-qa-*.sqlite3`, aislado del archivo operativo. No envía correo,
no imprime en hardware ni importa datos reales. Recorre roles, sucursales, ventas,
cierres, inventario y salarios; captura vistas de escritorio, tablet y móvil.
El plugin Browser no está disponible; se usa Playwright directamente, solicitado
expresamente. La evidencia temporal queda fuera de la distribución.

## Seguridad y límites

Codex Security y CodeRabbit no están disponibles en esta sesión. La revisión local cubre escape
de HTML, controles de rol/sucursal del servidor, cookies HttpOnly/SameSite,
orígenes, lista de archivos estáticos y separación de credenciales. Se conserva
el esquema privado de Supabase, conectado desde el backend, conforme al modelo
documentado en https://supabase.com/docs/guides/database/secure-data.
No se conectó un proyecto remoto y no se hizo despliegue. RLS, correo SMTP,
impresora física y el entorno real deberán validarse cuando estén configurados.

La CSP heredada no restringe `script-src`/`style-src`; endurecerla requiere revisar
los scripts de configuración y proveedores externos. El estado completo sigue
siendo JSON/JSONB con polling; su normalización/paginación sería otra tarea de
backend. `test_erp.py` se actualizó a los contratos actuales y forma parte de la suite
mantenida de despliegue. Las fuentes remotas tienen fallback
local y YouTube depende de permisos de incrustación/autoplay del proveedor.

## Entrega del rediseño · 4 de octubre de 2026

1. **Arquitectura encontrada:** servidor Python/WSGI, módulos de dominio,
   frontend HTML/JS sin framework, estado SQLite local o JSONB privado en
   PostgreSQL/Supabase. Autenticación propia y acceso por rol/sucursal.
2. **Sistema de diseño:** carbón, marfil y ámbar; tipografía editorial en la web y
   sans en operaciones, radios discretos, controles de al menos 44 px, foco visible,
   estados semánticos y movimiento reducido.
3. **Páginas y vistas rediseñadas:** portada, cartelera, detalle/horarios,
   experiencias, Candy público, contacto; acceso y elección de sucursal; panorama,
   programación/salas, películas/tráileres, inventarios, reportes, arqueos, cierres,
   historial, venta/confirmación de boletería, venta/historial de Candy, empleados,
   extras, biométrico, planillas, correos y vistas imprimibles HTML. No hay nuevas rutas.
4. **Componentes creados:** primitivas compartidas de escape, tabla desplazable,
   estado vacío, pasos de venta, etiquetas y diálogos accesibles; tokens y estilos
   comunes para reportes.
5. **Componentes refactorizados:** shell y menú adaptable, formularios y ventanas,
   filas de películas/horarios, carrito, resumen móvil, tablas, vista semanal,
   navegación de salarios y detalle de planillas. Se retiraron las tres hojas
   `*-refresh.css` que superponían estilos.
6. **Problemas encontrados:** CSS duplicado, formularios comprimidos, campos sin
   etiqueta, pósteres recortados, exceso de altura y desbordamiento en imágenes móviles.
7. **Correcciones:** estilos consolidados, campos amplios y etiquetados, pósteres
   contenidos, diálogo con desplazamiento, tablas móviles legibles y desplazables,
   contraste de botones al pasar el cursor, portada más compacta, avisos ocultos
   fuera de uso y viewport correcto en el reporte salarial. Los diálogos largos
   mantienen visibles su encabezado y acciones; los errores del servidor reciben
   foco. El refresco del catálogo conserva el foco y el cambio de sucursal retira
   los datos anteriores mientras carga. Escape devuelve el foco al menú móvil.
8. **Pruebas realizadas:** recorridos HTTP/browser con base desechable; venta
   de varias películas, descuento de disponibilidad, entradas individuales,
   ingreso/cierre/reapertura, Candy y solicitud de anulación, cambios de sucursal,
   alta de sala, programación de siete días y validación de horarios duplicados,
   publicación en web y boletería de la sucursal correspondiente, miércoles 2×1
   con 123 boletos para 246 butacas y precio intacto; alta de producto, ingreso
   de inventario y reporte de bóveda pendiente de aprobación; importación XLSX,
   extras/atrasos, aprobación salarial y arqueo con bloqueo y desbloqueo del
   vendedor. También se prueba foco de teclado, fallo de conexión y reintento.
9. **Lint:** `npm run lint` aprobado, sin supresiones añadidas.
10. **Tipado:** `npm run typecheck` aprobado. TypeScript estricto cubre la capa
    compartida nueva; el código heredado sigue en JavaScript.
11. **Tests:** 4 pruebas unitarias de UI y 44 pruebas mantenidas del backend aprobadas.
12. **Build:** `npm run build` aprobado; `ui.js` incluido para ejecución con Python.
13. **Playwright:** seis recorridos, 157 estados/pantallas comprobados a 1440×1000,
    834×1112 y 390×844, más boletería a 1078×930. Sin errores JavaScript ni rutas
    locales rotas; sin desbordamiento horizontal del documento, campos sin etiqueta
    o inputs menores de 50 px en esas vistas. Además se inspeccionaron la portada
    a 1435×1096, boletería a 1505×1045 y ambas a 1920×1080. Edge/Chromium headless;
    no se afirma cobertura de Safari, Firefox o dispositivos físicos. El HTTP 400
    registrado en `expectedValidation` corresponde al rechazo esperado de un
    horario duplicado; se corrigió desde el formulario y se completó el registro.
14. **Pendientes externos:** Codex Security no está disponible; revisión local
    limitada a código y pruebas. Sin prueba remota de Supabase/RLS, carga de producción,
    impresora física o envío SMTP real. La reproducción real de YouTube no se incluyó
    en el recorrido automatizado: el reproductor existente se conserva y la fixture
    prueba su estado vacío. Sin despliegue ni cambios de credenciales/esquema.
15. **Archivos principales:** `index.html`, `styles.css`, `app.js`, `admin.html`,
    `admin.js`, `admin.css`, `design-tokens.css`, `src/shared/ui.ts`, `ui.js`,
    `ticketing.js`, `candy.js`, `pos.css`, `payroll.css`, `reports.css`, los cuatro
    generadores HTML de reportes, lista estática de `server.py`, tooling,
    pruebas y empaquetador. `trailers.js` y las reglas de negocio se conservaron.

## Comparación visual con los conceptos

Las referencias están en el directorio local de imágenes generadas de esta tarea:
`01a0e629-b6d5-7f91-96e1-18dd7af46be6`. La inspección final abrió con `view_image`
las referencias y las capturas recientes de Playwright en la misma pasada.
La evidencia está fuera del paquete, en el directorio de visualizaciones de la
tarea, subcarpeta `qa-final` (`results.json` y PNG). La subcarpeta `qa` conserva
la primera pasada y las capturas con las dimensiones originales de los conceptos.

| Punto | Referencia / evidencia | Resultado o diferencia intencional |
| --- | --- | --- |
| Composición inicial | `exec-6f004da0-8a85-42a4-8c65-7254eb2cc959.png` / `public-concept-size.png` | Hero dividido, CTA y calendario siguiente. Se redujo la altura excesiva del primer render. Se conserva un enlace a la película real destacada, requerido por el usuario. |
| Texto y tipografía | Portada anterior / `public-desktop.png` | Se mantienen “Historias que te atraviesan”, “Elegir mi función” y “En cartelera”. Controles sans para legibilidad; fechas, metadatos y películas proceden del sistema. Se omiten las sinopsis inventadas por la referencia. |
| Paleta y superficies | Ambas referencias de escritorio | Base carbón, texto marfil, ámbar, bordes finos y radios discretos. Se corrigió el hover que oscurecía un botón con texto negro. |
| Pósteres y marca | Referencia pública / cartelera renderizada | Aspecto 2:3 con imagen contenida; logo oficial conservado. Las fixtures usan una fotografía local como póster de prueba; la aplicación no reemplaza los banners operativos. |
| Densidad de boletería | `exec-3b0c4be1-757f-4605-82dc-e75fbedba2c0.png` / `ticket-concept-size.png` | Películas a la izquierda y carrito a la derecha, pasos y cantidades. La mayor altura conserva ayudas y avisos operativos; disponibilidad sigue descontándose al confirmar. Sin asientos ni pago online. |
| Continuidad pública | `exec-e4a9ad65-1d38-4c8c-86e0-e4a68986bc29.png` / `public-desktop.png` | Bandas de imagen/texto, combos en filas y contacto. “Candy bar” conserva el nombre usado por la empresa; se mantienen horarios y contacto existentes. Las imágenes locales son ilustrativas. |
| Móvil y formularios | `exec-1f89a1f8-4c09-4286-bd4e-11c43bdd4f20.png` / `ticket-pos-mobile.png`, `payroll-lateness-mobile.png` | Menú plegable, venta en una columna, resumen fijo y campos amplios. La configuración de atrasos conserva todos sus campos y desplaza dentro del diálogo, con encabezado y botón Guardar visibles. |
| Accesibilidad/movimiento | Formularios, detalle de película y navegación | Etiquetas, foco, Escape, devolución del foco, contenido inerte bajo el modal y movimiento reducido comprobados. Tablas amplias desplazan dentro de su región con indicación visible. |

El cotejo de texto del primer viewport registra como diferencias intencionales el
enlace destacado, las ayudas de operación, la identificación del rol y los avisos
del estado real. La identidad y el modelo de composición se verificaron contra
los conceptos; no se pretende reproducir datos ficticios o la marca dibujada por
ellos. No quedaron recortes de contenido primario ni desbordamientos del documento
en las vistas comprobadas. Los botones y tablas conservan UI real, no capturas.

El cotejo final de cierre volvió a abrir la referencia móvil junto a
`qa-final/payroll-lateness-mobile.png` y la referencia de boletería junto a
`qa-final/gallery-ticket.png`. Se verificaron composición en columnas,
jerarquía tipográfica, paleta, campos y foco, acciones persistentes y densidad.
La boletería conserva más ayudas y avisos que el concepto; el formulario de
atrasos conserva sus tres niveles completos. Son diferencias intencionales para
mantener la operación existente. La marca y las imágenes de prueba tampoco
sustituyen el catálogo real.

## Segunda pasada UI/UX · 7 de octubre de 2026

Se revisaron la web, acceso, sucursales, todos los apartados de los cinco roles,
diálogos y reportes. Se unificaron pesos tipográficos, controles de 44 px,
radios de 4 px, filtros móviles y estados hover/focus. Las secciones de gestión
ahora usan separadores en lugar de tarjetas anidadas. Los diálogos desplazan su
cuerpo sin cubrir el campo enfocado; los avisos se pueden cerrar. Se corrigieron
las miniaturas contenidas y la alineación del total del recibo de Candy.

La comparación final volvió a abrir conceptos y capturas de portada y boletería
a sus anchos nativos de 1435 y 1505 px. Se conservaron: composición dividida,
jerarquía de títulos, paleta carbón/marfil/ámbar, familias tipográficas, imágenes
contenidas y acciones principales. La reducción de marcos y radios es una
diferencia intencional solicitada en esta segunda pasada. No cambió el texto del
hero, navegación o CTA; sólo se aclararon ayudas de estados vacíos. Los datos y
pósteres de las capturas son fixtures, no sustituyen los datos operativos.

Validación: lint, typecheck y build aprobados; Playwright pasó 157 estados en seis
recorridos y nueve comprobaciones adicionales de foco, hover, interacción táctil,
diálogos e inventario a 360 px. Se revisaron visualmente las capturas de escritorio
y móvil. Evidencias: `ui-polish-final` y `ui-polish-extra` en el directorio de
visualizaciones de la tarea. No hubo errores JavaScript ni recursos locales rotos.
Se usó Playwright directamente porque el plugin Browser no está disponible;
cobertura Edge/Chromium, sin afirmar pruebas en Safari o dispositivos físicos.

Se aplicaron ui-design, Tailwind y Build Web Apps sobre el CSS existente; no se
introdujo una migración de framework. Credenciales, reglas de negocio y datos
operativos conservados. Sin despliegue.


## Revisión final de producción · 8 de octubre de 2026

Sin funciones nuevas ni despliegue. Se corrigieron dos regresiones de interfaz: el calendario
horizontal no recibía foco de teclado, y las respuestas de polling que llegaban
después de cerrar sesión/iniciar otra sesión podían restaurar datos anteriores.
Ahora se descartan respuestas de otra generación de autenticación y respuestas
fuera de orden. Se retiró el estado/evento del antiguo mapa de butacas, sin uso.

Vitest incorpora tres regresiones de sesión además de las cuatro pruebas de
primitivas. Las pruebas HTTP y de dominio se ejecutan con datos temporales;
la suite histórica quedó alineada con HTTP 401, stock oculto fuera del arqueo e
impresión simulada explícitamente. La suite completa pasa 63 pruebas Python.
También se corrigió el 404 de `/favicon.ico` apuntando al logo existente, con
una prueba HTTP para GET y HEAD. Lint, TypeScript estricto y build pasan. Playwright recorre seis flujos y 157
estados a 1440×1000, 834×1112 y 390×844 (más boletería a 1078×930); axe verifica
WCAG A/AA en las vistas de escritorio y móvil. El HTTP 400 de horario duplicado,
el HTTP 401 inicial y el fallo de red simulado son casos esperados y acotados.

La auditoría npm no reportó vulnerabilidades. La consulta de PyPI no devolvió
avisos para gunicorn 26.2.0, psycopg/psycopg-binary 3.3.6 ni psycopg-pool 3.3.2;
no es una auditoría completa de dependencias transitivas del sistema operativo.
Codex Security y CodeRabbit no están disponibles como herramientas/comandos;
no se afirma una aprobación por esos servicios. La revisión local y las pruebas
cubren aislamiento por rol/sucursal, sesiones revocadas, orígenes, archivos
privados, escape de HTML, atomicidad de ventas y reintentos de impresión/correo.

Evidencia local: `tmp/production-review-final/results.json` y
`tmp/production-verified/results.json` (pasada final con consola y axe). Ningún dato operativo ni credencial
se modificó. No se probaron servicios remotos, SMTP real o impresora física.

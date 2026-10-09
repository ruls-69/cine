# Informe de refactorización

## 1. Arquitectura anterior
Monolito Python y scripts globales de navegador: HTTP, negocio y reportes mezclados; módulos UI dependientes de variables léxicas del panel. Auditoría detallada: [mapa inicial](architecture-current.md).

## 2. Problemas encontrados
Servidor y panel con demasiadas responsabilidades; validaciones generales dentro de catálogo; dominio dependiente de persistencia para imprimir; expansión de entradas dentro del controlador Windows; lector Excel junto al cálculo; llamadas SQL desde rutas; registro global implícito de vistas; tipado limitado a primitivas UI y ausencia de límites automatizados.

## 3. Arquitectura nueva
Monolito modular con reglas independientes, aplicación transaccional, adaptadores inyectados y presentación por capacidad. No se modificó el stack para adoptar React.

## 4. Diagrama
El [diagrama y explicación](architecture.md) muestran los módulos y dependencias ejecutados.

## 5–6. Módulos y responsabilidades
Catálogo/programación, identidad/alcance, boletería/admisiones, Candy/anulaciones, caja/cierres, inventarios/arqueos, salarios/biométrico. Impresión y correo son adaptadores; panorama e historial son proyecciones. La tabla de API en `architecture.md` enumera las operaciones.

## 7. Estructura final
`erp/modules`, `erp/application`, `erp/infrastructure`, `erp/presentation`, `erp/shared`; `src/app`, `src/modules`, `src/shared`; pruebas, scripts y ADR. Los puntos de entrada operativos se conservan.

## 8. Implementaciones trasladadas
| Antes | Ahora |
|---|---|
| `cinema.py` | `erp/modules/catalog/domain.py` y validación compartida |
| `ticketing.py`, `candy.py`, `cash.py` | Dominio y presentación de sus respectivas capacidades |
| `payroll.py` | Dominio, aplicación, lector biométrico y presentación salarial |
| `storage.py` | `erp/infrastructure/persistence.py` |
| `auth_config.py` | `erp/modules/identity/infrastructure.py` |
| `thermal.py`, `cloud_print.py` | Adaptadores de `erp/modules/ticketing/` |
| `payroll_mail.py` | `erp/modules/payroll/mail.py` |
| Reglas/HTTP/PDF de `server.py` | `erp/application`, `erp/presentation/http.py`, inventario/caja/catálogo |
| `admin.js`, `ticketing.js`, `candy.js`, `payroll.js` | Composición y fábricas en `src/app` / `src/modules` |
| `app.js`, `trailers.js` | Composición pública y presentación de catálogo |

Las fachadas Python de raíz permanecen para compatibilidad; no son implementaciones duplicadas. Los scripts de raíz que siguen existiendo son outputs del build.

## 9. Archivos creados
Paquetes Python de capas/capacidades, fuentes frontend modulares, contratos Zod/TypeScript, puerto `StateRepository`, adaptador SQL, servicio transaccional, verificadores de arquitectura, `test_architecture.py`, `tests/contracts.test.mjs`, build modular y documentación/ADRs. La lista exacta de archivos de entrega está en el manifiesto del ZIP generado por `scripts/package_release.py`.

## 10. Archivos eliminados
Scripts fuente globales `ticketing.js`, `candy.js`, `payroll.js` y antiguo `scripts/build_frontend.cjs`. Sus funcionalidades viven en módulos; el panel carga un único bundle de composición. No se eliminaron datos operativos.

## 11. Casos de uso separados
Ejecutar comando autorizado en transacción; proyectar estado según rol; operaciones de inventario y arqueo; cierre/conciliación de caja; guardar metadatos de tráiler; importar tabla biométrica con lector inyectado; recuperar sesión y ventas pendientes con contratos. Se preservan checkout, promoción, anulaciones y cálculo salarial existentes.

## 12. Puertos y adaptadores
`StateRepository` / `SqlStateRepository`; `BiometricReader` / decodificador XLSX-CSV; `HttpTransport` / fetch inyectado. Repositorio en memoria para probar aplicación. Impresión térmica/cola, persistencia de sesiones, SMTP y renderizadores continúan como adaptadores separados de dominio.

## 13. Dependencias eliminadas
Dominio→storage, recibo→Windows thermal, caja/Candy/salarios→catálogo para validación genérica, HTTP→SQL y módulos UI→variables globales implícitas del panel. Zod se añade para datos externos; Rolldown se declara directamente reutilizando la versión que ya usaba Vitest. No se añade framework ni herramienta externa de boundaries.

## 14. Ciclos
No había ciclos Python detectados. Se eliminaron registros UI globales y se hizo explícita su composición. Los verificadores rechazan ciclos nuevos e imports contrarios a las capas.

## 15. Supabase
Sin cambios de esquema, RLS, roles, tablas ni secretos. Conexión privada centralizada en el adaptador existente, ahora dentro del paquete de infraestructura. No se contactó un proyecto remoto ni se ejecutó una migración.

## 16. Seguridad
Se preservan cookies, hashes, expiración, limitación de login, origen permitido, autorización de comandos, aislamiento de sucursal, validación de precios y acceso a reportes. Se amplió la prueba GET/HEAD de archivos privados a las carpetas nuevas. Zod rechaza snapshots/carritos malformados; las respuestas antiguas no restauran sesiones privadas.

Codex Security no está disponible como skill, CLI o herramienta en esta sesión. Se realizó revisión local de código y pruebas de seguridad existentes; no se atribuye un análisis a una herramienta no ejecutada.

## 17. Pruebas creadas y modificadas
Dominio: aforo 2×1 y entradas individuales. Aplicación: lector sustituible, repositorio en memoria, rollback. Cliente: carreras de sesión y autenticación, payload malformado, reintentos de cesta. Integración: imports de adaptadores actualizados y protección de nuevas rutas privadas. Playwright conserva flujos reales y revisión responsive/axe.

## 18–22. Validación final
Validación completada el 8 de octubre de 2026:

| Comprobación | Resultado |
|---|---|
| Lint | Aprobado; incluye referencias indefinidas, variables sin uso y reglas de arquitectura. |
| Dependencias | 49 módulos Python y 28 módulos frontend: sin imports prohibidos ni ciclos detectados. |
| Typecheck | Aprobado con strict, noUncheckedIndexedAccess y noUnused en todos los archivos TypeScript. |
| Python | 72 pruebas aprobadas: dominio, aplicación, SQL, HTTP, autorización, correo e impresión simulados. |
| Vitest | 16 pruebas aprobadas en 4 archivos. |
| Build | Aprobado; assets generados desde las fuentes modulares. |
| Playwright | 157 estados de pantalla, 6 flujos; desktop, tablet y móvil; sin errores JS/consola, rutas locales rotas ni incidencias axe detectadas. |
| Dependencias de producción npm | `npm audit --omit=dev`: 0 vulnerabilidades reportadas. |
| CLI | Ayuda de auth_config, migrate_data y print_agent comprobada; comando hash-password preservado y cubierto por prueba. |

Evidencia de navegador: `tmp/architecture-complete/results.json` y capturas de la misma carpeta. Se utilizó Playwright directamente porque no hay Browser plugin disponible. El HTTP 400 registrado corresponde a una validación negativa esperada. Las pruebas se ejecutaron sobre datos desechables; SMTP e impresora no recibieron acciones reales.

## 23. Deuda técnica
Las plantillas de UI siguen en JavaScript modular, sin tipado exhaustivo por campo; TypeScript estricto cubre los archivos `.ts`. Las reglas Python conservan registros dict. La persistencia sigue siendo un agregado completo con escrituras serializadas. El protocolo de autenticación no se sustituyó. Quedan fuera de las pruebas locales la carga real, una cuenta Supabase, la entrega SMTP y el hardware Epson.

## 24. Decisiones documentadas
[ADR 001](adr/001-modular-monolith.md): monolito modular sobre stack existente y alcance del tipado. [ADR 002](adr/002-atomic-state-repository.md): agregado transaccional y lector biométrico como puerto. No hubo deploy.


## Cierre de la migración incremental aprobada

Las capacidades identificadas están integradas: Identidad, Catálogo, Boletería, Candy, Caja, Inventario, Salarios y proyecciones de Panorama/Historial. No quedan implementaciones duplicadas activas en los archivos de compatibilidad.

En la última etapa se crearon `erp/modules/identity/application.py` (Identity y SessionStore), `erp/modules/catalog/application.py` (consultas públicas) y `erp/application/documents.py` (selección autorizada con renderizadores inyectados). HTTP mantiene el protocolo, no las reglas de selección de reportes o resolución de sesiones. La venta individual heredada se trasladó a los dominios de Candy y Boletería sin cambiar su contrato.

En frontend se añadieron `src/app/prepare-command.ts`, adaptadores `forms.ts` en Caja, Inventario, Catálogo y Salarios, `payroll/biometric-reader.ts`, `catalog/application.ts`, `shared/application/{commands,command-client}.ts` y `shared/presentation/forms.ts`. Los servicios de venta validan confirmaciones y mantienen el requestId de reintento; cartelera y tráileres reciben PublicCatalogClient. ESLint prohíbe fetch global en vistas de módulos para mantener la composición explícita.

Pruebas añadidas: transporte de ventas/reintentos, confirmaciones malformadas, contrato público, autorización previa al renderizado y filtrado público por sucursal. Credenciales, datos locales, rutas y esquema persistente se conservan. No se ejecutó deploy.

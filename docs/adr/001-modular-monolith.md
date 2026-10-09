# ADR 001 — Monolito modular adaptado al stack

Estado: aceptada para esta refactorización.

El sistema utiliza Python y vistas sin framework. Se separan reglas puras, operaciones autorizadas, adaptadores y presentación por capacidad; no se migra a React ni microservicios. La composición inyecta dependencias y las verificaciones de imports hacen cumplir los límites.

Se conserva JavaScript en vistas heredadas y se usa TypeScript estricto en nuevos contratos y cliente de sesión. Convertir cada plantilla y diccionario en esta misma extracción aumentaría la superficie de cambio; la limitación queda visible en documentación y no se disfraza con `any`. Las pruebas de navegador son obligatorias para los controladores migrados.

Consecuencia: menor acoplamiento sin cambio de rutas, diseño ni cuentas; queda una migración de tipos de vista que puede hacerse módulo por módulo.

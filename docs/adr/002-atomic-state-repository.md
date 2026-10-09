# ADR 002 — Puerto transaccional para el agregado existente

Estado: aceptada.

Una venta modifica simultáneamente capacidad/existencias, caja e historial. La persistencia existente es un documento JSON/JSONB con bloqueo de escritura. Se introduce `StateRepository` y su adaptador SQL, conservando una transacción por comando. No se crean repositorios por entidad que aparenten independencia inexistente.

El lector biométrico también se inyecta: decodificar Excel es infraestructura, calcular nómina es dominio. Impresión y correo tienen transacciones separadas y conservan sus protocolos de reintento.

Consecuencia: pruebas de aplicación con memoria, pruebas de rollback reales y sustitución de adaptadores sin modificar reglas. Escalar a tablas relacionales requerirá otra decisión y migración de datos; no se realiza implícitamente aquí.

# Control Financiero

Aplicación personal para registrar ingresos y gastos, organizar presupuestos mensuales y acumular ahorros.

## Estructura

- `frontend/`: Vue 3 + Vite.
- `backend/`: Express.js + Sequelize + PostgreSQL.
- `docker-compose.yml`: PostgreSQL local para desarrollo.

## Desarrollo local

Requisitos: Node.js 20+ y Docker.

1. Copia `backend/.env.example` como `backend/.env`.
2. Inicia PostgreSQL con `docker compose up -d`.
3. En `backend/`, ejecuta `npm install` y luego `npm run dev`.
4. En `frontend/`, ejecuta `npm install` y luego `npm run dev`.

PostgreSQL se publica en el puerto `5433` de Windows para evitar conflictos con instalaciones locales de PostgreSQL; dentro del contenedor sigue usando el puerto `5432`. En desarrollo, Express crea las tablas faltantes al iniciar y agrega conceptos iniciales de Deudas fijas, Transporte y Hogar.

## Funciones disponibles

- Resumen mensual de ingresos, gastos, presupuesto, saldo disponible y ahorros acumulados.
- Registro de ingresos de tipo salario o extra.
- Registro y eliminación de gastos vinculados a conceptos presupuestarios.
- Creación, edición de límite y eliminación de conceptos por sección o grupo.
- Creación de metas de ahorro y registro de aportes o retiros.
- Gráfica de ingresos y gastos de los últimos seis meses.

La versión actual es de uso local y para una sola persona; todavía no incluye inicio de sesión ni control de acceso. Para producción se deben agregar autenticación y migraciones versionadas antes de publicar la API.

## Conceptos

- Los ingresos incluyen salarios y extras.
- Los gastos se asignan a conceptos presupuestarios, por ejemplo préstamos, gasolina y supermercado.
- Los aportes a ahorros se registran por separado de los gastos y se acumulan; reducen el disponible del período, pero no se contabilizan como consumo.
- Moneda inicial: USD.

## Ramas

- `master`: base estable.
- `develop`: integración del desarrollo actual.

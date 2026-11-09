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

La interfaz usa datos de muestra mientras se conecta la API. El backend incluye una ruta de salud y una ruta de resumen inicial.

## Conceptos

- Los ingresos incluyen salarios y extras.
- Los gastos se asignan a conceptos presupuestarios, por ejemplo préstamos, gasolina y supermercado.
- Los aportes a ahorros se registran por separado de los gastos y se acumulan; reducen el disponible del período, pero no se contabilizan como consumo.
- Moneda inicial: USD.

## Ramas

- `master`: base estable.
- `develop`: integración del desarrollo actual.

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { sequelize } from './config/database.js'
import { financeRouter } from './routes/finance.js'

export const app = express()

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())
app.get('/api/health', async (_req, res) => {
  try {
    await sequelize.authenticate()
    return res.json({ status: 'ok', database: 'connected' })
  } catch {
    return res.status(503).json({ status: 'error', database: 'disconnected' })
  }
})
app.use('/api', financeRouter)
app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }))

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: 'Ocurrió un error inesperado.' })
})

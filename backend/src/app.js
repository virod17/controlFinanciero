import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { dashboardRouter } from './routes/dashboard.js'

export const app = express()

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/dashboard', dashboardRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: 'Ocurrió un error inesperado.' })
})

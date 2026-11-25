import { createHash, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { ServiceRecord } from '../models/index.js'
import { dateSchema } from './finance-validation.js'

export const serviceHistoryRouter = Router()

const digest = value => createHash('sha256').update(value).digest()

serviceHistoryRouter.use((req, res, next) => {
  const key = process.env.SERVICE_HISTORY_KEY
  res.set('Cache-Control', 'no-store')
  if (!key && process.env.NODE_ENV !== 'production') return next()
  if (!key) return res.status(503).json({ message: 'Configura SERVICE_HISTORY_KEY en el backend para habilitar Servicios y visitas.' })

  const provided = req.get('X-Service-History-Key') ?? ''
  if (!timingSafeEqual(digest(provided), digest(key))) {
    return res.status(401).json({ message: 'Ingresa una clave válida para abrir Servicios y visitas.' })
  }
  return next()
})

const legacyCategories = { car: 'maintenance', ac: 'maintenance', dentist: 'medical', vet: 'medical' }

function serializeRecord(record) {
  const data = record.toJSON()
  return { ...data, category: legacyCategories[data.category] ?? data.category }
}

const recordSchema = z.object({
  category: z.enum(['maintenance', 'exam', 'medical', 'car', 'ac', 'dentist', 'vet'])
    .transform(category => legacyCategories[category] ?? category),
  subject: z.string().trim().min(1).max(120),
  serviceDate: dateSchema,
  place: z.string().trim().min(1).max(160),
  amount: z.number().finite().min(0).max(9999999999.99).multipleOf(0.01).nullable().default(null),
  notes: z.string().trim().max(2000).default(''),
})

serviceHistoryRouter.param('id', async (req, res, next, id) => {
  if (!z.string().uuid().safeParse(id).success) {
    return res.status(400).json({ message: 'El identificador del registro no es válido.' })
  }
  try {
    const record = await ServiceRecord.findByPk(id)
    if (!record) return res.status(404).json({ message: 'Registro no encontrado.' })
    req.serviceRecord = record
    return next()
  } catch (error) {
    return next(error)
  }
})

serviceHistoryRouter.get('/', async (_req, res, next) => {
  try {
    const records = await ServiceRecord.findAll({ order: [['serviceDate', 'DESC'], ['createdAt', 'DESC'], ['id', 'ASC']] })
    return res.json(records.map(serializeRecord))
  } catch (error) {
    return next(error)
  }
})

async function saveRecord(req, res, next) {
  const parsed = recordSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Revisa el tipo, la fecha, el nombre, el lugar y el monto del registro.' })
  try {
    if (req.serviceRecord) return res.json(await req.serviceRecord.update(parsed.data))
    return res.status(201).json(await ServiceRecord.create(parsed.data))
  } catch (error) {
    return next(error)
  }
}

serviceHistoryRouter.post('/', saveRecord)
serviceHistoryRouter.put('/:id', saveRecord)

serviceHistoryRouter.delete('/:id', async (req, res, next) => {
  try {
    await req.serviceRecord.destroy()
    return res.status(204).end()
  } catch (error) {
    return next(error)
  }
})

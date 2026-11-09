import { Router } from 'express'
import { z } from 'zod'

export const dashboardRouter = Router()

dashboardRouter.get('/summary', (req, res) => {
  const query = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).safeParse(req.query)
  if (!query.success) return res.status(400).json({ message: 'El mes debe tener formato YYYY-MM.' })

  // La agregación persistida se conectará al implementar las operaciones CRUD.
  return res.json({
    month: query.data.month ?? new Date().toISOString().slice(0, 7),
    currency: 'USD',
    income: 0,
    expenses: 0,
    savingsContributions: 0,
    available: 0,
    budgetGroups: [],
    savingsGoals: [],
  })
})

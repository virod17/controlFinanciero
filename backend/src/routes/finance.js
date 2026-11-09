import { Router } from 'express'
import { Op } from 'sequelize'
import { z } from 'zod'
import {
  BudgetGroup,
  BudgetItem,
  MonthlyBudget,
  SavingsGoal,
  SavingsMovement,
  Transaction,
} from '../models/index.js'

export const financeRouter = Router()

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const positiveAmount = z.coerce.number().finite().positive().max(9999999999.99)

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Panama', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find(part => part.type === 'year').value
  const month = parts.find(part => part.type === 'month').value
  return `${year}-${month}`
}

function monthRange(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
  return { first: `${month}-01`, next }
}

function monthFromQuery(query) {
  const result = monthSchema.safeParse(query.month ?? currentMonth())
  return result.success ? result.data : null
}

function money(value) {
  return Number(value ?? 0)
}

async function getBudgetGroups(month) {
  const { first, next } = monthRange(month)
  const [groups, items, plans, expenses] = await Promise.all([
    BudgetGroup.findAll({ order: [['name', 'ASC']] }),
    BudgetItem.findAll({ order: [['name', 'ASC']] }),
    MonthlyBudget.findAll({ where: { month: first } }),
    Transaction.findAll({
      where: {
        type: 'expense',
        transactionDate: { [Op.gte]: first, [Op.lt]: next },
        budgetItemId: { [Op.ne]: null },
      },
      attributes: ['budgetItemId', 'amount'],
    }),
  ])

  const planByItem = new Map(plans.map(plan => [plan.budgetItemId, money(plan.plannedAmount)]))
  const spentByItem = new Map()
  for (const expense of expenses) {
    spentByItem.set(expense.budgetItemId, (spentByItem.get(expense.budgetItemId) ?? 0) + money(expense.amount))
  }
  const groupById = new Map(groups.map(group => [group.id, {
    id: group.id,
    name: group.name,
    color: group.color,
    items: [],
  }]))

  for (const item of items) {
    const group = groupById.get(item.groupId)
    if (group) {
      group.items.push({
        id: item.id,
        name: item.name,
        planned: planByItem.get(item.id) ?? 0,
        spent: spentByItem.get(item.id) ?? 0,
      })
    }
  }
  return [...groupById.values()]
}

async function getSavingsGoals(month) {
  const { first, next } = monthRange(month)
  const goals = await SavingsGoal.findAll({ include: [{ model: SavingsMovement, as: 'movements' }], order: [['name', 'ASC']] })
  return goals.map(goal => {
    const movements = goal.movements ?? []
    const balance = movements.reduce((sum, movement) => sum + (movement.type === 'deposit' ? money(movement.amount) : -money(movement.amount)), 0)
    const contributedThisMonth = movements
      .filter(movement => movement.movementDate >= first && movement.movementDate < next && movement.type === 'deposit')
      .reduce((sum, movement) => sum + money(movement.amount), 0)
    return {
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount === null ? null : money(goal.targetAmount),
      monthlyContribution: money(goal.monthlyContribution),
      balance,
      contributedThisMonth,
    }
  })
}

financeRouter.get('/dashboard/summary', async (req, res, next) => {
  const month = monthFromQuery(req.query)
  if (!month) return res.status(400).json({ message: 'El mes debe tener formato YYYY-MM.' })

  try {
    const { first, next: nextMonth } = monthRange(month)
    const [transactions, savingsMovements, budgetGroups, savingsGoals] = await Promise.all([
      Transaction.findAll({ where: { transactionDate: { [Op.gte]: first, [Op.lt]: nextMonth } } }),
      SavingsMovement.findAll({ where: { movementDate: { [Op.gte]: first, [Op.lt]: nextMonth } } }),
      getBudgetGroups(month),
      getSavingsGoals(month),
    ])

    const income = transactions.filter(item => item.type === 'income').reduce((sum, item) => sum + money(item.amount), 0)
    const expenses = transactions.filter(item => item.type === 'expense').reduce((sum, item) => sum + money(item.amount), 0)
    const deposits = savingsMovements.filter(item => item.type === 'deposit').reduce((sum, item) => sum + money(item.amount), 0)
    const withdrawals = savingsMovements.filter(item => item.type === 'withdrawal').reduce((sum, item) => sum + money(item.amount), 0)
    const savingsContributions = deposits - withdrawals
    const budgetTotal = budgetGroups.flatMap(group => group.items).reduce((sum, item) => sum + item.planned, 0)
    const savingsTotal = savingsGoals.reduce((sum, goal) => sum + goal.balance, 0)

    const trendStart = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 6, 1))
    const trendStartDate = trendStart.toISOString().slice(0, 10)
    const trendTransactions = await Transaction.findAll({
      where: { transactionDate: { [Op.gte]: trendStartDate, [Op.lt]: nextMonth } },
      attributes: ['type', 'amount', 'transactionDate'],
    })
    const trendMap = new Map()
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 - offset, 1))
      const key = date.toISOString().slice(0, 7)
      const label = new Intl.DateTimeFormat('es-PA', { month: 'short', timeZone: 'UTC' }).format(date).replace('.', '')
      trendMap.set(key, { month: key, label: label[0].toUpperCase() + label.slice(1), income: 0, expenses: 0 })
    }
    for (const transaction of trendTransactions) {
      const point = trendMap.get(transaction.transactionDate.slice(0, 7))
      if (point) point[transaction.type === 'income' ? 'income' : 'expenses'] += money(transaction.amount)
    }

    return res.json({
      month,
      currency: 'USD',
      income,
      expenses,
      savingsContributions,
      available: income - expenses - savingsContributions,
      budgetTotal,
      savingsTotal,
      budgetGroups,
      savingsGoals,
      monthlyTrend: [...trendMap.values()],
    })
  } catch (error) {
    return next(error)
  }
})

financeRouter.get('/transactions', async (req, res, next) => {
  const month = monthFromQuery(req.query)
  if (!month) return res.status(400).json({ message: 'El mes debe tener formato YYYY-MM.' })
  try {
    const { first, next: nextMonth } = monthRange(month)
    const rows = await Transaction.findAll({
      where: { transactionDate: { [Op.gte]: first, [Op.lt]: nextMonth } },
      include: [{ model: BudgetItem, as: 'budgetItem', include: [{ model: BudgetGroup, as: 'group' }] }],
      order: [['transactionDate', 'DESC'], ['createdAt', 'DESC']],
    })
    return res.json(rows.map(row => ({
      id: row.id,
      type: row.type,
      amount: money(row.amount),
      description: row.description,
      transactionDate: row.transactionDate,
      source: row.source,
      paymentMethod: row.paymentMethod,
      budgetItemId: row.budgetItemId,
      category: row.budgetItem?.name ?? row.source ?? 'Sin categoría',
      group: row.budgetItem?.group?.name ?? null,
    })))
  } catch (error) {
    return next(error)
  }
})

financeRouter.post('/transactions', async (req, res, next) => {
  const schema = z.object({
    type: z.enum(['income', 'expense']),
    amount: positiveAmount,
    description: z.string().trim().min(1).max(180),
    transactionDate: dateSchema,
    source: z.enum(['salary', 'extra']).optional(),
    budgetItemId: z.string().uuid().nullable().optional(),
    paymentMethod: z.string().trim().max(40).optional().nullable(),
  }).refine(data => data.type !== 'income' || data.source, { message: 'Selecciona si el ingreso es salario o extra.', path: ['source'] })
    .refine(data => data.type !== 'expense' || data.budgetItemId, { message: 'Selecciona un concepto para el gasto.', path: ['budgetItemId'] })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message, errors: parsed.error.flatten() })

  try {
    const data = parsed.data
    if (data.type === 'expense' && !await BudgetItem.findByPk(data.budgetItemId)) {
      return res.status(400).json({ message: 'El concepto de presupuesto seleccionado no existe.' })
    }
    const created = await Transaction.create({
      ...data,
      source: data.type === 'income' ? data.source : null,
      budgetItemId: data.type === 'expense' ? data.budgetItemId : null,
    })
    return res.status(201).json(created)
  } catch (error) {
    return next(error)
  }
})

financeRouter.delete('/transactions/:id', async (req, res, next) => {
  try {
    const count = await Transaction.destroy({ where: { id: req.params.id } })
    return count ? res.status(204).end() : res.status(404).json({ message: 'Movimiento no encontrado.' })
  } catch (error) {
    return next(error)
  }
})

financeRouter.get('/budget', async (req, res, next) => {
  const month = monthFromQuery(req.query)
  if (!month) return res.status(400).json({ message: 'El mes debe tener formato YYYY-MM.' })
  try {
    return res.json({ month, groups: await getBudgetGroups(month) })
  } catch (error) {
    return next(error)
  }
})

financeRouter.post('/budget/items', async (req, res, next) => {
  const schema = z.object({
    name: z.string().trim().min(1).max(100),
    groupName: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[\da-fA-F]{6}$/).optional(),
    plannedAmount: z.coerce.number().finite().min(0).max(9999999999.99),
    month: monthSchema.optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message })
  try {
    const data = parsed.data
    const [group] = await BudgetGroup.findOrCreate({
      where: { name: data.groupName },
      defaults: { name: data.groupName, color: data.color ?? '#3b806f' },
    })
    if (data.color) await group.update({ color: data.color })
    const item = await BudgetItem.create({ name: data.name, groupId: group.id })
    const month = data.month ?? currentMonth()
    const [plan] = await MonthlyBudget.findOrCreate({
      where: { budgetItemId: item.id, month: `${month}-01` },
      defaults: { budgetItemId: item.id, month: `${month}-01`, plannedAmount: data.plannedAmount },
    })
    return res.status(201).json({ id: item.id, name: item.name, group: group.name, plannedAmount: money(plan.plannedAmount) })
  } catch (error) {
    return next(error)
  }
})

financeRouter.put('/budget/items/:id', async (req, res, next) => {
  const schema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    plannedAmount: z.coerce.number().finite().min(0).max(9999999999.99).optional(),
    month: monthSchema.optional(),
  }).refine(data => data.name !== undefined || data.plannedAmount !== undefined, { message: 'Indica el nombre o el monto presupuestado.' })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message })
  try {
    const item = await BudgetItem.findByPk(req.params.id)
    if (!item) return res.status(404).json({ message: 'Concepto de presupuesto no encontrado.' })
    const { name, plannedAmount, month = currentMonth() } = parsed.data
    if (name) await item.update({ name })
    if (plannedAmount !== undefined) {
      const [plan] = await MonthlyBudget.findOrCreate({
        where: { budgetItemId: item.id, month: `${month}-01` },
        defaults: { budgetItemId: item.id, month: `${month}-01`, plannedAmount },
      })
      await plan.update({ plannedAmount })
    }
    return res.json({ id: item.id, name: item.name, plannedAmount })
  } catch (error) {
    return next(error)
  }
})

financeRouter.delete('/budget/items/:id', async (req, res, next) => {
  try {
    const count = await BudgetItem.destroy({ where: { id: req.params.id } })
    return count ? res.status(204).end() : res.status(404).json({ message: 'Concepto de presupuesto no encontrado.' })
  } catch (error) {
    return next(error)
  }
})

financeRouter.get('/savings', async (req, res, next) => {
  const month = monthFromQuery(req.query)
  if (!month) return res.status(400).json({ message: 'El mes debe tener formato YYYY-MM.' })
  try {
    return res.json({ month, goals: await getSavingsGoals(month) })
  } catch (error) {
    return next(error)
  }
})

financeRouter.post('/savings/goals', async (req, res, next) => {
  const schema = z.object({
    name: z.string().trim().min(1).max(100),
    targetAmount: z.coerce.number().positive().max(9999999999.99).nullable().optional(),
    monthlyContribution: z.coerce.number().min(0).max(9999999999.99).default(0),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message })
  try {
    const goal = await SavingsGoal.create(parsed.data)
    return res.status(201).json({ id: goal.id, name: goal.name, targetAmount: goal.targetAmount && money(goal.targetAmount), monthlyContribution: money(goal.monthlyContribution), balance: 0, contributedThisMonth: 0 })
  } catch (error) {
    return next(error)
  }
})

financeRouter.post('/savings/goals/:id/movements', async (req, res, next) => {
  const schema = z.object({
    type: z.enum(['deposit', 'withdrawal']),
    amount: positiveAmount,
    movementDate: dateSchema,
    note: z.string().trim().max(180).optional().nullable(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message })
  try {
    const goal = await SavingsGoal.findByPk(req.params.id, { include: [{ model: SavingsMovement, as: 'movements' }] })
    if (!goal) return res.status(404).json({ message: 'Meta de ahorro no encontrada.' })
    if (parsed.data.type === 'withdrawal') {
      const balance = goal.movements.reduce((sum, movement) => sum + (movement.type === 'deposit' ? money(movement.amount) : -money(movement.amount)), 0)
      if (parsed.data.amount > balance) return res.status(400).json({ message: 'El retiro supera el saldo acumulado de esta meta.' })
    }
    const movement = await SavingsMovement.create({ ...parsed.data, savingsGoalId: goal.id })
    return res.status(201).json(movement)
  } catch (error) {
    return next(error)
  }
})

financeRouter.delete('/savings/goals/:id', async (req, res, next) => {
  try {
    const count = await SavingsGoal.destroy({ where: { id: req.params.id } })
    return count ? res.status(204).end() : res.status(404).json({ message: 'Meta de ahorro no encontrada.' })
  } catch (error) {
    return next(error)
  }
})

financeRouter.get('/transactions/recent', async (_req, res, next) => {
  try {
    const rows = await Transaction.findAll({
      limit: 8,
      include: [{ model: BudgetItem, as: 'budgetItem', include: [{ model: BudgetGroup, as: 'group' }] }],
      order: [['transactionDate', 'DESC'], ['createdAt', 'DESC']],
    })
    return res.json(rows)
  } catch (error) {
    return next(error)
  }
})

import { Router } from 'express'
import { Op } from 'sequelize'
import { z } from 'zod'
import { sequelize } from '../config/database.js'
import { FixedDebt, FixedDebtPlan, FixedDebtPeriod, Transaction } from '../models/index.js'
import { dateSchema, monthFromQuery, monthSchema, positiveAmount } from './finance-validation.js'

export const fixedDebtsRouter = Router()

const uuid = z.string().uuid()
const monthStart = monthSchema.transform(month => `${month}-01`)
const cents = amount => Math.round(Number(amount) * 100)
const planSchema = z.object({
  month: monthStart,
  name: z.string().trim().min(1).max(100),
  amount: positiveAmount.min(0.01).multipleOf(0.01),
})

export async function getFixedDebts(month) {
  const first = `${month}-01`
  const debts = await FixedDebt.findAll({ where: { startsOn: { [Op.lte]: first } } })
  if (!debts.length) return []

  const [plans, periods] = await Promise.all([
    FixedDebtPlan.findAll({
      where: { effectiveMonth: { [Op.lte]: first } },
      order: [['effectiveMonth', 'ASC']],
    }),
    FixedDebtPeriod.findAll({
      where: { month: first },
      include: [{ model: Transaction, as: 'payment' }],
    }),
  ])
  const planByDebt = new Map(plans.map(plan => [plan.fixedDebtId, plan]))
  const periodByDebt = new Map(periods.map(period => [period.fixedDebtId, period]))
  return debts.flatMap(debt => {
    const archived = debt.archivedFrom !== null && debt.archivedFrom <= first
    const period = periodByDebt.get(debt.id)
    const firstContribution = Number(period?.firstContribution ?? 0)
    const secondContribution = Number(period?.secondContribution ?? 0)
    const reserved = (cents(firstContribution) + cents(secondContribution)) / 100
    if (archived && !reserved && !period?.payment) return []

    const plan = planByDebt.get(debt.id)
    const amount = Number(period?.payment?.amount ?? plan.amount)
    return [{
      id: debt.id,
      name: period?.payment?.description ?? plan.name,
      amount,
      plannedName: plan.name,
      plannedAmount: Number(plan.amount),
      firstContribution,
      secondContribution,
      reserved,
      paid: Boolean(period?.payment),
      paymentDate: period?.payment?.transactionDate ?? null,
      archived,
    }]
  }).sort((left, right) => left.name.localeCompare(right.name, 'es'))
}

function validate(schema, source, res) {
  const result = schema.safeParse(source)
  if (result.success) return result.data
  res.status(400).json({ message: result.error.issues[0].message })
  return null
}

fixedDebtsRouter.get('/', async (req, res, next) => {
  const month = monthFromQuery(req.query)
  if (!month) return res.status(400).json({ message: 'El mes debe tener formato YYYY-MM.' })
  try {
    return res.json({ month, debts: await getFixedDebts(month) })
  } catch (error) {
    return next(error)
  }
})

fixedDebtsRouter.post('/', async (req, res, next) => {
  const data = validate(planSchema, req.body, res)
  if (!data) return
  try {
    const id = await sequelize.transaction(async transaction => {
      const debt = await FixedDebt.create({ startsOn: data.month }, { transaction })
      await FixedDebtPlan.create({
        fixedDebtId: debt.id, effectiveMonth: data.month, name: data.name, amount: data.amount,
      }, { transaction })
      return debt.id
    })
    return res.status(201).json({ id })
  } catch (error) {
    return next(error)
  }
})

function updateDebt(method, path, schema, action) {
  fixedDebtsRouter[method](path, async (req, res, next) => {
    const data = validate(schema.extend({ id: uuid }), {
      ...(method === 'delete' ? req.query : req.body), id: req.params.id, half: req.params.half,
    }, res)
    if (!data) return
    try {
      const result = await sequelize.transaction(async transaction => {
        const debt = await FixedDebt.findByPk(data.id, { transaction, lock: transaction.LOCK.UPDATE })
        if (!debt || data.month < debt.startsOn) return { status: 404, message: 'Deuda fija no encontrada en este mes.' }
        const archived = debt.archivedFrom !== null && debt.archivedFrom <= data.month
        return action({ data, debt, archived, transaction })
      })
      if (result) return res.status(result.status).json({ message: result.message })
      return res.status(204).end()
    } catch (error) {
      return next(error)
    }
  })
}

updateDebt('put', '/:id', planSchema, async ({ data, debt, archived, transaction }) => {
  if (archived) return { status: 409, message: 'La deuda ya está archivada para este mes.' }
  await FixedDebtPlan.upsert({
    fixedDebtId: debt.id, effectiveMonth: data.month, name: data.name, amount: data.amount,
  }, { transaction })
})

updateDebt('delete', '/:id', z.object({ month: monthStart }), async ({ data, debt, archived, transaction }) => {
  if (!archived) await debt.update({ archivedFrom: data.month }, { transaction })
})

const contributionSchema = z.object({
  month: monthStart,
  amount: z.coerce.number().finite().min(0).max(9999999999.99).multipleOf(0.01),
})

updateDebt('put', '/:id/contributions/:half', contributionSchema.extend({
  half: z.enum(['1', '2']),
}), async ({ data, debt, archived, transaction }) => {
  const where = { fixedDebtId: debt.id, month: data.month }
  const period = await FixedDebtPeriod.findOne({ where, transaction })
  if (archived && !period) return { status: 409, message: 'La deuda ya está archivada para este mes.' }

  const field = data.half === '1' ? 'firstContribution' : 'secondContribution'
  if (period) await period.update({ [field]: data.amount }, { transaction })
  else await FixedDebtPeriod.create({ ...where, [field]: data.amount }, { transaction })
})

const paymentSchema = z.object({ month: monthStart, paid: z.boolean(), paymentDate: dateSchema.optional() })

updateDebt('put', '/:id/payment', paymentSchema, async ({ data, debt, archived, transaction }) => {
  const where = { fixedDebtId: debt.id, month: data.month }
  const period = await FixedDebtPeriod.findOne({ where, transaction })
  if (Boolean(period?.paymentTransactionId) === data.paid) return

  if (!data.paid) {
    const id = period.paymentTransactionId
    await period.update({ paymentTransactionId: null }, { transaction })
    await Transaction.destroy({ where: { id }, transaction })
    return
  }

  if (archived && !period) return { status: 409, message: 'La deuda ya está archivada para este mes.' }
  if (data.paymentDate?.slice(0, 7) !== data.month.slice(0, 7)) {
    return { status: 400, message: 'La fecha de pago debe pertenecer al mes seleccionado.' }
  }
  const plan = await FixedDebtPlan.findOne({
    where: { fixedDebtId: debt.id, effectiveMonth: { [Op.lte]: data.month } },
    order: [['effectiveMonth', 'DESC']],
    transaction,
  })
  const payment = await Transaction.create({
    type: 'expense', paid: true, amount: plan.amount,
    description: plan.name, transactionDate: data.paymentDate,
  }, { transaction })
  if (period) await period.update({ paymentTransactionId: payment.id }, { transaction })
  else await FixedDebtPeriod.create({ ...where, paymentTransactionId: payment.id }, { transaction })
})

import { Router } from 'express'
import { Op } from 'sequelize'
import { z } from 'zod'
import { sequelize } from '../config/database.js'
import { BankAccount, DebtPartialPayment, FixedDebt, FixedDebtPlan, FixedDebtPeriod, FixedDebtSettings, Transaction } from '../models/index.js'
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

function findPartialPayments(where, transaction) {
  return DebtPartialPayment.findAll({
    where, transaction,
    include: [{ model: Transaction, as: 'payment' }],
    order: [[{ model: Transaction, as: 'payment' }, 'transactionDate', 'ASC'], ['createdAt', 'ASC']],
  })
}

function paidFromHalf(payments, half) {
  return payments.reduce((sum, row) => sum + (row.half === half ? cents(row.payment.amount) : 0), 0)
}

function findPlan(fixedDebtId, month, transaction) {
  return FixedDebtPlan.findOne({
    where: { fixedDebtId, effectiveMonth: { [Op.lte]: month } },
    order: [['effectiveMonth', 'DESC']],
    transaction,
  })
}

export async function getFixedDebts(month) {
  const first = `${month}-01`
  const debts = await FixedDebt.findAll({ where: { startsOn: { [Op.lte]: first } } })
  if (!debts.length) return []

  const [plans, periods, partialPayments] = await Promise.all([
    FixedDebtPlan.findAll({
      where: { effectiveMonth: { [Op.lte]: first } },
      order: [['effectiveMonth', 'ASC']],
    }),
    FixedDebtPeriod.findAll({
      where: { month: first },
      include: [{ model: Transaction, as: 'payment' }],
    }),
    findPartialPayments({ month: first }),
  ])
  const paymentsByDebt = new Map()
  for (const row of partialPayments) {
    if (!paymentsByDebt.has(row.fixedDebtId)) paymentsByDebt.set(row.fixedDebtId, [])
    paymentsByDebt.get(row.fixedDebtId).push(row)
  }
  const planByDebt = new Map(plans.map(plan => [plan.fixedDebtId, plan]))
  const periodByDebt = new Map(periods.map(period => [period.fixedDebtId, period]))
  return debts.flatMap(debt => {
    const archived = debt.archivedFrom !== null && debt.archivedFrom <= first
    const period = periodByDebt.get(debt.id)
    const firstContribution = Number(period?.firstContribution ?? 0)
    const secondContribution = Number(period?.secondContribution ?? 0)
    const payments = paymentsByDebt.get(debt.id) ?? []
    if (archived && !firstContribution && !secondContribution && !period?.payment && !payments.length) return []

    const firstPaid = paidFromHalf(payments, 1)
    const secondPaid = paidFromHalf(payments, 2)
    const partialPaid = firstPaid + secondPaid
    const finalPaid = cents(period?.payment?.amount ?? 0)
    const plan = planByDebt.get(debt.id)
    const amount = period?.payment ? (partialPaid + finalPaid) / 100 : Number(plan.amount)
    const firstAvailable = Math.max(0, cents(firstContribution) - firstPaid)
    const finalFromFirst = Math.min(firstAvailable, finalPaid)
    const firstRemaining = firstAvailable - finalFromFirst
    const secondRemaining = Math.max(0, cents(secondContribution) - secondPaid - (finalPaid - finalFromFirst))
    const remainingDue = Math.max(0, cents(amount) - partialPaid - finalPaid) / 100
    return [{
      id: debt.id,
      name: period?.payment?.description ?? plan.name,
      amount,
      plannedName: plan.name,
      plannedAmount: Number(plan.amount),
      firstContribution,
      firstAccountId: period?.firstAccountId ?? null,
      secondAccountId: period?.secondAccountId ?? null,
      secondContribution,
      reserved: (firstRemaining + secondRemaining) / 100,
      firstRemaining: firstRemaining / 100,
      secondRemaining: secondRemaining / 100,
      paidAmount: (partialPaid + finalPaid) / 100,
      remainingDue,
      paid: remainingDue === 0,
      hasFinalPayment: Boolean(period?.payment),
      partialPayments: payments.map(row => ({
        id: row.transactionId, half: row.half, amount: Number(row.payment.amount), date: row.payment.transactionDate,
      })),
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

const settingsId = 1

fixedDebtsRouter.get('/settings', async (_req, res, next) => {
  try {
    const settings = await FixedDebtSettings.findByPk(settingsId)
    return res.json({ bankAccountId: settings?.bankAccountId ?? null })
  } catch (error) {
    return next(error)
  }
})

fixedDebtsRouter.put('/settings', async (req, res, next) => {
  const data = validate(z.object({ bankAccountId: uuid }), req.body, res)
  if (!data) return
  try {
    if (!await BankAccount.findByPk(data.bankAccountId)) {
      return res.status(400).json({ message: 'La cuenta seleccionada no existe.' })
    }
    await FixedDebtSettings.upsert({ id: settingsId, bankAccountId: data.bankAccountId })
    return res.status(204).end()
  } catch (error) {
    return next(error)
  }
})

fixedDebtsRouter.post('/contributions/generate', async (req, res, next) => {
  const data = validate(z.object({ month: monthStart, half: z.enum(['1', '2']) }), req.body, res)
  if (!data) return
  try {
    const settings = await FixedDebtSettings.findByPk(settingsId)
    if (!settings) return res.status(400).json({ message: 'Selecciona la cuenta predeterminada para las deudas fijas.' })

    const firstHalf = data.half === '1'
    const field = firstHalf ? 'firstContribution' : 'secondContribution'
    const otherField = firstHalf ? 'secondContribution' : 'firstContribution'
    const accountField = firstHalf ? 'firstAccountId' : 'secondAccountId'
    const generated = await sequelize.transaction(async transaction => {
      const debts = await FixedDebt.findAll({
        where: {
          startsOn: { [Op.lte]: data.month },
          [Op.or]: [{ archivedFrom: null }, { archivedFrom: { [Op.gt]: data.month } }],
        },
        order: [['id', 'ASC']],
        lock: transaction.LOCK.UPDATE,
        transaction,
      })
      let count = 0
      for (const debt of debts) {
        const where = { fixedDebtId: debt.id, month: data.month }
        const period = await FixedDebtPeriod.findOne({ where, transaction })
        if (period?.paymentTransactionId || Number(period?.[field] ?? 0) > 0) continue

        const plan = await findPlan(debt.id, data.month, transaction)
        const monthly = cents(plan.amount)
        const first = Math.ceil(monthly / 2)
        const planned = firstHalf ? first : monthly - first
        const unallocated = monthly - cents(period?.[otherField] ?? 0)
        const amount = Math.min(planned, unallocated)
        if (amount <= 0) continue

        const values = { [field]: amount / 100, [accountField]: settings.bankAccountId }
        if (period) await period.update(values, { transaction })
        else await FixedDebtPeriod.create({ ...where, ...values }, { transaction })
        count++
      }
      return count
    })
    return res.json({ generated })
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
      ...(method === 'delete' ? req.query : req.body), id: req.params.id, half: req.params.half ?? req.body?.half, paymentId: req.params.paymentId,
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
  bankAccountId: uuid.nullable().optional(),
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
  const accountField = data.half === '1' ? 'firstAccountId' : 'secondAccountId'
  const accountId = data.amount === 0 ? null : (data.bankAccountId === undefined ? period?.[accountField] : data.bankAccountId)
  if (accountId && !await BankAccount.findByPk(accountId, { transaction })) {
    return { status: 400, message: 'La cuenta seleccionada no existe.' }
  }

  const payments = await findPartialPayments(where, transaction)
  if (cents(data.amount) < paidFromHalf(payments, Number(data.half))) {
    return { status: 409, message: 'El aporte debe cubrir los pagos registrados de esta quincena.' }
  }
  if (period?.paymentTransactionId && (cents(data.amount) !== cents(period[field]) || (accountId ?? null) !== period[accountField])) {
    return { status: 409, message: 'Desmarca el pago final antes de editar este aporte.' }
  }

  const values = { [field]: data.amount, [accountField]: accountId ?? null }
  if (period) await period.update(values, { transaction })
  else await FixedDebtPeriod.create({ ...where, ...values }, { transaction })
})

const partialSchema = z.object({
  month: monthStart,
  paymentId: uuid,
  half: z.enum(['1', '2']),
  amount: positiveAmount.min(0.01).multipleOf(0.01),
  paymentDate: dateSchema,
})

updateDebt('put', '/:id/partial-payments/:paymentId', partialSchema, async ({ data, debt, transaction }) => {
  const where = { fixedDebtId: debt.id, month: data.month }
  const period = await FixedDebtPeriod.findOne({ where, transaction })
  const payments = await findPartialPayments(where, transaction)
  if (payments.some(row => row.transactionId === data.paymentId)) return
  if (period?.paymentTransactionId) return { status: 409, message: 'Desmarca el pago final antes de registrar otro pago.' }
  if (!data.paymentDate.startsWith(data.month.slice(0, 7))) {
    return { status: 400, message: 'La fecha debe pertenecer al mes seleccionado.' }
  }

  const half = Number(data.half)
  const contribution = half === 1 ? period?.firstContribution : period?.secondContribution
  if (cents(data.amount) > cents(contribution ?? 0) - paidFromHalf(payments, half)) {
    return { status: 400, message: 'El pago supera lo que queda apartado en esta quincena.' }
  }
  const plan = await findPlan(debt.id, data.month, transaction)
  const paid = paidFromHalf(payments, 1) + paidFromHalf(payments, 2)
  if (cents(data.amount) > cents(plan.amount) - paid) {
    return { status: 400, message: 'El pago supera el monto pendiente del mes.' }
  }

  await Transaction.create({
    id: data.paymentId, type: 'expense', paid: true, amount: data.amount,
    description: plan.name, transactionDate: data.paymentDate,
  }, { transaction })
  await DebtPartialPayment.create({ ...where, half, transactionId: data.paymentId }, { transaction })
})

updateDebt('delete', '/:id/partial-payments/:paymentId', z.object({
  month: monthStart, paymentId: uuid,
}), async ({ data, debt, transaction }) => {
  const where = { fixedDebtId: debt.id, month: data.month }
  const period = await FixedDebtPeriod.findOne({ where, transaction })
  if (period?.paymentTransactionId) return { status: 409, message: 'Desmarca el pago final antes de quitar un pago parcial.' }
  const count = await DebtPartialPayment.destroy({ where: { ...where, transactionId: data.paymentId }, transaction })
  if (count) await Transaction.destroy({ where: { id: data.paymentId }, transaction })
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
  const plan = await findPlan(debt.id, data.month, transaction)
  const payments = await findPartialPayments(where, transaction)
  const remaining = cents(plan.amount) - paidFromHalf(payments, 1) - paidFromHalf(payments, 2)
  if (remaining <= 0) return
  const payment = await Transaction.create({
    type: 'expense', paid: true, amount: remaining / 100,
    description: plan.name, transactionDate: data.paymentDate,
  }, { transaction })
  if (period) await period.update({ paymentTransactionId: payment.id }, { transaction })
  else await FixedDebtPeriod.create({ ...where, paymentTransactionId: payment.id }, { transaction })
})

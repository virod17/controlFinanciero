import { z } from 'zod'

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
export const dateSchema = z.string().date()
export const positiveAmount = z.coerce.number().finite().positive().max(9999999999.99)

export function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Panama', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find(part => part.type === 'year').value
  const month = parts.find(part => part.type === 'month').value
  return `${year}-${month}`
}

export function monthRange(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
  return { first: `${month}-01`, next }
}

export function monthFromQuery(query) {
  const result = monthSchema.safeParse(query.month ?? currentMonth())
  return result.success ? result.data : null
}

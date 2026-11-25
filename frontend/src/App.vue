<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Accounts from './Accounts.vue'
import ServiceHistory from './ServiceHistory.vue'
import FixedDebts from './FixedDebts.vue'
import FixedDebtBudget from './FixedDebtBudget.vue'
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const today = new Date()
const month = ref(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
const activeView = ref('Resumen')
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const toast = ref('')
const showTransactionModal = ref(false)
const transactions = ref([])
const budgetGroups = ref([])
const savingsGoals = ref([])
const accounts = ref([])
const defaultDebtAccountId = ref(null)
let loadVersion = 0
const summary = ref({ income: 0, expenses: 0, savingsContributions: 0, available: 0, budgetTotal: 0, savingsTotal: 0, monthlyTrend: [] })

const navItems = [
  { name: 'Resumen', icon: '◫' },
  { name: 'Movimientos', icon: '↕' },
  { name: 'Presupuesto', icon: '▤' },
  { name: 'Deudas fijas', icon: '▣' },
  { name: 'Ahorros', icon: '◉' },
  { name: 'Cuentas', icon: '▣' },
  { name: 'Servicios y visitas', icon: '▤' },
]

const transactionForm = ref({ type: 'expense', description: '', amount: '', transactionDate: localDate(), source: 'salary', paid: false, budgetItemId: '' })
const budgetForm = ref({ groupName: '', name: '', plannedAmount: 0, color: '#ed8c70' })
const goalForm = ref({ name: '', targetAmount: '', monthlyContribution: 0 })
const movementForm = ref({ savingsGoalId: '', type: 'deposit', amount: '', movementDate: localDate(), note: '' })

function localDate() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const monthLabel = computed(() => {
  if (!month.value) return ''
  const [year, number] = month.value.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PA', { month: 'long', year: 'numeric' }).format(new Date(year, number - 1, 1))
})
const budgetItems = computed(() => budgetGroups.value.flatMap(group => group.items.map(item => ({ ...item, group: group.name, color: group.color }))))
const recentTransactions = computed(() => transactions.value.slice(0, 6))
const fixedDebts = computed(() => summary.value.fixedDebts ?? [])
const pendingDebts = computed(() => fixedDebts.value.filter(debt => !debt.paid))
const paidDebtTotal = computed(() => fixedDebts.value.reduce((sum, debt) => sum + debt.paidAmount, 0))
const pendingDebtTotal = computed(() => fixedDebts.value.reduce((sum, debt) => sum + debt.remainingDue, 0))
const monthlySavingsPlanned = computed(() => savingsGoals.value.reduce((sum, goal) => sum + goal.monthlyContribution, 0))
const formatMoney = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const formatDate = value => new Intl.DateTimeFormat('es-PA', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`))
const transactionCategory = item => item.type === 'income' ? (item.source === 'salary' ? 'Salario' : 'Extra') : (item.category || 'Gasto')

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  })
  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || 'No se pudo completar la solicitud.')
    error.status = response.status
    throw error
  }
  return data
}

async function loadData() {
  const version = ++loadVersion
  const selectedMonth = month.value
  if (!selectedMonth) {
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const [summaryData, transactionData, budgetData, savingsData, accountData, debtSettings] = await Promise.all([
      api(`/dashboard/summary?month=${selectedMonth}`),
      api(`/transactions?month=${selectedMonth}`),
      api(`/budget?month=${selectedMonth}`),
      api(`/savings?month=${selectedMonth}`),
      api('/accounts'),
      api('/fixed-debts/settings'),
    ])
    if (version !== loadVersion) return
    summary.value = summaryData
    transactions.value = transactionData
    budgetGroups.value = budgetData.groups
    savingsGoals.value = savingsData.goals
    accounts.value = accountData
    defaultDebtAccountId.value = debtSettings.bankAccountId
    if (!movementForm.value.savingsGoalId && savingsGoals.value.length) movementForm.value.savingsGoalId = savingsGoals.value[0].id
  } catch (error) {
    if (version === loadVersion) errorMessage.value = error.message
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

watch(month, value => {
  if (!value) {
    month.value = localDate().slice(0, 7)
    return
  }
  loadData()
})
onMounted(loadData)

function notify(message) {
  toast.value = message
  setTimeout(() => { toast.value = '' }, 2600)
}

function openTransaction(type = 'expense') {
  transactionForm.value = { type, description: '', amount: '', transactionDate: localDate(), source: 'salary', paid: false, budgetItemId: budgetItems.value[0]?.id ?? '' }
  showTransactionModal.value = true
}

async function saveTransaction() {
  saving.value = true
  errorMessage.value = ''
  try {
    const payload = {
      type: transactionForm.value.type,
      description: transactionForm.value.description.trim(),
      amount: Number(transactionForm.value.amount),
      transactionDate: transactionForm.value.transactionDate,
      ...(transactionForm.value.type === 'income'
        ? { source: transactionForm.value.source }
        : { budgetItemId: transactionForm.value.budgetItemId, paid: transactionForm.value.paid }),
    }
    await api('/transactions', { method: 'POST', body: JSON.stringify(payload) })
    showTransactionModal.value = false
    notify('Movimiento guardado')
    await loadData()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    saving.value = false
  }
}

async function changeExpensePayment(item, paid) {
  saving.value = true
  errorMessage.value = ''
  try {
    await api(`/transactions/${item.id}/payment`, { method: 'PATCH', body: JSON.stringify({ paid }) })
    await loadData()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    saving.value = false
  }
}

async function saveFixedDebt(path, method, data, onSuccess) {
  saving.value = true
  errorMessage.value = ''
  try {
    const selectedMonth = month.value
    const options = { method }
    if (method === 'DELETE') path += `?month=${selectedMonth}`
    else options.body = JSON.stringify({ ...data, month: selectedMonth })
    const result = await api(`/fixed-debts${path}`, options)
    onSuccess?.()
    if (path === '/contributions/generate') {
      notify(result.generated ? `Aportes generados para ${result.generated} deudas` : 'No hay aportes por generar para esta quincena')
    } else {
      notify(path === '/settings' ? 'Cuenta predeterminada guardada' : 'Deuda actualizada')
    }
    await loadData()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    saving.value = false
  }
}

async function deleteTransaction(item) {
  if (!window.confirm(`¿Eliminar el movimiento “${item.description}”?`)) return
  try {
    await api(`/transactions/${item.id}`, { method: 'DELETE' })
    notify('Movimiento eliminado')
    await loadData()
  } catch (error) { errorMessage.value = error.message }
}

async function saveBudgetItem() {
  saving.value = true
  try {
    await api('/budget/items', {
      method: 'POST',
      body: JSON.stringify({ ...budgetForm.value, plannedAmount: Number(budgetForm.value.plannedAmount), month: month.value }),
    })
    budgetForm.value.name = ''
    budgetForm.value.plannedAmount = 0
    notify('Concepto agregado al presupuesto')
    await loadData()
  } catch (error) { errorMessage.value = error.message } finally { saving.value = false }
}

async function updatePlannedAmount(item) {
  const value = window.prompt(`Presupuesto mensual para ${item.name}:`, String(item.planned))
  if (value === null) return
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    errorMessage.value = 'Escribe un monto válido, igual o mayor que cero.'
    return
  }
  try {
    await api(`/budget/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ plannedAmount: amount, month: month.value }) })
    notify('Presupuesto actualizado')
    await loadData()
  } catch (error) { errorMessage.value = error.message }
}

async function removeBudgetItem(item) {
  if (!window.confirm(`¿Eliminar “${item.name}” del presupuesto?`)) return
  try {
    await api(`/budget/items/${item.id}`, { method: 'DELETE' })
    notify('Concepto eliminado')
    await loadData()
  } catch (error) { errorMessage.value = error.message }
}

async function createAccount(name, onSuccess) {
  saving.value = true
  errorMessage.value = ''
  try {
    await api('/accounts', { method: 'POST', body: JSON.stringify({ name }) })
    onSuccess()
    await loadData()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    saving.value = false
  }
}

async function assignSavingsAccount(goal, event) {
  const select = event.target
  saving.value = true
  errorMessage.value = ''
  try {
    await api(`/savings/goals/${goal.id}/account`, {
      method: 'PATCH', body: JSON.stringify({ bankAccountId: select.value || null }),
    })
    await loadData()
  } catch (error) {
    select.value = goal.bankAccountId ?? ''
    errorMessage.value = error.message
  } finally {
    saving.value = false
  }
}

async function saveGoal() {
  saving.value = true
  try {
    const goal = await api('/savings/goals', {
      method: 'POST',
      body: JSON.stringify({
        name: goalForm.value.name.trim(),
        targetAmount: goalForm.value.targetAmount === '' ? null : Number(goalForm.value.targetAmount),
        monthlyContribution: Number(goalForm.value.monthlyContribution || 0),
      }),
    })
    goalForm.value = { name: '', targetAmount: '', monthlyContribution: 0 }
    movementForm.value.savingsGoalId = goal.id
    notify('Meta de ahorro creada')
    await loadData()
  } catch (error) { errorMessage.value = error.message } finally { saving.value = false }
}

async function saveMovement() {
  saving.value = true
  try {
    await api(`/savings/goals/${movementForm.value.savingsGoalId}/movements`, {
      method: 'POST',
      body: JSON.stringify({ ...movementForm.value, amount: Number(movementForm.value.amount) }),
    })
    movementForm.value.amount = ''
    movementForm.value.note = ''
    notify(movementForm.value.type === 'deposit' ? 'Aporte acumulado en tus ahorros' : 'Retiro registrado')
    await loadData()
  } catch (error) { errorMessage.value = error.message } finally { saving.value = false }
}

async function removeGoal(goal) {
  if (!window.confirm(`¿Eliminar la meta “${goal.name}” y sus movimientos?`)) return
  try {
    await api(`/savings/goals/${goal.id}`, { method: 'DELETE' })
    notify('Meta eliminada')
    await loadData()
  } catch (error) { errorMessage.value = error.message }
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">b.</div><span>balance</span></div>
      <div class="workspace-label">TU ESPACIO</div>
      <nav class="nav-list" aria-label="Navegación principal">
        <button v-for="item in navItems" :key="item.name" class="nav-item" :class="{ active: activeView === item.name }" @click="activeView = item.name">
          <span class="nav-icon">{{ item.icon }}</span><span>{{ item.name }}</span>
          <span v-if="item.name === 'Ahorros'" class="nav-count">{{ savingsGoals.length }}</span>
        </button>
      </nav>
      <div class="sidebar-bottom"><div class="tip-card"><div class="tip-spark">✳</div><strong>Un paso a la vez</strong><p>Los pequeños hábitos hacen una gran diferencia.</p></div><div class="profile"><span class="avatar">V</span><span class="profile-info"><b>Mi espacio</b><small>Finanzas personales</small></span></div></div>
    </aside>

    <main class="main-area">
      <header class="topbar"><div class="breadcrumb">Finanzas <span>/</span> <b>{{ activeView }}</b></div><span class="connection-state"><i></i> Conectado a PostgreSQL</span></header>
      <div class="page-content">
        <section class="page-heading">
          <div><div class="eyebrow">TU DINERO, MÁS CLARO</div><h1>{{ activeView === 'Resumen' ? 'Tu panorama financiero' : activeView }}</h1><p v-if="activeView === 'Resumen'">Ingresos, gastos y ahorros de un vistazo.</p><p v-else-if="activeView === 'Servicios y visitas'">Mantenimientos, consultas y exámenes</p></div>
          <div v-if="activeView !== 'Servicios y visitas'" class="heading-actions"><label class="month-select">▦ <input v-model="month" type="month" :aria-label="`Mes seleccionado: ${monthLabel}`" /></label><button class="primary-button" @click="openTransaction('expense')"><span>＋</span> Agregar movimiento</button></div>
        </section>

        <div v-if="errorMessage && activeView !== 'Servicios y visitas'" class="error-banner" role="alert"><span>{{ errorMessage }}</span><button @click="loadData">Reintentar</button></div>
        <div v-if="loading && activeView !== 'Servicios y visitas'" class="loading-card">Cargando tus datos financieros…</div>

        <template v-else-if="activeView === 'Resumen'">
          <section class="summary-grid">
            <article class="summary-card balance-card"><div class="card-label">DISPONIBLE ESTE MES</div><div class="summary-value">{{ formatMoney(summary.available) }}</div><div class="card-foot">Ingresos menos gastos pagados</div><div v-if="summary.reservedForDebts" class="card-foot">Apartado para deudas: {{ formatMoney(summary.reservedForDebts) }} · Libre: {{ formatMoney(summary.available - summary.reservedForDebts) }}</div><div class="balance-art"><span></span><span></span><span></span></div></article>
            <article class="summary-card"><div class="card-label">INGRESOS <span class="card-icon income-icon">↗</span></div><div class="summary-value">{{ formatMoney(summary.income) }}</div><div class="card-foot">Salarios y extras en {{ monthLabel }}</div></article>
            <article class="summary-card"><div class="card-label">GASTOS PAGADOS <span class="card-icon expense-icon">↘</span></div><div class="summary-value">{{ formatMoney(summary.expenses) }}</div><div class="card-foot">Gastos por pagar: <b>{{ formatMoney(summary.pendingExpenses) }}</b></div></article>
            <article class="summary-card"><div class="card-label">AHORROS ACUMULADOS <span class="card-icon savings-icon">◉</span></div><div class="summary-value">{{ formatMoney(summary.savingsTotal) }}</div><div class="card-foot">{{ formatMoney(monthlySavingsPlanned) }} planificados este mes</div></article>
          </section>

          <section class="content-grid">
            <article class="panel chart-panel"><div class="panel-heading"><div><h2>Tu flujo de dinero</h2><p>Ingresos y gastos de los últimos seis meses</p></div></div><div class="chart-legend"><span><i class="legend-income"></i> Ingresos</span><span><i class="legend-expense"></i> Gastos</span></div>
              <div v-if="summary.monthlyTrend?.some(point => point.income || point.expenses)" class="bar-chart"><div class="chart-y"><span>{{ formatMoney(Math.max(1, ...summary.monthlyTrend.map(point => Math.max(point.income, point.expenses)))) }}</span><span>$0</span></div><div class="chart-area"><div class="grid-line line-1"></div><div class="grid-line line-2"></div><div v-for="point in summary.monthlyTrend" :key="point.month" class="bar-group"><div class="bars"><span class="bar income-bar" :style="{ height: `${Math.max(point.income ? 4 : 0, point.income / Math.max(1, ...summary.monthlyTrend.map(p => Math.max(p.income, p.expenses))) * 100)}%` }" :title="`Ingresos ${formatMoney(point.income)}`"></span><span class="bar expense-bar" :style="{ height: `${Math.max(point.expenses ? 4 : 0, point.expenses / Math.max(1, ...summary.monthlyTrend.map(p => Math.max(p.income, p.expenses))) * 100)}%` }" :title="`Gastos ${formatMoney(point.expenses)}`"></span></div><span class="month-label">{{ point.label }}</span></div></div></div>
              <div v-else class="empty-chart">Registra ingresos y gastos para ver tu gráfica mensual.</div>
            </article>
            <article class="panel">
              <div class="panel-heading">
                <div><h2>Deudas fijas</h2><p>Estado de {{ monthLabel }}</p></div>
                <button class="text-link" @click="activeView = 'Deudas fijas'">Ver todas →</button>
              </div>
              <template v-if="fixedDebts.length">
                <div class="budget-overview">
                  <div><small>PAGADO</small><strong>{{ formatMoney(paidDebtTotal) }}</strong></div>
                  <div class="budget-total"><small>PENDIENTE</small><strong>{{ formatMoney(pendingDebtTotal) }}</strong></div>
                </div>
                <div class="budget-list">
                  <div v-for="debt in fixedDebts" :key="debt.id" class="budget-meta">
                    <span class="budget-name"><b>{{ debt.name }}</b><small>{{ debt.paid ? 'Pagada' : 'Pendiente' }}</small></span>
                    <span class="budget-numbers"><b>{{ formatMoney(debt.amount) }}</b><small>{{ formatMoney(debt.reserved) }} apartados</small></span>
                  </div>
                </div>
              </template>
              <div v-else class="empty-state compact">Agrega tus cuotas mensuales en Presupuesto.</div>
            </article>
          </section>

          <section class="lower-grid">
            <article class="panel transactions-panel"><div class="panel-heading"><div><h2>Movimientos recientes</h2><p>Registros del mes seleccionado</p></div><button class="text-link" @click="activeView = 'Movimientos'">Ver todos →</button></div><div v-if="recentTransactions.length" class="transaction-table"><div class="table-head"><span>DETALLE</span><span>CATEGORÍA</span><span>MONTO</span></div><div v-for="item in recentTransactions" :key="item.id" class="transaction-row"><div class="transaction-title"><span class="transaction-mark" :class="item.type === 'income' ? 'mint' : 'peach'">{{ item.type === 'income' ? '↗' : '•' }}</span><span><b>{{ item.description }}</b><small>{{ formatDate(item.transactionDate) }}<template v-if="item.type === 'expense'"> · {{ item.paid ? 'Pagado' : 'Pendiente' }}</template></small></span></div><span class="category-pill">{{ transactionCategory(item) }}</span><b class="transaction-amount" :class="item.type">{{ item.type === 'income' ? '+' : '−' }}{{ formatMoney(item.amount) }}</b></div></div><div v-else class="empty-state">Todavía no has registrado movimientos. Usa “Agregar movimiento” para comenzar.</div>
              <section v-if="pendingDebts.length" class="pending-debt-list">
                <div class="panel-heading">
                  <h2>Pendiente por pagar</h2>
                  <button class="text-link" @click="activeView = 'Deudas fijas'">Ver deudas →</button>
                </div>
                <div v-for="debt in pendingDebts" :key="debt.id" class="budget-meta">
                  <span class="budget-name"><b>{{ debt.name }}</b></span>
                  <span class="budget-numbers"><b>{{ formatMoney(debt.remainingDue) }}</b></span>
                </div>
                <div class="budget-meta">
                  <span class="budget-name"><b>Total pendiente</b></span>
                  <span class="budget-numbers"><b>{{ formatMoney(pendingDebtTotal) }}</b></span>
                </div>
              </section>
            </article>
            <article class="panel savings-panel"><div class="panel-heading"><div><h2>Mis ahorros</h2><p>Saldo acumulado por meta</p></div><button class="text-link" @click="activeView = 'Ahorros'">Ver todo →</button></div><div v-if="savingsGoals.length" class="mini-goals"><div v-for="goal in savingsGoals.slice(0, 3)" :key="goal.id" class="savings-goal"><div class="goal-top"><span class="goal-icon mint">◉</span><span class="goal-label"><b>{{ goal.name }}</b><small>{{ goal.targetAmount ? `Meta: ${formatMoney(goal.targetAmount)}` : 'Sin monto objetivo' }}</small></span><b v-if="goal.targetAmount" class="goal-percent">{{ Math.round(goal.balance / goal.targetAmount * 100) }}%</b></div><div v-if="goal.targetAmount" class="progress-track"><span :style="{ width: `${Math.min(goal.balance / goal.targetAmount * 100, 100)}%` }"></span></div><div class="goal-bottom"><b>{{ formatMoney(goal.balance) }}</b><small>+ {{ formatMoney(goal.contributedThisMonth) }} este mes</small></div></div></div><div v-else class="empty-state compact">Crea una meta para empezar a acumular.</div></article>
          </section>
        </template>

        <section v-else-if="activeView === 'Movimientos'" class="panel full-panel movement-page"><div class="panel-heading"><div><h2>Movimientos de {{ monthLabel }}</h2><p>Los gastos pagados se descuentan del saldo del mes.</p></div><div class="inline-actions"><button class="secondary-button" @click="openTransaction('income')">＋ Ingreso</button><button class="primary-button" @click="openTransaction('expense')">＋ Gasto</button></div></div><div v-if="transactions.length" class="transaction-table"><div class="table-head"><span>DETALLE</span><span>CATEGORÍA</span><span>MONTO</span><span></span></div><div v-for="item in transactions" :key="item.id" class="transaction-row"><div class="transaction-title"><span class="transaction-mark" :class="item.type === 'income' ? 'mint' : 'peach'">{{ item.type === 'income' ? '↗' : '•' }}</span><span><b>{{ item.description }}</b><small>{{ formatDate(item.transactionDate) }}<template v-if="item.group"> · {{ item.group }}</template></small></span></div><span class="category-pill">{{ transactionCategory(item) }}</span><b class="transaction-amount" :class="item.type">{{ item.type === 'income' ? '+' : '−' }}{{ formatMoney(item.amount) }}</b><div class="transaction-actions">
          <label v-if="item.type === 'expense' && !item.fixedDebtId" class="payment-check">
            <input type="checkbox" :checked="item.paid" :disabled="saving" @click.prevent="changeExpensePayment(item, !item.paid)">
            {{ item.paid ? 'Pagado' : 'Pendiente' }}
          </label>
          <button v-if="item.fixedDebtId" class="small-action" @click="activeView = 'Deudas fijas'">Pago de deuda ↗</button>
          <button v-else class="icon-action" aria-label="Eliminar movimiento" :disabled="saving" @click="deleteTransaction(item)">×</button>
        </div></div></div><div v-else class="empty-state">No hay movimientos en este mes.</div></section>

        <details v-if="!loading && activeView === 'Movimientos'" class="panel full-panel expense-categories"><summary>Categorías para registrar gastos</summary><div class="budget-create-form"><label class="field-label">Sección o grupo<input v-model="budgetForm.groupName" placeholder="Ej. Transporte" required maxlength="80"></label><label class="field-label">Concepto<input v-model="budgetForm.name" placeholder="Ej. Gasolina" required maxlength="100"></label><label class="field-label">Límite mensual<input v-model.number="budgetForm.plannedAmount" type="number" min="0" step="0.01" required></label><label class="field-label color-field">Color<input v-model="budgetForm.color" type="color"></label><button class="primary-button" :disabled="saving" @click="saveBudgetItem">Agregar categoría</button></div><div v-if="budgetGroups.length" class="group-list"><section v-for="group in budgetGroups" :key="group.id" class="budget-group"><div class="group-heading"><span class="group-dot" :style="{ background: group.color }"></span><h3>{{ group.name }}</h3></div><div v-if="group.items.length" class="budget-list expanded"><div v-for="item in group.items" :key="item.id" class="budget-row"><div class="budget-meta"><span class="budget-name"><b>{{ item.name }}</b><small>Quedan {{ formatMoney(Math.max(0, item.planned - item.spent)) }}</small></span><span class="budget-numbers"><b>{{ formatMoney(item.spent) }}</b><small>de {{ formatMoney(item.planned) }}</small></span><button class="small-action" @click="updatePlannedAmount(item)">Editar límite</button><button class="icon-action" aria-label="Eliminar concepto" @click="removeBudgetItem(item)">×</button></div><div class="progress-track"><span :style="{ width: `${item.planned ? Math.min(item.spent / item.planned * 100, 100) : 0}%`, background: group.color }"></span></div></div></div><p v-else class="muted-note">Sin conceptos en esta sección.</p></section></div><div v-else class="empty-state">Agrega un grupo y una categoría para registrar tus gastos.</div></details>

        <section v-if="activeView === 'Presupuesto'" v-show="!loading" class="budget-page">
          <FixedDebtBudget
            :debts="fixedDebts"
            :month="month"
            :month-label="monthLabel"
            :format-money="formatMoney"
            :saving="saving"
            @save="saveFixedDebt"
          />
        </section>

        <section v-if="!loading && activeView === 'Ahorros'" class="savings-page">
          <article class="panel full-panel"><div class="panel-heading"><div><h2>Ahorros acumulados</h2><p>Consulta el saldo y los aportes por meta de ahorro.</p></div><div class="savings-total-card"><small>TOTAL AHORRADO</small><strong>{{ formatMoney(summary.savingsTotal) }}</strong></div></div>
            <div class="savings-forms"><form class="inline-form" @submit.prevent="saveGoal"><h3>Crear meta</h3><label class="field-label">Nombre<input v-model="goalForm.name" placeholder="Fondo de emergencia" required maxlength="100"></label><label class="field-label">Monto objetivo<input v-model="goalForm.targetAmount" type="number" min="0.01" step="0.01" placeholder="Opcional"></label><label class="field-label">Aporte mensual planeado<input v-model="goalForm.monthlyContribution" type="number" min="0" step="0.01"></label><button class="primary-button" :disabled="saving">Crear meta</button></form>
              <form class="inline-form" @submit.prevent="saveMovement"><h3>Registrar movimiento de ahorro</h3><label class="field-label">Meta<select v-model="movementForm.savingsGoalId" required><option value="" disabled>Selecciona una meta</option><option v-for="goal in savingsGoals" :key="goal.id" :value="goal.id">{{ goal.name }}</option></select></label><label class="field-label">Movimiento<select v-model="movementForm.type"><option value="deposit">Aporte</option><option value="withdrawal">Retiro</option></select></label><label class="field-label">Monto<input v-model="movementForm.amount" type="number" min="0.01" step="0.01" required></label><label class="field-label">Fecha<input v-model="movementForm.movementDate" type="date" required></label><button class="primary-button" :disabled="saving || !savingsGoals.length">Guardar movimiento</button></form></div>
            <div v-if="savingsGoals.length" class="goal-grid"><article v-for="goal in savingsGoals" :key="goal.id" class="goal-card"><div class="goal-card-head"><span class="goal-icon mint">◉</span><button class="icon-action" aria-label="Eliminar meta" @click="removeGoal(goal)">×</button></div><h3>{{ goal.name }}</h3><label class="field-label">Cuenta del ahorro
              <select :value="goal.bankAccountId ?? ''" :disabled="saving" @change="assignSavingsAccount(goal, $event)">
                <option value="">Sin cuenta asignada</option>
                <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
              </select>
            </label><p>{{ goal.targetAmount ? `Meta de ${formatMoney(goal.targetAmount)}` : 'Sin monto objetivo' }}</p><div v-if="goal.targetAmount" class="progress-track"><span :style="{ width: `${Math.min(goal.balance / goal.targetAmount * 100, 100)}%` }"></span></div><div class="goal-bottom"><b>{{ formatMoney(goal.balance) }}</b><small>+ {{ formatMoney(goal.contributedThisMonth) }} en {{ monthLabel }}</small></div></article></div><div v-else class="empty-state">Todavía no tienes metas de ahorro. Crea una para comenzar a acumular.</div>
          </article>
        </section>

        <ServiceHistory
          v-if="activeView === 'Servicios y visitas'"
          :request="api"
          :format-money="formatMoney"
          :today="localDate()"
        />

        <Accounts
          v-if="activeView === 'Cuentas'"
          v-show="!loading"
          :accounts="accounts"
          :debts="fixedDebts"
          :goals="savingsGoals"
          :month-label="monthLabel"
          :format-money="formatMoney"
          :saving="saving"
          @create="createAccount"
        />

        <FixedDebts
          v-if="activeView === 'Deudas fijas' && month"
          v-show="!loading"
          :debts="fixedDebts"
          :accounts="accounts"
          :default-account-id="defaultDebtAccountId"
          @open-accounts="activeView = 'Cuentas'"
          :month="month"
          :month-label="monthLabel"
          :today="localDate()"
          :format-money="formatMoney"
          :saving="saving"
          @save="saveFixedDebt"
          @open-budget="activeView = 'Presupuesto'"
        />
      </div>
    </main>

    <div v-if="showTransactionModal" class="modal-backdrop" @click.self="showTransactionModal = false"><form class="modal" @submit.prevent="saveTransaction"><div class="modal-heading"><div><div class="eyebrow">REGISTRO RÁPIDO</div><h2>Agregar movimiento</h2></div><button type="button" class="close-button" aria-label="Cerrar" @click="showTransactionModal = false">×</button></div><div class="type-switch"><button type="button" :class="{ selected: transactionForm.type === 'expense' }" @click="transactionForm.type = 'expense'">Gasto</button><button type="button" :class="{ selected: transactionForm.type === 'income' }" @click="transactionForm.type = 'income'">Ingreso</button></div><label class="field-label">Descripción<input v-model="transactionForm.description" placeholder="Ej. Compra del supermercado" required maxlength="180"></label><label class="field-label">Monto<input v-model="transactionForm.amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></label><label v-if="transactionForm.type === 'income'" class="field-label">Tipo de ingreso<select v-model="transactionForm.source"><option value="salary">Salario</option><option value="extra">Extra</option></select></label><label v-else class="field-label">Categoría del gasto<select v-model="transactionForm.budgetItemId" required><option value="" disabled>Selecciona un concepto</option><option v-for="item in budgetItems" :key="item.id" :value="item.id">{{ item.group }} · {{ item.name }}</option></select><small v-if="!budgetItems.length">Agrega una categoría en Movimientos.</small></label><label class="field-label">Fecha<input v-model="transactionForm.transactionDate" type="date" required></label><label v-if="transactionForm.type === 'expense'" class="payment-check"><input v-model="transactionForm.paid" type="checkbox"> Ya lo pagué</label><button class="primary-button modal-submit" type="submit" :disabled="saving || (transactionForm.type === 'expense' && !budgetItems.length)">{{ saving ? 'Guardando…' : 'Guardar movimiento' }} <span>→</span></button></form></div>
    <div v-if="toast" class="toast"><span>✓</span>{{ toast }}</div>
  </div>
</template>

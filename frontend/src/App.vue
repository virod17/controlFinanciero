<script setup>
import { computed, onMounted, ref, watch } from 'vue'
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
const summary = ref({ income: 0, expenses: 0, savingsContributions: 0, available: 0, budgetTotal: 0, savingsTotal: 0, monthlyTrend: [] })

const navItems = [
  { name: 'Resumen', icon: '◫' },
  { name: 'Movimientos', icon: '↕' },
  { name: 'Presupuesto', icon: '▤' },
  { name: 'Ahorros', icon: '◉' },
]

const transactionForm = ref({ type: 'expense', description: '', amount: '', transactionDate: localDate(), source: 'salary', budgetItemId: '' })
const budgetForm = ref({ groupName: 'Deudas fijas', name: '', plannedAmount: 0, color: '#ed8c70' })
const goalForm = ref({ name: '', targetAmount: '', monthlyContribution: 0 })
const movementForm = ref({ savingsGoalId: '', type: 'deposit', amount: '', movementDate: localDate(), note: '' })

function localDate() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const monthLabel = computed(() => {
  const [year, number] = month.value.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PA', { month: 'long', year: 'numeric' }).format(new Date(year, number - 1, 1))
})
const budgetItems = computed(() => budgetGroups.value.flatMap(group => group.items.map(item => ({ ...item, group: group.name, color: group.color }))))
const recentTransactions = computed(() => transactions.value.slice(0, 6))
const budgetPlannedTotal = computed(() => budgetItems.value.reduce((sum, item) => sum + item.planned, 0))
const budgetSpentTotal = computed(() => budgetItems.value.reduce((sum, item) => sum + item.spent, 0))
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
  if (!response.ok) throw new Error(data.message || 'No se pudo completar la solicitud.')
  return data
}

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [summaryData, transactionData, budgetData, savingsData] = await Promise.all([
      api(`/dashboard/summary?month=${month.value}`),
      api(`/transactions?month=${month.value}`),
      api(`/budget?month=${month.value}`),
      api(`/savings?month=${month.value}`),
    ])
    summary.value = summaryData
    transactions.value = transactionData
    budgetGroups.value = budgetData.groups
    savingsGoals.value = savingsData.goals
    if (!movementForm.value.savingsGoalId && savingsGoals.value.length) movementForm.value.savingsGoalId = savingsGoals.value[0].id
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

watch(month, loadData)
onMounted(loadData)

function notify(message) {
  toast.value = message
  setTimeout(() => { toast.value = '' }, 2600)
}

function openTransaction(type = 'expense') {
  transactionForm.value = { type, description: '', amount: '', transactionDate: localDate(), source: 'salary', budgetItemId: budgetItems.value[0]?.id ?? '' }
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
        : { budgetItemId: transactionForm.value.budgetItemId }),
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
          <div><div class="eyebrow">TU DINERO, MÁS CLARO</div><h1>{{ activeView === 'Resumen' ? 'Tu panorama financiero' : activeView }}</h1><p>{{ activeView === 'Resumen' ? 'Ingresos, gastos y ahorros de un vistazo.' : 'Registra y organiza tus finanzas personales.' }}</p></div>
          <div class="heading-actions"><label class="month-select">▦ <input v-model="month" type="month" :aria-label="`Mes seleccionado: ${monthLabel}`" /></label><button class="primary-button" @click="openTransaction('expense')"><span>＋</span> Agregar movimiento</button></div>
        </section>

        <div v-if="errorMessage" class="error-banner" role="alert"><span>{{ errorMessage }}</span><button @click="loadData">Reintentar</button></div>
        <div v-if="loading" class="loading-card">Cargando tus datos financieros…</div>

        <template v-else-if="activeView === 'Resumen'">
          <section class="summary-grid">
            <article class="summary-card balance-card"><div class="card-label">DISPONIBLE ESTE MES</div><div class="summary-value">{{ formatMoney(summary.available) }}</div><div class="card-foot">Ingresos menos gastos y movimientos netos a ahorros</div><div class="balance-art"><span></span><span></span><span></span></div></article>
            <article class="summary-card"><div class="card-label">INGRESOS <span class="card-icon income-icon">↗</span></div><div class="summary-value">{{ formatMoney(summary.income) }}</div><div class="card-foot">Salarios y extras en {{ monthLabel }}</div></article>
            <article class="summary-card"><div class="card-label">GASTOS <span class="card-icon expense-icon">↘</span></div><div class="summary-value">{{ formatMoney(summary.expenses) }}</div><div class="card-foot">Presupuesto: <b>{{ formatMoney(summary.budgetTotal) }}</b></div></article>
            <article class="summary-card"><div class="card-label">AHORROS ACUMULADOS <span class="card-icon savings-icon">◉</span></div><div class="summary-value">{{ formatMoney(summary.savingsTotal) }}</div><div class="card-foot">{{ formatMoney(monthlySavingsPlanned) }} planificados este mes</div></article>
          </section>

          <section class="content-grid">
            <article class="panel chart-panel"><div class="panel-heading"><div><h2>Tu flujo de dinero</h2><p>Ingresos y gastos de los últimos seis meses</p></div></div><div class="chart-legend"><span><i class="legend-income"></i> Ingresos</span><span><i class="legend-expense"></i> Gastos</span></div>
              <div v-if="summary.monthlyTrend?.some(point => point.income || point.expenses)" class="bar-chart"><div class="chart-y"><span>{{ formatMoney(Math.max(1, ...summary.monthlyTrend.map(point => Math.max(point.income, point.expenses)))) }}</span><span>$0</span></div><div class="chart-area"><div class="grid-line line-1"></div><div class="grid-line line-2"></div><div v-for="point in summary.monthlyTrend" :key="point.month" class="bar-group"><div class="bars"><span class="bar income-bar" :style="{ height: `${Math.max(point.income ? 4 : 0, point.income / Math.max(1, ...summary.monthlyTrend.map(p => Math.max(p.income, p.expenses))) * 100)}%` }" :title="`Ingresos ${formatMoney(point.income)}`"></span><span class="bar expense-bar" :style="{ height: `${Math.max(point.expenses ? 4 : 0, point.expenses / Math.max(1, ...summary.monthlyTrend.map(p => Math.max(p.income, p.expenses))) * 100)}%` }" :title="`Gastos ${formatMoney(point.expenses)}`"></span></div><span class="month-label">{{ point.label }}</span></div></div></div>
              <div v-else class="empty-chart">Registra ingresos y gastos para ver tu gráfica mensual.</div>
            </article>
            <article class="panel budget-panel"><div class="panel-heading"><div><h2>Presupuesto</h2><p>Plan frente a gastos de {{ monthLabel }}</p></div><button class="text-link" @click="activeView = 'Presupuesto'">Administrar →</button></div><div class="budget-overview"><div><small>GASTADO</small><strong>{{ formatMoney(budgetSpentTotal) }}</strong></div><div class="budget-total"><small>PRESUPUESTO</small><strong>{{ formatMoney(budgetPlannedTotal) }}</strong></div></div><div class="progress-track overall"><span :style="{ width: `${budgetPlannedTotal ? Math.min(budgetSpentTotal / budgetPlannedTotal * 100, 100) : 0}%` }"></span></div><div v-if="budgetItems.length" class="budget-list"><div v-for="item in budgetItems.slice(0, 4)" :key="item.id" class="budget-row"><div class="budget-meta"><span class="budget-icon" :style="{ background: `${item.color}22`, color: item.color }">•</span><span class="budget-name"><b>{{ item.name }}</b><small>{{ item.group }}</small></span><span class="budget-numbers"><b>{{ formatMoney(item.spent) }}</b><small>de {{ formatMoney(item.planned) }}</small></span></div><div class="progress-track"><span :style="{ width: `${item.planned ? Math.min(item.spent / item.planned * 100, 100) : 0}%`, background: item.color }"></span></div></div></div><div v-else class="empty-state compact">Aún no tienes conceptos presupuestarios.</div></article>
          </section>

          <section class="lower-grid">
            <article class="panel transactions-panel"><div class="panel-heading"><div><h2>Movimientos recientes</h2><p>Registros del mes seleccionado</p></div><button class="text-link" @click="activeView = 'Movimientos'">Ver todos →</button></div><div v-if="recentTransactions.length" class="transaction-table"><div class="table-head"><span>DETALLE</span><span>CATEGORÍA</span><span>MONTO</span></div><div v-for="item in recentTransactions" :key="item.id" class="transaction-row"><div class="transaction-title"><span class="transaction-mark" :class="item.type === 'income' ? 'mint' : 'peach'">{{ item.type === 'income' ? '↗' : '•' }}</span><span><b>{{ item.description }}</b><small>{{ formatDate(item.transactionDate) }}</small></span></div><span class="category-pill">{{ transactionCategory(item) }}</span><b class="transaction-amount" :class="item.type">{{ item.type === 'income' ? '+' : '−' }}{{ formatMoney(item.amount) }}</b></div></div><div v-else class="empty-state">Todavía no has registrado movimientos. Usa “Agregar movimiento” para comenzar.</div></article>
            <article class="panel savings-panel"><div class="panel-heading"><div><h2>Mis ahorros</h2><p>Saldo acumulado por meta</p></div><button class="text-link" @click="activeView = 'Ahorros'">Ver todo →</button></div><div v-if="savingsGoals.length" class="mini-goals"><div v-for="goal in savingsGoals.slice(0, 3)" :key="goal.id" class="savings-goal"><div class="goal-top"><span class="goal-icon mint">◉</span><span class="goal-label"><b>{{ goal.name }}</b><small>{{ goal.targetAmount ? `Meta: ${formatMoney(goal.targetAmount)}` : 'Sin monto objetivo' }}</small></span><b v-if="goal.targetAmount" class="goal-percent">{{ Math.round(goal.balance / goal.targetAmount * 100) }}%</b></div><div v-if="goal.targetAmount" class="progress-track"><span :style="{ width: `${Math.min(goal.balance / goal.targetAmount * 100, 100)}%` }"></span></div><div class="goal-bottom"><b>{{ formatMoney(goal.balance) }}</b><small>+ {{ formatMoney(goal.contributedThisMonth) }} este mes</small></div></div></div><div v-else class="empty-state compact">Crea una meta para empezar a acumular.</div></article>
          </section>
        </template>

        <section v-else-if="activeView === 'Movimientos'" class="panel full-panel movement-page"><div class="panel-heading"><div><h2>Movimientos de {{ monthLabel }}</h2><p>Los movimientos se guardan en PostgreSQL.</p></div><div class="inline-actions"><button class="secondary-button" @click="openTransaction('income')">＋ Ingreso</button><button class="primary-button" @click="openTransaction('expense')">＋ Gasto</button></div></div><div v-if="transactions.length" class="transaction-table"><div class="table-head"><span>DETALLE</span><span>CATEGORÍA</span><span>MONTO</span><span></span></div><div v-for="item in transactions" :key="item.id" class="transaction-row"><div class="transaction-title"><span class="transaction-mark" :class="item.type === 'income' ? 'mint' : 'peach'">{{ item.type === 'income' ? '↗' : '•' }}</span><span><b>{{ item.description }}</b><small>{{ formatDate(item.transactionDate) }}<template v-if="item.group"> · {{ item.group }}</template></small></span></div><span class="category-pill">{{ transactionCategory(item) }}</span><b class="transaction-amount" :class="item.type">{{ item.type === 'income' ? '+' : '−' }}{{ formatMoney(item.amount) }}</b><button class="icon-action" aria-label="Eliminar movimiento" @click="deleteTransaction(item)">×</button></div></div><div v-else class="empty-state">No hay movimientos en este mes.</div></section>

        <section v-else-if="activeView === 'Presupuesto'" class="budget-page">
          <article class="panel full-panel"><div class="panel-heading"><div><h2>Presupuesto de {{ monthLabel }}</h2><p>Separa el presupuesto por grupos, deudas fijas y otros conceptos.</p></div></div><div class="budget-create-form"><label class="field-label">Sección o grupo<input v-model="budgetForm.groupName" placeholder="Ej. Deudas fijas" required maxlength="80"></label><label class="field-label">Concepto<input v-model="budgetForm.name" placeholder="Ej. Préstamo del auto" required maxlength="100"></label><label class="field-label">Límite mensual<input v-model.number="budgetForm.plannedAmount" type="number" min="0" step="0.01" required></label><label class="field-label color-field">Color<input v-model="budgetForm.color" type="color"></label><button class="primary-button" :disabled="saving" @click="saveBudgetItem">Agregar concepto</button></div><div v-if="budgetGroups.length" class="group-list"><section v-for="group in budgetGroups" :key="group.id" class="budget-group"><div class="group-heading"><span class="group-dot" :style="{ background: group.color }"></span><h3>{{ group.name }}</h3></div><div v-if="group.items.length" class="budget-list expanded"><div v-for="item in group.items" :key="item.id" class="budget-row"><div class="budget-meta"><span class="budget-name"><b>{{ item.name }}</b><small>Quedan {{ formatMoney(Math.max(0, item.planned - item.spent)) }}</small></span><span class="budget-numbers"><b>{{ formatMoney(item.spent) }}</b><small>de {{ formatMoney(item.planned) }}</small></span><button class="small-action" @click="updatePlannedAmount(item)">Editar límite</button><button class="icon-action" aria-label="Eliminar concepto" @click="removeBudgetItem(item)">×</button></div><div class="progress-track"><span :style="{ width: `${item.planned ? Math.min(item.spent / item.planned * 100, 100) : 0}%`, background: group.color }"></span></div></div></div><p v-else class="muted-note">Sin conceptos en esta sección.</p></section></div><div v-else class="empty-state">Agrega una sección y un concepto para empezar a presupuestar.</div></article>
        </section>

        <section v-else-if="activeView === 'Ahorros'" class="savings-page">
          <article class="panel full-panel"><div class="panel-heading"><div><h2>Ahorros acumulados</h2><p>El ahorro se mantiene separado de los gastos y disminuye el disponible mensual al aportar.</p></div><div class="savings-total-card"><small>TOTAL AHORRADO</small><strong>{{ formatMoney(summary.savingsTotal) }}</strong></div></div>
            <div class="savings-forms"><form class="inline-form" @submit.prevent="saveGoal"><h3>Crear meta</h3><label class="field-label">Nombre<input v-model="goalForm.name" placeholder="Fondo de emergencia" required maxlength="100"></label><label class="field-label">Monto objetivo<input v-model="goalForm.targetAmount" type="number" min="0.01" step="0.01" placeholder="Opcional"></label><label class="field-label">Aporte mensual planeado<input v-model="goalForm.monthlyContribution" type="number" min="0" step="0.01"></label><button class="primary-button" :disabled="saving">Crear meta</button></form>
              <form class="inline-form" @submit.prevent="saveMovement"><h3>Registrar movimiento de ahorro</h3><label class="field-label">Meta<select v-model="movementForm.savingsGoalId" required><option value="" disabled>Selecciona una meta</option><option v-for="goal in savingsGoals" :key="goal.id" :value="goal.id">{{ goal.name }}</option></select></label><label class="field-label">Movimiento<select v-model="movementForm.type"><option value="deposit">Aporte</option><option value="withdrawal">Retiro</option></select></label><label class="field-label">Monto<input v-model="movementForm.amount" type="number" min="0.01" step="0.01" required></label><label class="field-label">Fecha<input v-model="movementForm.movementDate" type="date" required></label><button class="primary-button" :disabled="saving || !savingsGoals.length">Guardar movimiento</button></form></div>
            <div v-if="savingsGoals.length" class="goal-grid"><article v-for="goal in savingsGoals" :key="goal.id" class="goal-card"><div class="goal-card-head"><span class="goal-icon mint">◉</span><button class="icon-action" aria-label="Eliminar meta" @click="removeGoal(goal)">×</button></div><h3>{{ goal.name }}</h3><p>{{ goal.targetAmount ? `Meta de ${formatMoney(goal.targetAmount)}` : 'Sin monto objetivo' }}</p><div v-if="goal.targetAmount" class="progress-track"><span :style="{ width: `${Math.min(goal.balance / goal.targetAmount * 100, 100)}%` }"></span></div><div class="goal-bottom"><b>{{ formatMoney(goal.balance) }}</b><small>+ {{ formatMoney(goal.contributedThisMonth) }} en {{ monthLabel }}</small></div></article></div><div v-else class="empty-state">Todavía no tienes metas de ahorro. Crea una para comenzar a acumular.</div>
          </article>
        </section>
      </div>
    </main>

    <div v-if="showTransactionModal" class="modal-backdrop" @click.self="showTransactionModal = false"><form class="modal" @submit.prevent="saveTransaction"><div class="modal-heading"><div><div class="eyebrow">REGISTRO RÁPIDO</div><h2>Agregar movimiento</h2></div><button type="button" class="close-button" aria-label="Cerrar" @click="showTransactionModal = false">×</button></div><div class="type-switch"><button type="button" :class="{ selected: transactionForm.type === 'expense' }" @click="transactionForm.type = 'expense'">Gasto</button><button type="button" :class="{ selected: transactionForm.type === 'income' }" @click="transactionForm.type = 'income'">Ingreso</button></div><label class="field-label">Descripción<input v-model="transactionForm.description" placeholder="Ej. Compra del supermercado" required maxlength="180"></label><label class="field-label">Monto<input v-model="transactionForm.amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></label><label v-if="transactionForm.type === 'income'" class="field-label">Tipo de ingreso<select v-model="transactionForm.source"><option value="salary">Salario</option><option value="extra">Extra</option></select></label><label v-else class="field-label">Concepto del presupuesto<select v-model="transactionForm.budgetItemId" required><option value="" disabled>Selecciona un concepto</option><option v-for="item in budgetItems" :key="item.id" :value="item.id">{{ item.group }} · {{ item.name }}</option></select><small v-if="!budgetItems.length">Primero crea un concepto en Presupuesto.</small></label><label class="field-label">Fecha<input v-model="transactionForm.transactionDate" type="date" required></label><p v-if="transactionForm.type === 'income'" class="form-hint">Los ingresos reducen el gasto disponible del mes.</p><button class="primary-button modal-submit" type="submit" :disabled="saving || (transactionForm.type === 'expense' && !budgetItems.length)">{{ saving ? 'Guardando…' : 'Guardar movimiento' }} <span>→</span></button></form></div>
    <div v-if="toast" class="toast"><span>✓</span>{{ toast }}</div>
  </div>
</template>

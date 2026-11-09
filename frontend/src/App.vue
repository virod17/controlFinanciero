<script setup>
import { computed, ref } from 'vue'

const activeView = ref('Resumen')
const showModal = ref(false)
const toast = ref('')
const monthLabel = new Intl.DateTimeFormat('es-PA', { month: 'long', year: 'numeric' }).format(new Date())
const navItems = [
  { name: 'Resumen', icon: '◫' },
  { name: 'Movimientos', icon: '↕' },
  { name: 'Presupuesto', icon: '▤' },
  { name: 'Ahorros', icon: '◉' },
]

const transactions = ref([
  { name: 'Salario', detail: 'Ingreso · 1 nov', category: 'Salario', type: 'income', amount: 1450, mark: 'S', color: 'mint' },
  { name: 'Supermercado', detail: 'Hogar · 8 nov', category: 'Supermercado', type: 'expense', amount: 86.42, mark: '⌂', color: 'peach' },
  { name: 'Gasolina', detail: 'Transporte · 7 nov', category: 'Gasolina', type: 'expense', amount: 35, mark: '↗', color: 'blue' },
  { name: 'Trabajo extra', detail: 'Ingreso · 6 nov', category: 'Extra', type: 'income', amount: 75, mark: '✳', color: 'lavender' },
  { name: 'Préstamo del auto', detail: 'Deudas fijas · 5 nov', category: 'Préstamo', type: 'expense', amount: 220, mark: '▣', color: 'yellow' },
])

const budgets = ref([
  { group: 'Deudas fijas', name: 'Préstamo del auto', planned: 220, spent: 220, color: '#ed8c70', icon: '▣' },
  { group: 'Transporte', name: 'Gasolina', planned: 160, spent: 85, color: '#80a9cc', icon: '↗' },
  { group: 'Hogar', name: 'Supermercado', planned: 400, spent: 246, color: '#d1a758', icon: '⌂' },
])

const savingsGoals = ref([
  { name: 'Fondo de emergencia', target: 3000, balance: 1250, planned: 100, icon: '✳', color: 'mint' },
  { name: 'Vacaciones', target: 1500, balance: 480, planned: 50, icon: '⌁', color: 'lavender' },
])

const totals = computed(() => {
  const income = transactions.value.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
  const expenses = transactions.value.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
  const savings = savingsGoals.value.reduce((sum, goal) => sum + goal.planned, 0)
  return { income, expenses, savings, available: income - expenses - savings }
})

const budgetTotal = computed(() => budgets.value.reduce((sum, item) => sum + item.planned, 0))
const spentTotal = computed(() => budgets.value.reduce((sum, item) => sum + item.spent, 0))
const savingsTotal = computed(() => savingsGoals.value.reduce((sum, goal) => sum + goal.balance, 0))
const formatMoney = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

const form = ref({ type: 'expense', name: '', amount: '', category: 'Supermercado', date: new Date().toISOString().slice(0, 10) })
function addTransaction() {
  const amount = Number(form.value.amount)
  if (!form.value.name.trim() || !Number.isFinite(amount) || amount <= 0) return
  const item = { name: form.value.name.trim(), detail: `${form.value.type === 'income' ? 'Ingreso' : 'Gasto'} · hoy`, category: form.value.category, type: form.value.type, amount, mark: form.value.type === 'income' ? '↗' : '•', color: form.value.type === 'income' ? 'mint' : 'peach' }
  transactions.value.unshift(item)
  if (item.type === 'expense') {
    const budget = budgets.value.find(row => row.name === item.category)
    if (budget) budget.spent += amount
  }
  form.value = { type: 'expense', name: '', amount: '', category: 'Supermercado', date: new Date().toISOString().slice(0, 10) }
  showModal.value = false
  toast.value = 'Movimiento agregado'
  setTimeout(() => { toast.value = '' }, 2400)
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
      <div class="sidebar-bottom">
        <div class="tip-card"><div class="tip-spark">✳</div><strong>Un paso a la vez</strong><p>Los pequeños hábitos hacen una gran diferencia.</p></div>
        <button class="profile"><span class="avatar">V</span><span class="profile-info"><b>Vicente</b><small>Mi espacio personal</small></span><span class="more">···</span></button>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="breadcrumb">Finanzas <span>/</span> <b>{{ activeView }}</b></div>
        <div class="top-actions"><button class="icon-button" aria-label="Notificaciones">♧<i></i></button><span class="top-avatar">V</span></div>
      </header>

      <div class="page-content">
        <section class="page-heading">
          <div><div class="eyebrow">TU DINERO, MÁS CLARO</div><h1>{{ activeView === 'Resumen' ? 'Hola, Vicente' : activeView }}</h1><p>{{ activeView === 'Resumen' ? 'Este es el panorama de tus finanzas.' : 'Organiza tus movimientos y avanza hacia tus metas.' }}</p></div>
          <div class="heading-actions"><button class="month-select">▦ <span>{{ monthLabel }}</span><span class="chevron">⌄</span></button><button class="primary-button" @click="showModal = true"><span>＋</span> Agregar movimiento</button></div>
        </section>

        <template v-if="activeView === 'Resumen' || activeView === 'Movimientos'">
          <section class="summary-grid">
            <article class="summary-card balance-card"><div class="card-label">DISPONIBLE ESTE MES <span class="info">i</span></div><div class="summary-value">{{ formatMoney(totals.available) }}</div><div class="card-foot"><span class="status-dot"></span> Después de gastos y ahorro planificado</div><div class="balance-art"><span></span><span></span><span></span></div></article>
            <article class="summary-card"><div class="card-label">INGRESOS <span class="card-icon income-icon">↗</span></div><div class="summary-value">{{ formatMoney(totals.income) }}</div><div class="card-foot"><span class="positive">↑ 2 entradas</span> este mes</div></article>
            <article class="summary-card"><div class="card-label">GASTOS <span class="card-icon expense-icon">↘</span></div><div class="summary-value">{{ formatMoney(totals.expenses) }}</div><div class="card-foot">De <b>{{ formatMoney(budgetTotal) }}</b> presupuestados</div></article>
            <article class="summary-card"><div class="card-label">AHORROS ACUMULADOS <span class="card-icon savings-icon">◉</span></div><div class="summary-value">{{ formatMoney(savingsTotal) }}</div><div class="card-foot"><span class="positive">↑ {{ formatMoney(totals.savings) }}</span> planeados este mes</div></article>
          </section>

          <section class="content-grid">
            <article class="panel chart-panel">
              <div class="panel-heading"><div><h2>Tu flujo de dinero</h2><p>Ingresos y gastos de los últimos 6 meses</p></div><button class="subtle-select">Este año <span>⌄</span></button></div>
              <div class="chart-legend"><span><i class="legend-income"></i> Ingresos</span><span><i class="legend-expense"></i> Gastos</span></div>
              <div class="bar-chart" aria-label="Gráfico de barras de ingresos y gastos">
                <div class="chart-y"><span>$1.5k</span><span>$1k</span><span>$500</span><span>$0</span></div>
                <div class="chart-area"><div class="grid-line line-1"></div><div class="grid-line line-2"></div><div class="grid-line line-3"></div><div class="grid-line line-4"></div>
                  <div v-for="(month, index) in [{label:'Jun',inc:72,exp:44},{label:'Jul',inc:83,exp:53},{label:'Ago',inc:67,exp:38},{label:'Sep',inc:91,exp:56},{label:'Oct',inc:74,exp:50},{label:'Nov',inc:95,exp:48}]" :key="month.label" class="bar-group"><div class="bars"><span class="bar income-bar" :style="{height: `${month.inc}%`}"></span><span class="bar expense-bar" :style="{height: `${month.exp}%`}"></span></div><span class="month-label" :class="{ current: index === 5 }">{{ month.label }}</span></div>
                </div>
              </div>
            </article>

            <article class="panel budget-panel">
              <div class="panel-heading"><div><h2>Presupuesto</h2><p>Así va tu plan de noviembre</p></div><button class="text-link" @click="activeView = 'Presupuesto'">Ver todo <span>→</span></button></div>
              <div class="budget-overview"><div><small>GASTADO</small><strong>{{ formatMoney(spentTotal) }}</strong></div><div class="budget-total"><small>PRESUPUESTO</small><strong>{{ formatMoney(budgetTotal) }}</strong></div></div>
              <div class="progress-track overall"><span :style="{width: `${Math.min(spentTotal / budgetTotal * 100, 100)}%`}"></span></div>
              <div class="budget-list"><div v-for="item in budgets" :key="item.name" class="budget-row"><div class="budget-meta"><span class="budget-icon" :style="{background: `${item.color}22`,color:item.color}">{{ item.icon }}</span><span class="budget-name"><b>{{ item.name }}</b><small>{{ item.group }}</small></span><span class="budget-numbers"><b>{{ formatMoney(item.spent) }}</b><small>de {{ formatMoney(item.planned) }}</small></span></div><div class="progress-track"><span :style="{width: `${Math.min(item.spent / item.planned * 100, 100)}%`,background:item.color}"></span></div></div></div>
            </article>
          </section>

          <section class="lower-grid">
            <article class="panel transactions-panel"><div class="panel-heading"><div><h2>Movimientos recientes</h2><p>Lo último que registraste</p></div><button class="text-link" @click="activeView = 'Movimientos'">Ver movimientos <span>→</span></button></div>
              <div class="transaction-table"><div class="table-head"><span>DETALLE</span><span>CATEGORÍA</span><span>MONTO</span></div><div v-for="(item, index) in transactions.slice(0, 5)" :key="`${item.name}-${index}`" class="transaction-row"><div class="transaction-title"><span class="transaction-mark" :class="item.color">{{ item.mark }}</span><span><b>{{ item.name }}</b><small>{{ item.detail }}</small></span></div><span class="category-pill">{{ item.category }}</span><b class="transaction-amount" :class="item.type">{{ item.type === 'income' ? '+' : '−' }}{{ formatMoney(item.amount) }}</b></div></div>
            </article>
            <article class="panel savings-panel"><div class="panel-heading"><div><h2>Mis ahorros</h2><p>Metas que van creciendo</p></div><button class="text-link" @click="activeView = 'Ahorros'">Ver todo <span>→</span></button></div>
              <div v-for="goal in savingsGoals" :key="goal.name" class="savings-goal"><div class="goal-top"><span class="goal-icon" :class="goal.color">{{ goal.icon }}</span><span class="goal-label"><b>{{ goal.name }}</b><small>Meta: {{ formatMoney(goal.target) }}</small></span><b class="goal-percent">{{ Math.round(goal.balance / goal.target * 100) }}%</b></div><div class="progress-track"><span :style="{width: `${Math.min(goal.balance / goal.target * 100, 100)}%`}"></span></div><div class="goal-bottom"><b>{{ formatMoney(goal.balance) }}</b><small>+ {{ formatMoney(goal.planned) }} este mes</small></div></div>
              <button class="add-savings" @click="activeView = 'Ahorros'"><span>＋</span> Crear una meta de ahorro</button>
            </article>
          </section>
        </template>

        <section v-else-if="activeView === 'Presupuesto'" class="panel full-panel"><div class="panel-heading"><div><h2>Presupuesto de {{ monthLabel }}</h2><p>Asigna límites y revisa lo que queda disponible.</p></div><button class="primary-button" @click="toast = 'Pronto podrás crear nuevos conceptos'; setTimeout(() => toast = '', 2400)">＋ Agregar concepto</button></div><div class="budget-list expanded"><div v-for="item in budgets" :key="item.name" class="budget-row"><div class="budget-meta"><span class="budget-icon" :style="{background: `${item.color}22`,color:item.color}">{{ item.icon }}</span><span class="budget-name"><b>{{ item.name }}</b><small>{{ item.group }}</small></span><span class="budget-numbers"><b>{{ formatMoney(item.spent) }}</b><small>de {{ formatMoney(item.planned) }} · quedan {{ formatMoney(item.planned - item.spent) }}</small></span></div><div class="progress-track"><span :style="{width: `${Math.min(item.spent / item.planned * 100, 100)}%`,background:item.color}"></span></div></div></div></section>

        <section v-else-if="activeView === 'Ahorros'" class="panel full-panel"><div class="panel-heading"><div><h2>Mis metas de ahorro</h2><p>Tu dinero ahorrado, separado de los gastos y acumulándose con cada aporte.</p></div><button class="primary-button" @click="toast = 'Pronto podrás crear nuevas metas'; setTimeout(() => toast = '', 2400)">＋ Nueva meta</button></div><div class="savings-total-card"><span class="savings-total-icon">◉</span><div><small>TOTAL AHORRADO</small><strong>{{ formatMoney(savingsTotal) }}</strong></div><span class="savings-monthly">{{ formatMoney(totals.savings) }} aportes planeados este mes</span></div><div class="goal-grid"><div v-for="goal in savingsGoals" :key="goal.name" class="goal-card"><div class="goal-card-head"><span class="goal-icon" :class="goal.color">{{ goal.icon }}</span><span class="goal-percent">{{ Math.round(goal.balance / goal.target * 100) }}%</span></div><h3>{{ goal.name }}</h3><p>Meta de {{ formatMoney(goal.target) }}</p><div class="progress-track"><span :style="{width: `${Math.min(goal.balance / goal.target * 100, 100)}%`}"></span></div><div class="goal-bottom"><b>{{ formatMoney(goal.balance) }}</b><small>+ {{ formatMoney(goal.planned) }} este mes</small></div></div></div></section>

        <section v-if="activeView === 'Movimientos'" class="panel full-panel movement-page"><div class="panel-heading"><div><h2>Todos los movimientos</h2><p>Ingresos y gastos registrados en {{ monthLabel }}.</p></div><button class="subtle-select">Todos los tipos <span>⌄</span></button></div><div class="transaction-table"><div class="table-head"><span>DETALLE</span><span>CATEGORÍA</span><span>MONTO</span></div><div v-for="(item, index) in transactions" :key="`${item.name}-${index}`" class="transaction-row"><div class="transaction-title"><span class="transaction-mark" :class="item.color">{{ item.mark }}</span><span><b>{{ item.name }}</b><small>{{ item.detail }}</small></span></div><span class="category-pill">{{ item.category }}</span><b class="transaction-amount" :class="item.type">{{ item.type === 'income' ? '+' : '−' }}{{ formatMoney(item.amount) }}</b></div></div></section>
      </div>
    </main>

    <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false"><form class="modal" @submit.prevent="addTransaction"><div class="modal-heading"><div><div class="eyebrow">REGISTRO RÁPIDO</div><h2>Agregar movimiento</h2></div><button type="button" class="close-button" aria-label="Cerrar" @click="showModal = false">×</button></div><div class="type-switch"><button type="button" :class="{selected:form.type==='expense'}" @click="form.type='expense'">Gasto</button><button type="button" :class="{selected:form.type==='income'}" @click="form.type='income'">Ingreso</button></div><label class="field-label">Descripción<input v-model="form.name" placeholder="Ej. Compra del supermercado" required /></label><label class="field-label">Monto<input v-model="form.amount" type="number" min="0.01" step="0.01" placeholder="0.00" required /></label><label class="field-label">{{ form.type === 'income' ? 'Tipo de ingreso' : 'Concepto del presupuesto' }}<select v-model="form.category"><option v-if="form.type==='income'">Salario</option><option v-if="form.type==='income'">Extra</option><option v-if="form.type==='expense'">Supermercado</option><option v-if="form.type==='expense'">Gasolina</option><option v-if="form.type==='expense'">Préstamo</option></select></label><label class="field-label">Fecha<input v-model="form.date" type="date" required /></label><button class="primary-button modal-submit" type="submit">Guardar movimiento <span>→</span></button></form></div>
    <div v-if="toast" class="toast"><span>✓</span>{{ toast }}</div>
  </div>
</template>

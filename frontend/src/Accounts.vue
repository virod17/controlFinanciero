<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  accounts: { type: Array, required: true },
  debts: { type: Array, required: true },
  goals: { type: Array, required: true },
  monthLabel: { type: String, required: true },
  formatMoney: { type: Function, required: true },
  saving: Boolean,
})
const emit = defineEmits(['create'])
const name = ref('')
const cents = amount => Math.round(Number(amount) * 100)

const balances = computed(() => {
  const rows = new Map(props.accounts.map(account => [account.id, {
    ...account, first: 0, second: 0, savings: 0, goals: [],
  }]))
  const unassigned = { id: null, name: 'Sin cuenta asignada', first: 0, second: 0, savings: 0, goals: [] }
  for (const debt of props.debts) {
    const first = rows.get(debt.firstAccountId) ?? unassigned
    const second = rows.get(debt.secondAccountId) ?? unassigned
    first.first += cents(debt.firstRemaining)
    second.second += cents(debt.secondRemaining)
  }
  for (const goal of props.goals) {
    const row = rows.get(goal.bankAccountId) ?? unassigned
    row.savings += cents(goal.balance)
    row.goals.push(goal)
  }
  return [...rows.values(), unassigned]
})

function createAccount() {
  emit('create', name.value, () => { name.value = '' })
}
</script>

<template>
  <section class="panel full-panel">
    <div class="panel-heading">
      <div>
        <h2>Dinero apartado por cuenta</h2>
        <p>Saldo de aportes de {{ monthLabel }} después de los pagos y saldo acumulado de tus metas de ahorro.</p>
      </div>
    </div>
    <form class="budget-create-form debt-plan-form" @submit.prevent="createAccount">
      <label class="field-label">Nombre de la cuenta
        <input v-model.trim="name" placeholder="Ej. Banco X · Cuenta de ahorros" maxlength="100" required>
      </label>
      <button class="primary-button" :disabled="saving">Agregar cuenta</button>
    </form>
    <div class="goal-grid">
      <article v-for="row in balances" :key="row.id ?? 'unassigned'" class="goal-card">
        <h3>{{ row.name }}</h3>
        <dl class="debt-amounts">
          <div><dt>Deudas · 1.ª quincena</dt><dd>{{ formatMoney(row.first / 100) }}</dd></div>
          <div><dt>Deudas · 2.ª quincena</dt><dd>{{ formatMoney(row.second / 100) }}</dd></div>
          <div><dt>Ahorros acumulados</dt><dd>{{ formatMoney(row.savings / 100) }}</dd></div>
          <div><dt>Total apartado</dt><dd>{{ formatMoney((row.first + row.second + row.savings) / 100) }}</dd></div>
        </dl>
        <p v-for="goal in row.goals" :key="goal.id">{{ goal.name }} · {{ formatMoney(goal.balance) }}</p>
      </article>
    </div>
  </section>
</template>

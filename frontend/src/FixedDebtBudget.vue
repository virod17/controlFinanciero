<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  debts: { type: Array, required: true },
  month: { type: String, required: true },
  monthLabel: { type: String, required: true },
  formatMoney: { type: Function, required: true },
  saving: Boolean,
})
const emit = defineEmits(['save'])
const plan = ref({ id: null, name: '', amount: '' })
const activeDebts = computed(() => props.debts.filter(debt => !debt.archived))

function splitAmount(amount) {
  const cents = Math.round(Number(amount) * 100)
  const first = Math.ceil(cents / 2)
  return [first / 100, (cents - first) / 100]
}

function quincenas(amount) {
  const [first, second] = splitAmount(amount)
  if (first === second) return `${props.formatMoney(first)} por quincena`
  return `${props.formatMoney(first)} la primera quincena y ${props.formatMoney(second)} la segunda`
}

function resetPlan() {
  plan.value = { id: null, name: '', amount: '' }
}

watch(() => props.month, resetPlan)

function submitPlan() {
  const { id, name, amount } = plan.value
  emit('save', id ? `/${id}` : '', id ? 'PUT' : 'POST', { name, amount }, resetPlan)
}

function edit(debt) {
  plan.value = { id: debt.id, name: debt.plannedName, amount: debt.plannedAmount }
}

function archive(debt) {
  if (!window.confirm(`¿Archivar “${debt.plannedName}” desde ${props.monthLabel}? Se conservarán sus aportes y pagos registrados.`)) return
  emit('save', `/${debt.id}`, 'DELETE', {}, () => {
    if (plan.value.id === debt.id) resetPlan()
  })
}
</script>

<template>
  <article class="panel full-panel">
    <div class="panel-heading">
      <div>
        <h2>Cuotas mensuales</h2>
        <p>Las cuotas se aplican desde {{ monthLabel }} y se repiten cada mes.</p>
      </div>
    </div>
    <form class="budget-create-form debt-plan-form" @submit.prevent="submitPlan">
      <label class="field-label">Concepto
        <input v-model="plan.name" placeholder="Ej. Préstamo personal o servicio de luz" maxlength="100" required>
      </label>
      <label class="field-label">Cuota mensual
        <input v-model.number="plan.amount" type="number" min="0.01" max="9999999999.99" step="0.01" required>
      </label>
      <button class="primary-button" :disabled="saving">{{ plan.id ? 'Guardar cambios' : 'Agregar deuda fija' }}</button>
      <button v-if="plan.id" class="secondary-button" type="button" @click="resetPlan">Cancelar edición</button>
    </form>
    <p v-if="Number(plan.amount) > 0" class="muted-note">{{ quincenas(plan.amount) }}</p>
    <div v-if="activeDebts.length" class="budget-list expanded">
      <div v-for="debt in activeDebts" :key="debt.id" class="budget-meta">
        <span class="budget-name"><b>{{ debt.plannedName }}</b><small>{{ quincenas(debt.plannedAmount) }}</small></span>
        <span class="budget-numbers"><b>{{ formatMoney(debt.plannedAmount) }}</b><small>al mes</small></span>
        <button class="small-action" :disabled="saving" @click="edit(debt)">Editar</button>
        <button class="small-action" :disabled="saving" @click="archive(debt)">Archivar</button>
      </div>
    </div>
    <div v-else class="empty-state compact">Agrega tu primera cuota mensual.</div>
  </article>
</template>

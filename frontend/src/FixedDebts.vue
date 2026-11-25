<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  debts: { type: Array, required: true },
  month: { type: String, required: true },
  monthLabel: { type: String, required: true },
  today: { type: String, required: true },
  formatMoney: { type: Function, required: true },
  saving: Boolean,
})
const emit = defineEmits(['save'])
const plan = ref({ id: null, name: '', amount: '' })
const contribution = ref(null)
const payment = ref(null)
const total = computed(() => props.debts.reduce((sum, debt) => sum + debt.amount, 0))
const lastDay = computed(() => {
  const [year, month] = props.month.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
})

function submitPlan() {
  const { id, name, amount } = plan.value
  emit('save', id ? `/${id}` : '', id ? 'PUT' : 'POST', { name, amount }, resetPlan)
}

function resetPlan() {
  plan.value = { id: null, name: '', amount: '' }
}

watch(() => props.month, () => {
  resetPlan()
  contribution.value = null
  payment.value = null
})

function editContribution(debt, half) {
  payment.value = null
  contribution.value = {
    id: debt.id,
    half,
    amount: half === 1 ? debt.firstContribution : debt.secondContribution,
  }
}

function submitContribution() {
  const { id, half, amount } = contribution.value
  emit('save', `/${id}/contributions/${half}`, 'PUT', { amount }, () => { contribution.value = null })
}

function changePayment(debt) {
  if (debt.paid) {
    emit('save', `/${debt.id}/payment`, 'PUT', { paid: false })
    return
  }
  contribution.value = null
  payment.value = {
    id: debt.id,
    paymentDate: props.today.startsWith(props.month) ? props.today : `${props.month}-${lastDay.value}`,
  }
}

function submitPayment() {
  const { id, paymentDate } = payment.value
  emit('save', `/${id}/payment`, 'PUT', { paid: true, paymentDate }, () => { payment.value = null })
}

function archive(debt) {
  if (!window.confirm(`¿Archivar “${debt.name}” desde ${props.monthLabel}? Se conservarán los aportes y pagos registrados.`)) return
  emit('save', `/${debt.id}`, 'DELETE', {}, () => {
    if (plan.value.id === debt.id) resetPlan()
  })
}
</script>

<template>
  <section class="panel full-panel fixed-debts-panel">
    <div class="panel-heading">
      <div>
        <h2>Deudas fijas de {{ monthLabel }}</h2>
        <p>Aparta dinero el día 15 y en la segunda quincena, que cierra el día {{ lastDay }}.</p>
      </div>
      <div class="savings-total-card">
        <small>TOTAL DEL MES</small>
        <strong>{{ formatMoney(total) }}</strong>
      </div>
    </div>

    <form class="budget-create-form debt-plan-form" @submit.prevent="submitPlan">
      <label class="field-label">Nombre
        <input v-model="plan.name" placeholder="Ej. Renta" maxlength="100" required>
      </label>
      <label class="field-label">Monto mensual
        <input v-model.number="plan.amount" type="number" min="0.01" max="9999999999.99" step="0.01" required>
      </label>
      <button class="primary-button" :disabled="saving">{{ plan.id ? 'Guardar cambios' : 'Agregar deuda' }}</button>
      <button v-if="plan.id" class="secondary-button" type="button" @click="resetPlan">Cancelar edición</button>
    </form>
    <p v-if="plan.id" class="muted-note">El cambio se aplica desde {{ monthLabel }} y respeta los pagos registrados.</p>

    <div v-if="debts.length" class="goal-grid">
      <article v-for="debt in debts" :key="debt.id" class="goal-card">
        <h3>{{ debt.name }}</h3>
        <p>{{ formatMoney(debt.amount) }} al mes · {{ debt.paid ? 'Pagada' : 'Pendiente' }}<template v-if="debt.archived"> · Archivada</template></p>
        <dl class="debt-amounts">
          <div><dt>Primera quincena</dt><dd>{{ formatMoney(debt.firstContribution) }}</dd></div>
          <div><dt>Segunda quincena</dt><dd>{{ formatMoney(debt.secondContribution) }}</dd></div>
          <div><dt>Total apartado</dt><dd>{{ formatMoney(debt.reserved) }}</dd></div>
          <div v-if="!debt.paid"><dt>Por apartar</dt><dd>{{ formatMoney(Math.max(0, debt.amount - debt.reserved)) }}</dd></div>
        </dl>

        <form v-if="contribution?.id === debt.id" class="inline-form" @submit.prevent="submitContribution">
          <label class="field-label">{{ contribution.half === 1 ? 'Aporte de la primera quincena' : 'Aporte de la segunda quincena' }}
            <input v-model.number="contribution.amount" type="number" min="0" max="9999999999.99" step="0.01" required>
          </label>
          <div class="inline-actions debt-actions">
            <button class="primary-button" :disabled="saving">Guardar aporte</button>
            <button class="secondary-button" type="button" @click="contribution = null">Cancelar</button>
          </div>
        </form>
        <div v-else class="inline-actions debt-actions">
          <button class="small-action" :disabled="saving" @click="editContribution(debt, 1)">Aporte 1.ª quincena</button>
          <button class="small-action" :disabled="saving" @click="editContribution(debt, 2)">Aporte 2.ª quincena</button>
        </div>

        <form v-if="payment?.id === debt.id" class="inline-form" @submit.prevent="submitPayment">
          <label class="field-label">Fecha de pago
            <input v-model="payment.paymentDate" type="date" :min="`${month}-01`" :max="`${month}-${lastDay}`" required>
          </label>
          <div class="inline-actions debt-actions">
            <button class="primary-button" :disabled="saving">Confirmar pago</button>
            <button class="secondary-button" type="button" @click="payment = null">Cancelar</button>
          </div>
        </form>
        <label v-else class="payment-check debt-payment">
          <input type="checkbox" :checked="debt.paid" :disabled="saving" @click.prevent="changePayment(debt)">
          Pagada <small v-if="debt.paymentDate">· {{ debt.paymentDate }}</small>
        </label>

        <div v-if="!debt.archived" class="inline-actions debt-actions">
          <button class="small-action" :disabled="saving" @click="plan = { id: debt.id, name: debt.plannedName, amount: debt.plannedAmount }">Editar deuda</button>
          <button class="small-action" :disabled="saving" @click="archive(debt)">Archivar</button>
        </div>
      </article>
    </div>
    <div v-else class="empty-state">Agrega una deuda fija para organizar sus aportes quincenales.</div>
  </section>
</template>

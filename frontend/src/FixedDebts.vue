<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  accounts: { type: Array, required: true },
  debts: { type: Array, required: true },
  month: { type: String, required: true },
  monthLabel: { type: String, required: true },
  today: { type: String, required: true },
  formatMoney: { type: Function, required: true },
  saving: Boolean,
})
const emit = defineEmits(['save', 'open-budget'])
const contribution = ref(null)
const payment = ref(null)
const total = computed(() => props.debts.reduce((sum, debt) => sum + debt.amount, 0))
const lastDay = computed(() => {
  const [year, month] = props.month.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
})

watch(() => props.month, () => {
  contribution.value = null
  payment.value = null
})

function editContribution(debt, half) {
  payment.value = null
  contribution.value = {
    id: debt.id,
    half,
    bankAccountId: (half === 1 ? debt.firstAccountId : debt.secondAccountId) ?? '',
    amount: half === 1 ? debt.firstContribution : debt.secondContribution,
  }
}

function submitContribution() {
  const { id, half, amount, bankAccountId } = contribution.value
  emit('save', `/${id}/contributions/${half}`, 'PUT', { amount, bankAccountId: bankAccountId || null }, () => { contribution.value = null })
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

</script>

<template>
  <section class="panel full-panel fixed-debts-panel">
    <div class="panel-heading">
      <div>
        <h2>Deudas fijas de {{ monthLabel }}</h2>
        <p>Registra los aportes y pagos de las cuotas presupuestadas para este mes.</p>
      </div>
      <button class="text-link" @click="emit('open-budget')">Editar presupuesto →</button>
      <div class="savings-total-card">
        <small>TOTAL DEL MES</small>
        <strong>{{ formatMoney(total) }}</strong>
      </div>
    </div>

    <div v-if="debts.length" class="goal-grid">
      <article v-for="debt in debts" :key="debt.id" class="goal-card">
        <h3>{{ debt.name }}</h3>
        <p>{{ formatMoney(debt.amount) }} al mes · {{ debt.paid ? 'Pagada' : 'Pendiente' }}<template v-if="debt.archived"> · Archivada</template></p>
        <dl class="debt-amounts">
          <div><dt>Aporte 1.ª quincena</dt><dd>{{ formatMoney(debt.firstContribution) }}</dd></div>
          <div><dt>Aporte 2.ª quincena</dt><dd>{{ formatMoney(debt.secondContribution) }}</dd></div>
          <div><dt>Total apartado</dt><dd>{{ formatMoney(debt.reserved) }}</dd></div>
          <div v-if="!debt.paid"><dt>Por apartar</dt><dd>{{ formatMoney(Math.max(0, debt.amount - debt.reserved)) }}</dd></div>
        </dl>

        <form v-if="contribution?.id === debt.id" class="inline-form" @submit.prevent="submitContribution">
          <label class="field-label">{{ contribution.half === 1 ? 'Aporte de la primera quincena' : 'Aporte de la segunda quincena' }}
            <input v-model.number="contribution.amount" type="number" min="0" max="9999999999.99" step="0.01" required>
          </label>
          <label class="field-label">Cuenta donde apartaste el aporte
            <select v-model="contribution.bankAccountId">
              <option value="">Sin cuenta asignada</option>
              <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
            </select>
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

      </article>
    </div>
    <div v-else class="empty-state">Agrega una cuota mensual en Presupuesto para empezar a registrar aportes y pagos.</div>
  </section>
</template>

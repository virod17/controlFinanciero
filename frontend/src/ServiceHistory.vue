<script setup>
import { computed, onMounted, ref } from 'vue'

const props = defineProps({
  request: { type: Function, required: true },
  formatMoney: { type: Function, required: true },
  today: { type: String, required: true },
})

const categories = {
  maintenance: { label: 'Mantenimientos', subject: 'Vehículo o equipo', example: 'Changan UNI-T o aire de la sala' },
  exam: { label: 'Exámenes', subject: 'Persona o mascota', example: 'Nombre de la persona o mascota' },
  medical: { label: 'Visitas médicas', subject: 'Persona o mascota', example: 'Nombre de la persona o mascota' },
}

function blankRecord() {
  return { id: null, category: 'maintenance', subject: '', serviceDate: props.today, place: '', amount: '', notes: '' }
}

const records = ref([])
const form = ref(blankRecord())
const categoryFilter = ref('')
const search = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const status = ref('')
const historyKey = ref('')
const locked = ref(false)

async function request(path, options = {}) {
  try {
    return await props.request(path, {
      ...options,
      headers: historyKey.value ? { 'X-Service-History-Key': historyKey.value } : {},
    })
  } catch (failure) {
    if (failure.status === 401 || failure.status === 503) {
      locked.value = true
      records.value = []
    }
    throw failure
  }
}
const formHeading = ref(null)

const dateFormat = new Intl.DateTimeFormat('es-PA', { dateStyle: 'medium', timeZone: 'UTC' })
const normalize = text => text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
const filtered = computed(() => {
  const query = normalize(search.value)
  return records.value.filter(record =>
    (!categoryFilter.value || record.category === categoryFilter.value)
    && normalize(`${record.subject} ${record.place} ${record.notes}`).includes(query))
})

async function loadRecords() {
  loading.value = true
  error.value = ''
  try {
    records.value = await request('/service-history')
    locked.value = false
  } catch (failure) {
    error.value = failure.message
  } finally {
    loading.value = false
  }
}

onMounted(loadRecords)

function edit(record) {
  error.value = ''
  status.value = ''
  form.value = { ...record, amount: record.amount === null ? '' : Number(record.amount) }
  formHeading.value?.focus()
}

async function saveRecord() {
  saving.value = true
  error.value = ''
  status.value = ''
  const { id, amount, ...data } = form.value
  try {
    await request(id ? `/service-history/${id}` : '/service-history', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({ ...data, amount: amount === '' ? null : Number(amount) }),
    })
    form.value = blankRecord()
    status.value = id ? 'Registro actualizado.' : 'Registro agregado.'
    await loadRecords()
  } catch (failure) {
    error.value = failure.message
  } finally {
    saving.value = false
  }
}

async function removeRecord(record) {
  if (!window.confirm(`¿Eliminar el registro de ${record.subject} del ${formatDate(record.serviceDate)}?`)) return
  saving.value = true
  error.value = ''
  status.value = ''
  try {
    await request(`/service-history/${record.id}`, { method: 'DELETE' })
    if (form.value.id === record.id) form.value = blankRecord()
    status.value = 'Registro eliminado.'
    await loadRecords()
  } catch (failure) {
    error.value = failure.message
  } finally {
    saving.value = false
  }
}

function formatDate(date) {
  return dateFormat.format(new Date(`${date}T00:00:00Z`))
}
</script>

<template>
  <section v-if="locked" class="panel">
    <form class="inline-form" @submit.prevent="loadRecords">
      <label class="field-label">Clave de Servicios y visitas
        <input v-model="historyKey" type="password" autocomplete="off" required>
      </label>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <button class="primary-button" :disabled="loading">Abrir Servicios y visitas</button>
    </form>
  </section>
  <section v-else class="history-layout">
    <article class="panel">
      <div class="panel-heading">
        <h2 ref="formHeading" tabindex="-1">{{ form.id ? 'Editar registro' : 'Nuevo registro' }}</h2>
      </div>
      <form class="inline-form" @submit.prevent="saveRecord">
        <label class="field-label">Tipo
          <select v-model="form.category">
            <option v-for="(category, key) in categories" :key="key" :value="key">{{ category.label }}</option>
          </select>
        </label>
        <label class="field-label">{{ categories[form.category].subject }}
          <input v-model.trim="form.subject" :placeholder="categories[form.category].example" required maxlength="120">
        </label>
        <label class="field-label">Fecha
          <input v-model="form.serviceDate" type="date" required>
        </label>
        <label class="field-label">Lugar o proveedor
          <input v-model.trim="form.place" required maxlength="160">
        </label>
        <label class="field-label">Monto en USD
          <input v-model.number="form.amount" type="number" min="0" max="9999999999.99" step="0.01" placeholder="Opcional">
        </label>
        <label class="field-label">Comentario
          <textarea v-model.trim="form.notes" rows="3" maxlength="2000" placeholder="Trabajo realizado, motivo o examen realizado"></textarea>
        </label>
        <div class="inline-actions">
          <button class="primary-button" :disabled="saving">{{ form.id ? 'Guardar cambios' : 'Agregar registro' }}</button>
          <button v-if="form.id" class="secondary-button" type="button" :disabled="saving" @click="form = blankRecord()">Cancelar</button>
        </div>
      </form>
      <p v-if="status" role="status">{{ status }}</p>
    </article>

    <article class="panel">
      <div class="panel-heading"><h2>Registros anteriores</h2></div>
      <div class="history-filters">
        <label class="field-label">Filtrar por tipo
          <select v-model="categoryFilter">
            <option value="">Todos los tipos</option>
            <option v-for="(category, key) in categories" :key="key" :value="key">{{ category.label }}</option>
          </select>
        </label>
        <label class="field-label">Buscar en el historial
          <input v-model="search" type="search" placeholder="Nombre, lugar o comentario">
        </label>
      </div>
      <div v-if="error" class="error-banner" role="alert">
        <span>{{ error }}</span><button type="button" @click="loadRecords">Recargar</button>
      </div>
      <div v-if="loading" class="empty-state">Cargando registros…</div>
      <ul v-else-if="filtered.length" class="history-list">
        <li v-for="record in filtered" :key="record.id">
          <header>
            <div>
              <strong>{{ record.subject }}</strong>
              <small>{{ categories[record.category].label }} · {{ formatDate(record.serviceDate) }}</small>
            </div>
            <strong v-if="record.amount !== null">{{ formatMoney(record.amount) }}</strong>
          </header>
          <p>{{ record.place }}</p>
          <p v-if="record.notes" class="history-notes">{{ record.notes }}</p>
          <div class="inline-actions">
            <button class="small-action" :disabled="saving" @click="edit(record)">Editar</button>
            <button class="small-action" :disabled="saving" @click="removeRecord(record)">Eliminar</button>
          </div>
        </li>
      </ul>
      <p v-else class="empty-state">{{ records.length ? 'Ningún registro coincide con los filtros.' : 'Todavía no tienes registros.' }}</p>
    </article>
  </section>
</template>

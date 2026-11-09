import 'dotenv/config'
import { app } from './app.js'
import { sequelize } from './config/database.js'
import { BudgetGroup, BudgetItem } from './models/index.js'

const port = Number(process.env.PORT ?? 3000)

async function start() {
  try {
    await sequelize.authenticate()
    await sequelize.sync()

    const starterGroups = [
      { name: 'Deudas fijas', color: '#ed8c70', items: ['Préstamo'] },
      { name: 'Transporte', color: '#80a9cc', items: ['Gasolina'] },
      { name: 'Hogar', color: '#d1a758', items: ['Supermercado'] },
    ]

    for (const starter of starterGroups) {
      const [group] = await BudgetGroup.findOrCreate({
        where: { name: starter.name },
        defaults: { name: starter.name, color: starter.color },
      })
      for (const name of starter.items) {
        await BudgetItem.findOrCreate({ where: { name, groupId: group.id }, defaults: { name, groupId: group.id } })
      }
    }

    app.listen(port, () => {
      console.log('PostgreSQL conectado; tablas y categorías iniciales listas.')
      console.log(`API disponible en http://localhost:${port}`)
    })
  } catch (error) {
    console.error('No se pudo iniciar el backend:', error.message)
    process.exit(1)
  }
}

start()

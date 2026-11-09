import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'

export const BudgetGroup = sequelize.define('BudgetGroup', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(80), allowNull: false },
  color: { type: DataTypes.STRING(16), allowNull: false, defaultValue: '#3b806f' },
}, { tableName: 'budget_groups', underscored: true })

export const BudgetItem = sequelize.define('BudgetItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  groupId: { type: DataTypes.UUID, allowNull: false, field: 'group_id' },
}, { tableName: 'budget_items', underscored: true })

export const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  type: { type: DataTypes.ENUM('income', 'expense'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: 0.01 } },
  description: { type: DataTypes.STRING(180), allowNull: false },
  transactionDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'transaction_date' },
  source: { type: DataTypes.STRING(80), allowNull: true },
  paymentMethod: { type: DataTypes.STRING(40), allowNull: true, field: 'payment_method' },
  budgetItemId: { type: DataTypes.UUID, allowNull: true, field: 'budget_item_id' },
}, { tableName: 'transactions', underscored: true, indexes: [{ fields: ['transaction_date'] }] })

export const MonthlyBudget = sequelize.define('MonthlyBudget', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  month: { type: DataTypes.DATEONLY, allowNull: false },
  plannedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'planned_amount' },
  budgetItemId: { type: DataTypes.UUID, allowNull: false, field: 'budget_item_id' },
}, {
  tableName: 'monthly_budgets',
  underscored: true,
  indexes: [{ unique: true, fields: ['month', 'budget_item_id'] }],
})

export const SavingsGoal = sequelize.define('SavingsGoal', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  targetAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'target_amount' },
  monthlyContribution: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'monthly_contribution' },
}, { tableName: 'savings_goals', underscored: true })

export const SavingsMovement = sequelize.define('SavingsMovement', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  type: { type: DataTypes.ENUM('deposit', 'withdrawal'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: 0.01 } },
  movementDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'movement_date' },
  note: { type: DataTypes.STRING(180), allowNull: true },
  savingsGoalId: { type: DataTypes.UUID, allowNull: false, field: 'savings_goal_id' },
}, { tableName: 'savings_movements', underscored: true, indexes: [{ fields: ['movement_date'] }] })

BudgetGroup.hasMany(BudgetItem, { foreignKey: 'groupId', as: 'items', onDelete: 'CASCADE' })
BudgetItem.belongsTo(BudgetGroup, { foreignKey: 'groupId', as: 'group' })
BudgetItem.hasMany(Transaction, { foreignKey: 'budgetItemId', as: 'transactions', onDelete: 'SET NULL' })
Transaction.belongsTo(BudgetItem, { foreignKey: 'budgetItemId', as: 'budgetItem' })
BudgetItem.hasMany(MonthlyBudget, { foreignKey: 'budgetItemId', as: 'monthlyBudgets', onDelete: 'CASCADE' })
MonthlyBudget.belongsTo(BudgetItem, { foreignKey: 'budgetItemId', as: 'budgetItem' })
SavingsGoal.hasMany(SavingsMovement, { foreignKey: 'savingsGoalId', as: 'movements', onDelete: 'CASCADE' })
SavingsMovement.belongsTo(SavingsGoal, { foreignKey: 'savingsGoalId', as: 'goal' })

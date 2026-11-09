import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'

export const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING(180), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
}, { tableName: 'users', underscored: true })

export const BudgetGroup = sequelize.define('BudgetGroup', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(80), allowNull: false },
  color: { type: DataTypes.STRING(16), allowNull: false, defaultValue: '#3b806f' },
}, { tableName: 'budget_groups', underscored: true })

export const BudgetItem = sequelize.define('BudgetItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
}, { tableName: 'budget_items', underscored: true })

export const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  type: { type: DataTypes.ENUM('income', 'expense'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  description: { type: DataTypes.STRING(180), allowNull: false },
  transactionDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'transaction_date' },
  source: { type: DataTypes.STRING(80), allowNull: true },
  paymentMethod: { type: DataTypes.STRING(40), allowNull: true, field: 'payment_method' },
}, { tableName: 'transactions', underscored: true })

export const MonthlyBudget = sequelize.define('MonthlyBudget', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  month: { type: DataTypes.DATEONLY, allowNull: false },
  plannedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'planned_amount' },
}, { tableName: 'monthly_budgets', underscored: true })

export const SavingsGoal = sequelize.define('SavingsGoal', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  targetAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'target_amount' },
  monthlyContribution: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'monthly_contribution' },
}, { tableName: 'savings_goals', underscored: true })

export const SavingsMovement = sequelize.define('SavingsMovement', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  type: { type: DataTypes.ENUM('deposit', 'withdrawal'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  movementDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'movement_date' },
  note: { type: DataTypes.STRING(180), allowNull: true },
}, { tableName: 'savings_movements', underscored: true })

User.hasMany(BudgetGroup, { foreignKey: { name: 'userId', field: 'user_id' }, onDelete: 'CASCADE' })
BudgetGroup.belongsTo(User, { foreignKey: { name: 'userId', field: 'user_id' } })
BudgetGroup.hasMany(BudgetItem, { foreignKey: { name: 'groupId', field: 'group_id' }, onDelete: 'CASCADE' })
BudgetItem.belongsTo(BudgetGroup, { foreignKey: { name: 'groupId', field: 'group_id' } })
User.hasMany(Transaction, { foreignKey: { name: 'userId', field: 'user_id' }, onDelete: 'CASCADE' })
Transaction.belongsTo(User, { foreignKey: { name: 'userId', field: 'user_id' } })
BudgetItem.hasMany(Transaction, { foreignKey: { name: 'budgetItemId', field: 'budget_item_id' } })
Transaction.belongsTo(BudgetItem, { foreignKey: { name: 'budgetItemId', field: 'budget_item_id' } })
BudgetItem.hasMany(MonthlyBudget, { foreignKey: { name: 'budgetItemId', field: 'budget_item_id' }, onDelete: 'CASCADE' })
MonthlyBudget.belongsTo(BudgetItem, { foreignKey: { name: 'budgetItemId', field: 'budget_item_id' } })
User.hasMany(SavingsGoal, { foreignKey: { name: 'userId', field: 'user_id' }, onDelete: 'CASCADE' })
SavingsGoal.belongsTo(User, { foreignKey: { name: 'userId', field: 'user_id' } })
SavingsGoal.hasMany(SavingsMovement, { foreignKey: { name: 'savingsGoalId', field: 'savings_goal_id' }, onDelete: 'CASCADE' })
SavingsMovement.belongsTo(SavingsGoal, { foreignKey: { name: 'savingsGoalId', field: 'savings_goal_id' } })

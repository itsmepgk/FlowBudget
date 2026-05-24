import { CATEGORIES } from '../lib/utils'
import type { Expense } from '../lib/types'

interface Props {
  expenses: Expense[]
  nameMap: Record<string, string>
  currentUserId: string
  currencySym: string
  onAdd: () => void
  onEdit: (id: number) => void
  onDelete: (id: number, desc: string) => void
}

export default function ExpensesList({
  expenses, nameMap, currentUserId, currencySym, onAdd, onEdit, onDelete,
}: Props) {
  return (
    <div className="card">
      <div className="section-header">
        <h3>Expenses</h3>
        <button className="add-btn" onClick={onAdd}>+ Add</button>
      </div>
      {expenses.length === 0 ? (
        <p className="empty-msg">No expenses yet.</p>
      ) : expenses.map(e => {
        const icon = CATEGORIES[e.category] || '🧾'
        const canEdit = e.paid_by === currentUserId
        return (
          <div key={e.id} className="expense-item">
            <div className="expense-icon">{icon}</div>
            <div className="expense-info">
              <div className="expense-desc">{e.description}</div>
              <div className="expense-meta">
                Paid by {nameMap[e.paid_by] || 'Unknown'} · {new Date(e.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="expense-right">
              <div className="expense-amount">{currencySym}{parseFloat(String(e.amount)).toFixed(2)}</div>
              {canEdit && (
                <>
                  <button className="edit-btn" onClick={() => onEdit(e.id)}>✏️</button>
                  <button className="delete-btn" onClick={() => onDelete(e.id, e.description)}>🗑</button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

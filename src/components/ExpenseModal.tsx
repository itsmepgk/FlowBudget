import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { CATEGORIES, CURRENCIES } from '../lib/utils'
import type { AppUser, Group, GroupMember, SplitType, SplitEntry } from '../lib/types'

interface Props {
  group: Group
  groupMembers: GroupMember[]
  currentUser: AppUser
  editingExpenseId: number | null
  onClose: () => void
  onSaved: () => void
  logEvent: (summary: string, type: string) => Promise<void>
}

export default function ExpenseModal({
  group, groupMembers, currentUser, editingExpenseId, onClose, onSaved, logEvent,
}: Props) {
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('other')
  const [paidBy, setPaidBy] = useState(currentUser.id)
  const [splitType, setSplitType] = useState<SplitType>('equal')
  const [checked, setChecked] = useState<Set<string>>(
    new Set(groupMembers.map(m => m.user_uuid)),
  )
  const [customAmt, setCustomAmt] = useState<Record<string, string>>({})
  const [ratioAmt, setRatioAmt] = useState<Record<string, string>>(
    Object.fromEntries(groupMembers.map(m => [m.user_uuid, '1'])),
  )

  const csym = CURRENCIES[group.currency] || '$'
  const total = parseFloat(amount) || 0

  useEffect(() => {
    if (!editingExpenseId) return
    ;(async () => {
      const [{ data: exp }, { data: splits }] = await Promise.all([
        sb.from('expenses').select('*').eq('id', editingExpenseId).single(),
        sb.from('expense_splits').select('*').eq('expense_id', editingExpenseId),
      ])
      if (!exp) return
      setDesc(exp.description)
      setAmount(String(exp.amount))
      setCategory(exp.category || 'other')
      setPaidBy(exp.paid_by)
      if (splits?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const splitMap: Record<string, number> = Object.fromEntries(splits.map((s: any) => [s.user_uuid, parseFloat(s.amount)]))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const amounts = splits.map((s: any) => parseFloat(s.amount))
        const allEqual = amounts.every((a: number) => Math.abs(a - amounts[0]) < 0.01)
        if (allEqual) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setChecked(new Set(splits.map((s: any) => s.user_uuid)))
        } else {
          setSplitType('custom')
          setCustomAmt(Object.fromEntries(Object.entries(splitMap).map(([k, v]) => [k, (v as number).toFixed(2)])))
        }
      }
    })()
  }, [editingExpenseId])

  function toggleMember(uuid: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(uuid) ? next.delete(uuid) : next.add(uuid)
      return next
    })
  }

  const customRemaining = total - Object.values(customAmt).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  async function submit() {
    const amtNum = parseFloat(amount)
    if (!desc.trim() || isNaN(amtNum) || amtNum <= 0) { alert('Please fill in all fields'); return }

    let splits: SplitEntry[] = []
    if (splitType === 'equal') {
      const uuids = [...checked]
      if (!uuids.length) { alert('Select at least one person'); return }
      const share = parseFloat((amtNum / uuids.length).toFixed(2))
      splits = uuids.map(uuid => ({ user_uuid: uuid, amount: share }))
    } else if (splitType === 'custom') {
      splits = groupMembers
        .map(m => ({ user_uuid: m.user_uuid, amount: parseFloat(customAmt[m.user_uuid] || '0') || 0 }))
        .filter(s => s.amount > 0)
      const t = splits.reduce((s, c) => s + c.amount, 0)
      if (!splits.length) { alert('Enter at least one amount'); return }
      if (Math.abs(t - amtNum) > 0.01) {
        alert(`Split (${csym}${t.toFixed(2)}) must equal total (${csym}${amtNum.toFixed(2)})`); return
      }
    } else {
      const rows = groupMembers
        .map(m => ({ uuid: m.user_uuid, ratio: parseFloat(ratioAmt[m.user_uuid] || '0') || 0 }))
        .filter(r => r.ratio > 0)
      if (!rows.length) { alert('Enter at least one ratio'); return }
      const t = rows.reduce((s, r) => s + r.ratio, 0)
      splits = rows.map(r => ({ user_uuid: r.uuid, amount: parseFloat((amtNum * r.ratio / t).toFixed(2)) }))
    }

    if (editingExpenseId) {
      const { data: updated, error } = await sb.from('expenses')
        .update({ description: desc.trim(), amount: amtNum, category, paid_by: paidBy })
        .eq('id', editingExpenseId).select()
      if (error) { alert(error.message); return }
      if (!updated?.length) { alert('Update blocked — run Migration v5 in Supabase SQL Editor.'); return }
      await sb.from('expense_splits').delete().eq('expense_id', editingExpenseId)
      await sb.from('expense_splits').insert(splits.map(s => ({ expense_id: editingExpenseId, ...s })))
      await logEvent(`Updated "${desc.trim()}" · ${csym}${amtNum.toFixed(2)}`, 'expense_updated')
    } else {
      const { data: expense, error } = await sb.from('expenses')
        .insert([{ group_id: group.id, description: desc.trim(), amount: amtNum, paid_by: paidBy, category }])
        .select()
      if (error) { alert(error.message); return }
      await sb.from('expense_splits').insert(splits.map(s => ({ expense_id: expense[0].id, ...s })))
      await logEvent(`Added "${desc.trim()}" · ${csym}${amtNum.toFixed(2)}`, 'expense_added')
    }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box">
        <button className="close-btn" onClick={onClose}>✕</button>
        <h2>{editingExpenseId ? 'Edit Expense' : 'Add Expense'}</h2>

        <label className="field-label">Description</label>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Dinner" />

        <label className="field-label">Amount ({csym})</label>
        <input type="number" step="0.01" min="0.01" value={amount}
          onChange={e => setAmount(e.target.value)} placeholder="0.00" />

        <label className="field-label">Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v} {k.charAt(0).toUpperCase() + k.slice(1)}</option>
          ))}
        </select>

        <label className="field-label">Paid by</label>
        <select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
          {groupMembers.map(m => <option key={m.user_uuid} value={m.user_uuid}>{m.name}</option>)}
        </select>

        <label className="field-label">Split type</label>
        <select value={splitType} onChange={e => setSplitType(e.target.value as SplitType)}>
          <option value="equal">Equal</option>
          <option value="custom">Custom amounts</option>
          <option value="ratio">By ratio</option>
        </select>

        {splitType === 'equal' && (
          <div>
            <label className="field-label">Split with</label>
            <div className="split-members">
              {groupMembers.map(m => (
                <label key={m.user_uuid} className="split-member">
                  <input type="checkbox" checked={checked.has(m.user_uuid)}
                    onChange={() => toggleMember(m.user_uuid)} />
                  {m.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {splitType === 'custom' && (
          <div>
            <label className="field-label">Custom amounts</label>
            <div className="split-inputs">
              {groupMembers.map(m => (
                <label key={m.user_uuid} className="split-input-row">
                  <span>{m.name}</span>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    value={customAmt[m.user_uuid] || ''}
                    onChange={e => setCustomAmt(p => ({ ...p, [m.user_uuid]: e.target.value }))} />
                </label>
              ))}
            </div>
            <div className={`split-remaining ${Math.abs(customRemaining) < 0.005 ? 'balanced' : 'unbalanced'}`}>
              {Math.abs(customRemaining) < 0.005
                ? '✅ Balanced'
                : customRemaining > 0
                  ? `${csym}${customRemaining.toFixed(2)} remaining`
                  : `Over by ${csym}${Math.abs(customRemaining).toFixed(2)}`}
            </div>
          </div>
        )}

        {splitType === 'ratio' && (
          <div>
            <label className="field-label">Ratios</label>
            <div className="split-inputs">
              {groupMembers.map(m => (
                <label key={m.user_uuid} className="split-input-row">
                  <span>{m.name}</span>
                  <input type="number" step="0.1" min="0"
                    value={ratioAmt[m.user_uuid] || '1'}
                    onChange={e => setRatioAmt(p => ({ ...p, [m.user_uuid]: e.target.value }))} />
                </label>
              ))}
            </div>
          </div>
        )}

        <button onClick={submit}>{editingExpenseId ? 'Save Changes' : 'Add Expense'}</button>
      </div>
    </div>
  )
}

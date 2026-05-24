import { useState } from 'react'
import { sb } from '../lib/supabase'
import { CURRENCIES } from '../lib/utils'
import type { AppUser, Group } from '../lib/types'

interface SettleTarget {
  fromId: string; toId: string; amount: number; fromName: string; toName: string
}

interface Props {
  group: Group
  currentUser: AppUser
  target: SettleTarget
  onClose: () => void
  onSettled: () => void
  logEvent: (summary: string, type: string) => Promise<void>
}

export default function SettleModal({ group, target, onClose, onSettled, logEvent }: Props) {
  const [amount, setAmount] = useState(target.amount.toFixed(2))
  const csym = CURRENCIES[group.currency] || '$'

  async function confirm() {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { alert('Enter a valid amount'); return }
    const { error } = await sb.from('settlements').insert([{
      group_id: group.id, payer_uuid: target.fromId,
      receiver_uuid: target.toId, amount: amt,
    }])
    if (error) { alert(error.message); return }
    await logEvent(`${target.fromName} paid ${target.toName} ${csym}${amt.toFixed(2)}`, 'settled')
    onSettled()
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box">
        <button className="close-btn" onClick={onClose}>✕</button>
        <h2>Settle Up</h2>
        <p className="settle-desc">
          <strong>{target.fromName}</strong> pays <strong>{target.toName}</strong>
        </p>
        <label className="field-label">Amount</label>
        <input type="number" step="0.01" min="0.01"
          value={amount} onChange={e => setAmount(e.target.value)} />
        <button onClick={confirm}>Confirm Payment</button>
      </div>
    </div>
  )
}

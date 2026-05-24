import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { CURRENCIES, makeCode } from '../lib/utils'
import type { AppUser, Group } from '../lib/types'

interface Props {
  currentUser: AppUser
  onOpenGroup: (group: Group) => void
}

interface GroupWithBalance extends Group { balance: number }

export default function MainView({ currentUser, onOpenGroup }: Props) {
  const [groups, setGroups] = useState<GroupWithBalance[]>([])
  const [groupName, setGroupName] = useState('')
  const [groupCurrency, setGroupCurrency] = useState('USD')
  const [inviteCode, setInviteCode] = useState('')

  useEffect(() => { loadGroups() }, [currentUser.id])

  async function loadNetBalances(groupIds: number[]): Promise<Record<number, number>> {
    const [{ data: exps }, { data: sett }] = await Promise.all([
      sb.from('expenses').select('id, group_id, paid_by, amount').in('group_id', groupIds),
      sb.from('settlements').select('group_id, payer_uuid, receiver_uuid, amount').in('group_id', groupIds),
    ])
    const nets: Record<number, number> = Object.fromEntries(groupIds.map(id => [id, 0]))
    const expMap: Record<number, number> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(exps || []).forEach((e: any) => {
      expMap[e.id] = e.group_id
      if (e.paid_by === currentUser.id) nets[e.group_id] += parseFloat(e.amount)
    })
    const expIds = Object.keys(expMap)
    if (expIds.length) {
      const { data: splits } = await sb.from('expense_splits')
        .select('expense_id, amount').in('expense_id', expIds).eq('user_uuid', currentUser.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(splits || []).forEach((s: any) => { nets[expMap[s.expense_id]] -= parseFloat(s.amount) })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(sett || []).forEach((s: any) => {
      if (s.payer_uuid === currentUser.id) nets[s.group_id] += parseFloat(s.amount)
      if (s.receiver_uuid === currentUser.id) nets[s.group_id] -= parseFloat(s.amount)
    })
    return nets
  }

  async function loadGroups() {
    const { data: memberships } = await sb.from('group_members')
      .select('group_id').eq('user_uuid', currentUser.id)
    if (!memberships?.length) { setGroups([]); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = memberships.map((m: any) => m.group_id)
    const [{ data: groupData }, nets] = await Promise.all([
      sb.from('groups').select('*').in('id', ids),
      loadNetBalances(ids),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGroups((groupData || []).map((g: any) => ({ ...g, balance: nets[g.id] || 0 })))
  }

  async function createGroup() {
    if (!groupName.trim()) { alert('Enter a group name'); return }
    const { error } = await sb.from('groups').insert([{
      name: groupName.trim(), invite_code: makeCode(),
      owner_uuid: currentUser.id, currency: groupCurrency,
    }])
    if (error) { alert(error.message); return }
    // Add creator as first member
    const { data: created } = await sb.from('groups').select('*').eq('invite_code', groupName.trim()).maybeSingle()
    setGroupName('')
    await loadGroups()
    void created // unused
  }

  async function joinGroup() {
    const code = inviteCode.trim().toUpperCase()
    const { data: group } = await sb.from('groups').select('*').eq('invite_code', code).maybeSingle()
    if (!group) { alert('Invalid invite code'); return }
    const { error } = await sb.from('group_members').insert([{
      group_id: group.id, user_uuid: currentUser.id, user_email: currentUser.email,
    }])
    if (error?.code === '23505') { alert('You are already in this group'); return }
    if (error) { alert(error.message); return }
    setInviteCode('')
    await loadGroups()
  }

  return (
    <>
      <div className="card">
        <h3>Create a Group</h3>
        <input value={groupName} onChange={e => setGroupName(e.target.value)}
          placeholder="Group name (e.g. Bali Trip)" />
        <label className="field-label">Currency</label>
        <select value={groupCurrency} onChange={e => setGroupCurrency(e.target.value)}>
          {Object.entries(CURRENCIES).map(([code, sym]) => (
            <option key={code} value={code}>{code} ({sym})</option>
          ))}
        </select>
        <button onClick={createGroup}>Create Group</button>
      </div>

      <div className="card">
        <h3>Join a Group</h3>
        <input value={inviteCode} onChange={e => setInviteCode(e.target.value)}
          placeholder="Invite code" />
        <button onClick={joinGroup}>Join Group</button>
      </div>

      <div className="card">
        <h3>Your Groups</h3>
        {groups.length === 0 ? (
          <p className="empty-msg">No groups yet. Create or join one above!</p>
        ) : groups.map(g => {
          const r = Math.round(g.balance * 100) / 100
          const csym = CURRENCIES[g.currency] || '$'
          const badgeClass = r > 0.005 ? 'owed' : r < -0.005 ? 'owes' : 'settled'
          const badgeText = r > 0.005
            ? `owed ${csym}${r.toFixed(2)}`
            : r < -0.005 ? `owes ${csym}${Math.abs(r).toFixed(2)}` : 'settled'
          return (
            <div key={g.id} className="group-item" onClick={() => onOpenGroup(g)}>
              <div>
                <div className="group-item-name">{g.name}</div>
                <div className="group-item-code">Code: {g.invite_code}</div>
              </div>
              <div className="group-item-right">
                <span className={`balance-badge ${badgeClass}`}>{badgeText}</span>
                <span className="chevron">›</span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

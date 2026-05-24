import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { CURRENCIES, displayName } from '../lib/utils'
import type { AppUser, Group, GroupMember, Expense, GroupEvent } from '../lib/types'
import MembersList from './MembersList'
import ExpensesList from './ExpensesList'
import ExpenseModal from './ExpenseModal'
import BalancesCard from './BalancesCard'
import SettleModal from './SettleModal'
import ActivityFeed from './ActivityFeed'

interface SettleTarget {
  fromId: string; toId: string; amount: number; fromName: string; toName: string
}

interface Props {
  currentUser: AppUser
  group: Group
  onBack: () => void
  onUserUpdate: (updates: Partial<AppUser>) => void
}

export default function GroupDetail({ currentUser, group, onBack, onUserUpdate }: Props) {
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [activity, setActivity] = useState<GroupEvent[]>([])
  const [netBalances, setNetBalances] = useState<Record<string, number>>({})
  const [simplifyEnabled, setSimplifyEnabled] = useState(true)
  const [expModalOpen, setExpModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null)
  const [copyLabel, setCopyLabel] = useState(`Code: ${group.invite_code}`)
  const channelRef = useRef<ReturnType<typeof sb.channel> | null>(null)

  const csym = CURRENCIES[group.currency] || '$'

  async function loadMembers() {
    const { data: members } = await sb.from('group_members')
      .select('user_uuid, user_email').eq('group_id', group.id)
    if (!members) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uuids = members.map((m: any) => m.user_uuid)
    const { data: users } = await sb.from('users').select('id, name, name_changed').in('id', uuids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userMap: Record<string, any> = Object.fromEntries((users || []).map((u: any) => [u.id, u]))
    const self = userMap[currentUser.id]
    if (self) {
      onUserUpdate({
        name: displayName(self.name, currentUser.email),
        nameChanged: self.name_changed || false,
      })
    }
    setGroupMembers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      members.map((m: any) => ({
        user_uuid: m.user_uuid,
        user_email: m.user_email,
        name: displayName(userMap[m.user_uuid]?.name, m.user_email),
      })),
    )
  }

  async function loadExpenses() {
    const { data } = await sb.from('expenses').select('*')
      .eq('group_id', group.id).order('created_at', { ascending: false })
    setExpenses(data || [])
  }

  async function loadBalances() {
    const { data: expData } = await sb.from('expenses')
      .select('id, paid_by, amount').eq('group_id', group.id)
    if (!expData?.length) { setNetBalances({}); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expIds = expData.map((e: any) => e.id)
    const [{ data: splits }, { data: settlements }] = await Promise.all([
      sb.from('expense_splits').select('*').in('expense_id', expIds),
      sb.from('settlements').select('*').eq('group_id', group.id),
    ])
    const net: Record<string, number> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expData.forEach((e: any) => { net[e.paid_by] = (net[e.paid_by] || 0) + parseFloat(e.amount) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(splits || []).forEach((s: any) => { net[s.user_uuid] = (net[s.user_uuid] || 0) - parseFloat(s.amount) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(settlements || []).forEach((s: any) => {
      net[s.payer_uuid] = (net[s.payer_uuid] || 0) + parseFloat(s.amount)
      net[s.receiver_uuid] = (net[s.receiver_uuid] || 0) - parseFloat(s.amount)
    })
    setNetBalances(net)
  }

  async function loadActivity() {
    const { data } = await sb.from('group_events').select('*')
      .eq('group_id', group.id).order('created_at', { ascending: false }).limit(20)
    setActivity(data || [])
  }

  async function logEvent(summary: string, eventType: string) {
    await sb.from('group_events').insert([{
      group_id: group.id, user_uuid: currentUser.id, event_type: eventType, summary,
    }])
  }

  useEffect(() => {
    loadMembers(); loadExpenses(); loadBalances(); loadActivity()

    channelRef.current = sb.channel(`grp-${group.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${group.id}` },
        () => { loadExpenses(); loadBalances(); loadActivity() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `group_id=eq.${group.id}` },
        () => { loadBalances(); loadActivity() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${group.id}` },
        () => { loadMembers() })
      .subscribe()

    return () => { if (channelRef.current) sb.removeChannel(channelRef.current) }
  }, [group.id])

  async function handleDeleteExpense(id: number, desc: string) {
    if (!confirm('Delete this expense? Splits will also be removed.')) return
    await logEvent(`Deleted "${desc}"`, 'expense_deleted')
    await sb.from('expenses').delete().eq('id', id)
    await loadExpenses()
    await Promise.all([loadBalances(), loadActivity()])
  }

  async function handleLeave() {
    if (!confirm(`Leave "${group.name}"? You won't see this group anymore.`)) return
    const { error } = await sb.from('group_members')
      .delete().eq('group_id', group.id).eq('user_uuid', currentUser.id)
    if (error) { alert(error.message); return }
    onBack()
  }

  function copyCode() {
    navigator.clipboard.writeText(group.invite_code)
    setCopyLabel('✓ Copied!')
    setTimeout(() => setCopyLabel(`Code: ${group.invite_code}`), 1500)
  }

  const nameMap = Object.fromEntries(groupMembers.map(m => [m.user_uuid, m.name]))

  return (
    <div>
      <div className="back-bar">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>{group.name}</h2>
        <span className="invite-badge" onClick={copyCode}>{copyLabel}</span>
      </div>

      <div className="group-detail-grid">
        <MembersList members={groupMembers} />
        <ExpensesList
          expenses={expenses}
          nameMap={nameMap}
          currentUserId={currentUser.id}
          currencySym={csym}
          onAdd={() => { setEditingId(null); setExpModalOpen(true) }}
          onEdit={id => { setEditingId(id); setExpModalOpen(true) }}
          onDelete={handleDeleteExpense}
        />
      </div>

      <BalancesCard
        netBalances={netBalances}
        nameMap={nameMap}
        currentUserId={currentUser.id}
        currencySym={csym}
        simplifyEnabled={simplifyEnabled}
        onToggleSimplify={() => setSimplifyEnabled(v => !v)}
        onSettle={(fId, tId, amt, fName, tName) =>
          setSettleTarget({ fromId: fId, toId: tId, amount: amt, fromName: fName, toName: tName })
        }
      />

      <ActivityFeed activity={activity} nameMap={nameMap} />

      <div className="danger-zone">
        <button className="leave-btn" onClick={handleLeave}>Leave Group</button>
      </div>

      {expModalOpen && (
        <ExpenseModal
          group={group}
          groupMembers={groupMembers}
          currentUser={currentUser}
          editingExpenseId={editingId}
          onClose={() => setExpModalOpen(false)}
          onSaved={async () => {
            setExpModalOpen(false)
            await loadExpenses()
            await Promise.all([loadBalances(), loadActivity()])
          }}
          logEvent={logEvent}
        />
      )}

      {settleTarget && (
        <SettleModal
          group={group}
          currentUser={currentUser}
          target={settleTarget}
          onClose={() => setSettleTarget(null)}
          onSettled={async () => {
            setSettleTarget(null)
            await loadBalances()
            await loadActivity()
          }}
          logEvent={logEvent}
        />
      )}
    </div>
  )
}

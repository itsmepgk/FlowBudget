import { simplifyDebts } from '../lib/utils'

interface Props {
  netBalances: Record<string, number>
  nameMap: Record<string, string>
  currentUserId: string
  currencySym: string
  simplifyEnabled: boolean
  onToggleSimplify: () => void
  onSettle: (fromId: string, toId: string, amount: number, fromName: string, toName: string) => void
}

export default function BalancesCard({
  netBalances, nameMap, currentUserId, currencySym,
  simplifyEnabled, onToggleSimplify, onSettle,
}: Props) {
  const toggleBtn = (
    <button
      className={`toggle-btn${simplifyEnabled ? ' active' : ''}`}
      onClick={onToggleSimplify}
    >
      {simplifyEnabled ? '⚡ Simplified' : 'Simplify'}
    </button>
  )

  if (!Object.keys(netBalances).length) {
    return (
      <div className="card">
        <div className="section-header"><h3>Balances</h3>{toggleBtn}</div>
        <p className="empty-msg">✅ All settled up!</p>
      </div>
    )
  }

  if (simplifyEnabled) {
    const debts = simplifyDebts(netBalances, nameMap)
    return (
      <div className="card">
        <div className="section-header"><h3>Balances</h3>{toggleBtn}</div>
        {debts.length === 0 ? (
          <p className="empty-msg">✅ All settled up!</p>
        ) : debts.map((d, i) => {
          const isMe = d.from === currentUserId || d.to === currentUserId
          return (
            <div key={i} className={`balance-item${isMe ? ' balance-highlight' : ''}`}>
              <div className="balance-text">
                <strong>{d.fromName}</strong> owes <strong>{d.toName}</strong>
              </div>
              <div className="balance-right">
                <span className="balance-amount">{currencySym}{d.amount.toFixed(2)}</span>
                {d.from === currentUserId && (
                  <button className="settle-btn"
                    onClick={() => onSettle(d.from, d.to, d.amount, d.fromName, d.toName)}>
                    Settle
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Raw per-person view
  return (
    <div className="card">
      <div className="section-header"><h3>Balances</h3>{toggleBtn}</div>
      {Object.entries(netBalances).map(([uuid, amt]) => {
        const r = Math.round(amt * 100) / 100
        if (Math.abs(r) < 0.005) return null
        const isMe = uuid === currentUserId
        return (
          <div key={uuid} className={`balance-item${isMe ? ' balance-highlight' : ''}`}>
            <div className="balance-text">
              <strong>{nameMap[uuid] || 'Unknown'}</strong> {r > 0 ? 'is owed' : 'owes'}
            </div>
            <div className="balance-right">
              <span className="balance-amount">{currencySym}{Math.abs(r).toFixed(2)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

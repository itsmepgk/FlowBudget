import type { GroupEvent } from '../lib/types'

const ICONS: Record<string, string> = {
  expense_added: '➕', expense_updated: '✏️', expense_deleted: '🗑️', settled: '✅',
}

interface Props { activity: GroupEvent[]; nameMap: Record<string, string> }

export default function ActivityFeed({ activity, nameMap }: Props) {
  return (
    <div className="card">
      <h3>Activity</h3>
      {activity.length === 0 ? (
        <p className="empty-msg">No activity yet.</p>
      ) : activity.map(a => (
        <div key={a.id} className="activity-item">
          <div className="activity-icon">{ICONS[a.event_type] || '📝'}</div>
          <div>
            <div className="activity-title">{a.summary}</div>
            <div className="activity-meta">
              {nameMap[a.user_uuid] || 'Unknown'} · {new Date(a.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

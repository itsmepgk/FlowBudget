import type { GroupMember } from '../lib/types'

interface Props { members: GroupMember[] }

export default function MembersList({ members }: Props) {
  return (
    <div className="card">
      <h3>Members ({members.length})</h3>
      {members.map(m => (
        <div key={m.user_uuid} className="member-item">
          <div className="member-avatar">{m.name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="member-name">{m.name}</div>
            <div className="member-email">{m.user_email}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

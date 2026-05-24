import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import type { AppUser } from '../lib/types'

interface Props {
  currentUser: AppUser | null
  onLoginClick: () => void
  onLogout: () => void
  onUserUpdate: (updates: Partial<AppUser>) => void
}

export default function Header({ currentUser, onLoginClick, onLogout, onUserUpdate }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [])

  // Close menu on navigation (group open/close)
  useEffect(() => { setMenuOpen(false) }, [currentUser])

  async function promptRename() {
    setMenuOpen(false)
    const raw = prompt('Enter your new display name (max 30 chars).\nWarning: this can only be done once.')
    if (raw === null) return
    const name = raw.trim()
    if (!name) { alert('Name cannot be empty'); return }
    if (name.length > 30) { alert('Name must be 30 characters or less'); return }
    if (name.includes('@')) { alert('Please use your real name, not an email address'); return }
    if (!confirm(`Change your name to "${name}"?\n\nThis cannot be changed again.`)) return

    const { error } = await sb.from('users')
      .upsert({ id: currentUser!.id, name, name_changed: true }, { onConflict: 'id' })
    if (error) { alert('Could not save name: ' + error.message); return }
    onUserUpdate({ name, nameChanged: true })
  }

  return (
    <header className="app-header">
      <div className="header-logo">💰 FlowBudget</div>
      <div className="header-right">
        {currentUser ? (
          <div className="user-info-wrap" ref={wrapRef}>
            <button className="user-avatar-btn" onClick={() => setMenuOpen(v => !v)}>
              {(currentUser.name || '?')[0].toUpperCase()}
            </button>
            {menuOpen && (
              <div className="user-menu">
                <div className="user-menu-name">{currentUser.name}</div>
                <div className="user-menu-email">{currentUser.email}</div>
                <div className="user-menu-divider" />
                {!currentUser.nameChanged && (
                  <button className="user-menu-action" onClick={promptRename}>✏️ Rename</button>
                )}
                <button className="user-menu-action user-menu-logout" onClick={onLogout}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="auth-btn" onClick={onLoginClick}>Login</button>
        )}
      </div>
    </header>
  )
}

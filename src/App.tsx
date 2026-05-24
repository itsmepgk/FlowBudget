import { useState, useEffect, useCallback } from 'react'
import { sb } from './lib/supabase'
import { displayName } from './lib/utils'
import type { AppUser, Group } from './lib/types'
import Header from './components/Header'
import AuthModal from './components/AuthModal'
import MainView from './components/MainView'
import GroupDetail from './components/GroupDetail'

export default function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [ready, setReady] = useState(false)

  async function initAuth() {
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      let { data } = await sb.from('users')
        .select('name, name_changed').eq('id', user.id).maybeSingle()
      if (!data) {
        const fallback = user.email!.split('@')[0]
        await sb.from('users').upsert(
          { id: user.id, name: fallback, name_changed: false },
          { onConflict: 'id' },
        )
        data = { name: fallback, name_changed: false }
      }
      setCurrentUser({
        id: user.id,
        email: user.email!,
        name: displayName(data!.name, user.email!),
        nameChanged: data!.name_changed || false,
      })
    }
    setReady(true)
  }

  useEffect(() => { initAuth() }, [])

  const handleUserUpdate = useCallback((updates: Partial<AppUser>) => {
    setCurrentUser(prev => prev ? { ...prev, ...updates } : prev)
  }, [])

  async function handleLogout() {
    await sb.auth.signOut()
    setCurrentUser(null)
    setCurrentGroup(null)
  }

  if (!ready) return null

  return (
    <>
      <Header
        currentUser={currentUser}
        onLoginClick={() => setAuthOpen(true)}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
      />
      <div className="app-container">
        {currentUser ? (
          currentGroup ? (
            <GroupDetail
              currentUser={currentUser}
              group={currentGroup}
              onBack={() => setCurrentGroup(null)}
              onUserUpdate={handleUserUpdate}
            />
          ) : (
            <MainView currentUser={currentUser} onOpenGroup={setCurrentGroup} />
          )
        ) : (
          <div className="guest-banner">
            <p>👋 Split expenses with friends &amp; family.</p>
            <p style={{ marginTop: 8 }}>Log in or sign up to get started.</p>
          </div>
        )}
      </div>
      <footer className="app-footer">
        <a className="bmc-btn" href="https://buymeacoffee.com/" target="_blank" rel="noopener noreferrer">
          ☕ Buy me a coffee
        </a>
      </footer>
      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onSuccess={() => { setAuthOpen(false); initAuth() }}
        />
      )}
    </>
  )
}

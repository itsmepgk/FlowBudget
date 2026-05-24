import { useState } from 'react'
import { sb } from '../lib/supabase'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function AuthModal({ onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [statusOk, setStatusOk] = useState(false)

  function switchTab(t: 'login' | 'signup') { setTab(t); setStatus(''); setStatusOk(false) }

  async function handleLogin() {
    setStatus('')
    if (!email) { setStatus('Please enter your email'); return }
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) { setStatus(error.message); return }
    onSuccess()
  }

  async function handleSignup() {
    setStatus('')
    if (!name) { setStatus('Please enter your name'); return }
    if (!email) { setStatus('Please enter your email'); return }
    if (name.includes('@')) { setStatus('Please use your real name, not an email address'); return }
    if (name.length > 30) { setStatus('Name must be 30 characters or less'); return }
    const { data, error } = await sb.auth.signUp({ email, password })
    if (error) { setStatus(error.message); return }
    if (data.user) {
      await sb.from('users').upsert([{ id: data.user.id, name }], { onConflict: 'id' })
    }
    setStatusOk(true)
    setStatus('Signup successful! Check your email to confirm, then log in.')
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box">
        <button className="close-btn" onClick={onClose}>✕</button>
        <div className="auth-tabs">
          <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => switchTab('login')}>
            Login
          </button>
          <button className={`auth-tab${tab === 'signup' ? ' active' : ''}`} onClick={() => switchTab('signup')}>
            Sign Up
          </button>
        </div>
        {tab === 'signup' && (
          <>
            <label className="field-label">Your name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex" autoComplete="name" />
          </>
        )}
        <label className="field-label">Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com" autoComplete="email" />
        <label className="field-label">Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />
        <button onClick={tab === 'login' ? handleLogin : handleSignup}>
          {tab === 'login' ? 'Login' : 'Sign Up'}
        </button>
        {status && (
          <p className="status-msg" style={statusOk ? { color: '#34d399' } : undefined}>{status}</p>
        )}
      </div>
    </div>
  )
}

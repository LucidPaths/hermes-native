import { useEffect, useState } from 'react'
import PulseOrb from './components/PulseOrb'
import StatusPanel from './components/StatusPanel'
import TaskStream from './components/TaskStream'
import ChatPanel from './components/ChatPanel'
import MemoryTimeline from './components/MemoryTimeline'
import SettingsPanel from './components/SettingsPanel'

const SHORTCUTS: { key: string; desc: string }[] = [
  { key: 'Ctrl+/', desc: 'Show shortcuts' },
  { key: 'Ctrl+N', desc: 'New session' },
  { key: 'Ctrl+F', desc: 'Search' },
  { key: 'Ctrl+K', desc: 'Clear chat' },
  { key: 'Esc', desc: 'Cancel / Close' },
  { key: 'Tab', desc: 'Switch panel' },
]

type Tab = 'chat' | 'tasks' | 'timeline' | 'settings'

interface PulseState {
  last_pulse: string | null
  next_pulse: string | null
  pulse_count: number
  status: string
  current_task: string | null
  tasks_queued: number
  model: string
  provider: string
  mood?: {
    label: string
    murmur: string
    color: string
  }
}

export default function App() {
  const [state, setState] = useState<PulseState | null>(null)
  const [tab, setTab] = useState<Tab>('chat')
  const [dark, setDark] = useState(() => {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch { return true }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/state')
        .then(r => {
          if (!r.ok) throw new Error('non-ok')
          setConnected(true)
          return r.json()
        })
        .then(setState)
        .catch(() => {
          setConnected(false)
        })
    }, 5000)
    fetch('/api/state')
      .then(r => { if (!r.ok) throw new Error('non-ok'); setConnected(true); return r.json() })
      .then(setState)
      .catch(() => setConnected(false))
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setHelpOpen(o => !o)
      }
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const tabs: Tab[] = ['chat', 'tasks', 'timeline', 'settings']
        const idx = tabs.indexOf(tab)
        setTab(tabs[(idx + 1) % tabs.length])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab])

  const moodColor = state?.mood?.color

  const selectTab = (t: Tab) => {
    setTab(t)
    setMenuOpen(false)
  }

  return (
    <div className={"app " + (dark ? 'dark' : 'light')}>
      <header className="topbar">
        <div className="brand">
          <span className="glyph">🜹</span>
          <span className="title">Hermes</span>
          <span className="sub">native</span>
          <span className="ver">v0.15.0</span>
          <span className={`conn-dot ${connected ? 'conn-on' : 'conn-off'}`} title={connected ? 'Online' : 'Offline'}></span>
        </div>
        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="menu">
          <span />
          <span />
          <span />
        </button>
        <nav className="tabs">
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
          <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Tasks</button>
          <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>Timeline</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>⚙</button>
          <button onClick={() => setDark(!dark)}>{dark ? '☀' : '◐'}</button>
        </nav>
      </header>

      {menuOpen && (
        <>
          <div className="drawer-overlay" onClick={() => setMenuOpen(false)} />
          <nav className="drawer">
            <button className={tab === 'chat' ? 'active' : ''} onClick={() => selectTab('chat')}>Chat</button>
            <button className={tab === 'tasks' ? 'active' : ''} onClick={() => selectTab('tasks')}>Tasks</button>
            <button className={tab === 'timeline' ? 'active' : ''} onClick={() => selectTab('timeline')}>Timeline</button>
            <button className={tab === 'settings' ? 'active' : ''} onClick={() => selectTab('settings')}>⚙ Settings</button>
            <button onClick={() => { setDark(!dark); setMenuOpen(false); }}>{dark ? '☀ Light' : '◐ Dark'}</button>
          </nav>
        </>
      )}

      {helpOpen && (
        <div className="help-overlay" onClick={() => setHelpOpen(false)}>
          <div className="help-box" onClick={e => e.stopPropagation()}>
            <h3>Keyboard Shortcuts</h3>
            <table className="help-table">
              <tbody>
                {SHORTCUTS.map(s => (
                  <tr key={s.key}>
                    <td className="help-key">{s.key}</td>
                    <td className="help-desc">{s.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="help-hint">Click outside or press Ctrl+/ to close</div>
          </div>
        </div>
      )}

      <main className="dashboard">
        <section className="left">
          <PulseOrb status={state?.status ?? 'unknown'} moodColor={moodColor} />
          <StatusPanel state={state} />
        </section>
        <section className="right">
          {tab === 'chat' && <ChatPanel />}
          {tab === 'tasks' && <TaskStream />}
          {tab === 'timeline' && <MemoryTimeline />}
          {tab === 'settings' && <SettingsPanel currentModel={state?.model || 'auto'} currentProvider={state?.provider || 'auto'} />}
        </section>
      </main>

      <footer className="pulsebar">
        <div className="pulse-track">
          <div className="pulse-head" style={{ left: `${((state?.pulse_count || 0) % 28) / 28 * 100}%` }} />
        </div>
        <span className="latency">{state?.last_pulse ? new Date(state.last_pulse).toLocaleTimeString() : '——'}</span>
      </footer>
    </div>
  )
}

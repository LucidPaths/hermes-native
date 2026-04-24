import { useEffect, useState } from 'react'
import PulseOrb from './components/PulseOrb'
import StatusPanel from './components/StatusPanel'
import TaskStream from './components/TaskStream'
import ChatPanel from './components/ChatPanel'
import MemoryTimeline from './components/MemoryTimeline'
import SettingsPanel from './components/SettingsPanel'

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
  const [dark, setDark] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/state').then(r => r.json()).then(setState).catch(() => {})
    }, 5000)
    fetch('/api/state').then(r => r.json()).then(setState).catch(() => {})
    return () => clearInterval(interval)
  }, [])

  const moodColor = state?.mood?.color

  return (
    <div className={"app " + (dark ? 'dark' : 'light')}>
      <header className="topbar">
        <div className="brand">
          <span className="glyph">🜹</span>
          <span className="title">Hermes</span>
          <span className="sub">native</span>
          <span className="ver">v0.7.1</span>
        </div>
        <nav className="tabs">
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
          <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Tasks</button>
          <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>Timeline</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>⚙</button>
          <button onClick={() => setDark(!dark)}>{dark ? '☀' : '◐'}</button>
        </nav>
      </header>

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

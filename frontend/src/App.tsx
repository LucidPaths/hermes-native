import { useEffect, useState } from 'react'
import PulseOrb from './components/PulseOrb'
import StatusPanel from './components/StatusPanel'
import TaskStream from './components/TaskStream'

interface PulseState {
  last_pulse: string | null
  next_pulse: string | null
  pulse_count: number
  status: string
  current_task: string | null
  tasks_queued: number
  model: string
  provider: string
}

export default function App() {
  const [state, setState] = useState<PulseState | null>(null)
  const [dark, setDark] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/state').then(r => r.json()).then(setState).catch(() => {})
    }, 5000)
    fetch('/api/state').then(r => r.json()).then(setState).catch(() => {})
    return () => clearInterval(interval)
  }, [])

  return (
    <div className={"app " + (dark ? 'dark' : 'light')}>
      <header className="topbar">
        <div className="brand">
          <span className="glyph">🜹</span>
          <span className="title">Hermes</span>
          <span className="sub">native</span>
        </div>
        <nav>
          <button onClick={() => setDark(!dark)}>{dark ? '☀' : '◐'}</button>
        </nav>
      </header>

      <main className="dashboard">
        <section className="left">
          <PulseOrb status={state?.status ?? 'unknown'} />
          <StatusPanel state={state} />
        </section>
        <section className="right">
          <TaskStream />
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
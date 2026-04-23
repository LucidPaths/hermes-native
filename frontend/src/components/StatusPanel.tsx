interface State {
  last_pulse: string | null
  next_pulse: string | null
  pulse_count: number
  status: string
  current_task: string | null
  tasks_queued: number
  model: string
  provider: string
}

export default function StatusPanel({ state }: { state: State | null }) {
  if (!state) return <div className="panel"><h3>State</h3><p style={{color:'var(--text-faint)',fontSize:12}}>Waiting for daemon...</p></div>

  const items = [
    { k: 'status', v: state.status },
    { k: 'model', v: state.model },
    { k: 'pulses', v: String(state.pulse_count) },
    { k: 'queued', v: String(state.tasks_queued || 0) },
    { k: 'last pulse', v: state.last_pulse ? new Date(state.last_pulse).toLocaleTimeString() : '—' },
    { k: 'provider', v: state.provider },
  ]

  return (
    <div className="panel">
      <h3>
        <span className={`status-dot ${state.status}`} />
        State
      </h3>
      {items.map(({k,v}) => (
        <div className="kv-row" key={k}>
          <span className="kv-key">{k}</span>
          <span className="kv-val">{v}</span>
        </div>
      ))}
    </div>
  )
}

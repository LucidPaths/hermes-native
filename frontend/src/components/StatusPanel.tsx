interface State {
  last_pulse: string | null
  next_pulse: string | null
  pulse_count: number
  status: string
  current_task: string | null
  tasks_queued: number
  model: string
  provider: string
  tokens?: number
  dream_count?: number
  mood?: {
    label: string
    murmur: string
    color?: string
  }
}

export default function StatusPanel({ state }: { state: State | null }) {
  if (!state) return <div className="panel"><h3>State</h3><p style={{color:'var(--text-faint)',fontSize:12}}>Waiting for daemon...</p></div>

  const items = [
    { k: 'status', v: state.status },
    { k: 'model', v: state.model },
    { k: 'pulses', v: String(state.pulse_count) },
    { k: 'queued', v: String(state.tasks_queued || 0) },
    { k: 'tokens', v: String(state.tokens || 0) },
    { k: 'last pulse', v: state.last_pulse ? new Date(state.last_pulse).toLocaleTimeString() : '—' },
    { k: 'dreams', v: String(state.dream_count || 0) },
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
      {state.mood && (
        <div className="mood-block" style={{marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)'}}>
          <div className="kv-row">
            <span className="kv-key">mood</span>
            <span className="kv-val" style={{color: state.mood.color || 'var(--accent)'}}>{state.mood.label}</span>
          </div>
          <p style={{fontSize:11, color:'var(--text-dim)', marginTop:4, fontStyle:'italic', lineHeight:1.4}}>
            {state.mood.murmur}
          </p>
        </div>
      )}
    </div>
  )
}

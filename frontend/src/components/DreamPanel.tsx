/**
 * DreamPanel — browse dream fragments
 * Hermes Native v0.18.0
 */
import { useEffect, useState } from 'react'

interface Dream {
  id: number
  content: string
  mood: string
  created: string
  tokens: number
  triggers: string[]
}

export default function DreamPanel() {
  const [dreams, setDreams] = useState<Dream[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/dreams?limit=50')
      .then(r => r.json())
      .then(data => {
        const items: Dream[] = (data.dreams || []).map((d: any) => ({
          ...d,
          triggers: d.triggers ? JSON.parse(d.triggers) : [],
        }))
        setDreams(items)
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const triggerNow = () => {
    fetch('/api/dreams/trigger', { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        setTimeout(load, 2000) // poll after a few seconds
      })
  }

  const dreamMoodColor = (m: string) => {
    switch (m) {
      case 'hypnagogic': return '#818cf8'
      case 'ruminating': return '#f472b6'
      case 'oneiric': return '#22d3ee'
      default: return '#a855f7'
    }
  }

  return (
    <div className="dream-area">
      <div className="dream-header">
        <h2>✶ Dreams</h2>
        <span className="dream-count">{total} held</span>
        <button className="dream-trigger" onClick={triggerNow} title="Force a dream now">
          ⟳ Dream
        </button>
      </div>

      {loading && dreams.length === 0 && (
        <div className="dream-loading">sifting through latent space...</div>
      )}

      {dreams.length === 0 && !loading && (
        <div className="dream-empty">
          <div className="dream-empty-glyph">✶</div>
          <p>No dreams yet.</p>
          <p className="dream-empty-hint">
            When idle for {15} minutes, Hermes will sample its memories and dream.
            Come back after a nap.
          </p>
          <button className="dream-trigger" onClick={triggerNow}>
            ⟳ Trigger now
          </button>
        </div>
      )}

      <div className="dream-list">
        {dreams.map(d => {
          const open = selectedId === d.id
          return (
            <div
              key={d.id}
              className={`dream-card ${open ? 'open' : ''}`}
              onClick={() => setSelectedId(open ? null : d.id)}
            >
              <div className="dream-meta">
                <span className="dream-badge" style={{ background: dreamMoodColor(d.mood) + '22', color: dreamMoodColor(d.mood), border: `1px solid ${dreamMoodColor(d.mood)}44` }}>
                  {d.mood}
                </span>
                <span className="dream-ts">{new Date(d.created).toLocaleString()}</span>
                <span className="dream-tokens">{d.tokens}t</span>
              </div>
              <div className="dream-content">
                {d.content}
              </div>
              {open && d.triggers && d.triggers.length > 0 && (
                <div className="dream-triggers">
                  <div className="dream-triggers-label">Signal echoes</div>
                  {d.triggers.map((t, i) => (
                    <div key={i} className="dream-trigger-txt">{t}...</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

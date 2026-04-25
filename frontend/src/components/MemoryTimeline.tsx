import { useEffect, useRef, useState } from 'react'

interface TimelineItem {
  type: 'msg' | 'task' | 'pulse' | 'dream'
  t: string
  data: Record<string, any>
}

type FilterType = 'all' | 'msg' | 'task' | 'pulse' | 'dream'

export default function MemoryTimeline() {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [filter, setFilter] = useState<FilterType>('all')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Init: load from REST
  useEffect(() => {
    fetch('/api/timeline?limit=100')
      .then(r => r.json())
      .then((data: TimelineItem[]) => {
        setItems(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Live: SSE subscription
  useEffect(() => {
    const evt = new EventSource('/events')
    const handler = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data)
        if (['chat', 'task', 'pulse', 'dream'].includes(payload.type)) {
          let item: TimelineItem | null = null
          if (payload.type === 'chat') {
            const role = payload.data.role
            const content = payload.data.content
            item = { type: 'msg', t: payload.data.t || new Date().toISOString(), data: { role, content } }
          } else if (payload.type === 'task') {
            item = {
              type: 'task',
              t: payload.data.completed || payload.data.created || new Date().toISOString(),
              data: { key: payload.data.id, desc: payload.data.desc || payload.data.description, status: payload.data.status, result: payload.data.result }
            }
          } else if (payload.type === 'pulse') {
            item = {
              type: 'pulse',
              t: payload.data.created || new Date().toISOString(),
              data: { pulse: payload.data.pulse_num, status: payload.data.status }
            }
          } else if (payload.type === 'dream') {
            item = {
              type: 'dream',
              t: payload.data.created || new Date().toISOString(),
              data: { id: payload.data.id, content: payload.data.content, mood: payload.data.mood }
            }
          }
          if (item) {
            setItems(prev => [item!, ...prev.filter(p => !(p.type === item!.type && p.t === item!.t))].slice(0, 200))
          }
        }
      } catch {}
    }
    evt.addEventListener('message', handler)
    return () => evt.close()
  }, [])

  const filtered = items.filter(item => filter === 'all' || item.type === filter)

  // Group by date
  const groups: Record<string, TimelineItem[]> = {}
  filtered.forEach(item => {
    const date = new Date(item.t).toDateString()
    if (!groups[date]) groups[date] = []
    groups[date].push(item)
  })
  const dates = Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return ts }
  }

  const dateLabel = (d: string) => {
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    if (d === today) return 'Today'
    if (d === yesterday) return 'Yesterday'
    return d
  }

  const renderItem = (item: TimelineItem, i: number) => {
    switch (item.type) {
      case 'msg':
        return (
          <div key={`${item.t}-${i}`} className="tl-item tl-msg">
            <span className="tl-icon">{item.data.role === 'user' ? '◉' : '🜹'}</span>
            <div className="tl-body">
              <span className="tl-role">{item.data.role}</span>
              <span className="tl-content">{item.data.content}</span>
            </div>
            <span className="tl-ts">{formatTime(item.t)}</span>
          </div>
        )
      case 'task':
        return (
          <div key={`${item.t}-${i}`} className={`tl-item tl-task tl-${item.data.status}`}>
            <span className="tl-icon">⚡</span>
            <div className="tl-body">
              <span className="tl-role">task {item.data.key}</span>
              <span className="tl-content">{item.data.desc}</span>
              {item.data.result && <span className="tl-result">{item.data.result}</span>}
            </div>
            <span className="tl-ts">{formatTime(item.t)}</span>
          </div>
        )
      case 'pulse':
        return (
          <div key={`${item.t}-${i}`} className="tl-item tl-pulse">
            <span className="tl-icon">◈</span>
            <div className="tl-body">
              <span className="tl-role">pulse #{item.data.pulse}</span>
              <span className="tl-status">{item.data.status}</span>
            </div>
            <span className="tl-ts">{formatTime(item.t)}</span>
          </div>
        )
      case 'dream':
        return (
          <div key={`${item.t}-${i}`} className="tl-item tl-dream">
            <span className="tl-icon">✶</span>
            <div className="tl-body">
              <span className="tl-role">dream #{item.data.id} <span className="tl-dream-badge">{item.data.mood}</span></span>
              <span className="tl-content">{(item.data.content || '').slice(0, 200)}</span>
            </div>
            <span className="tl-ts">{formatTime(item.t)}</span>
          </div>
        )
    }
  }

  return (
    <div className="timeline-area">
      <h2>
        Timeline
        <span className="tag">{filtered.length}</span>
      </h2>
      <div className="timeline-filters">
        {(['all', 'msg', 'task', 'pulse', 'dream'] as FilterType[]).map(f => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'msg' ? 'Chat' : f === 'task' ? 'Tasks' : f === 'pulse' ? 'Pulses' : 'Dreams'}
          </button>
        ))}
      </div>
      {loading && <div className="tl-loading">loading memory...</div>}
      <div className="timeline">
        {dates.map(date => (
          <div key={date} className="tl-day">
            <div className="tl-day-label">{dateLabel(date)}</div>
            {groups[date].map((item, i) => renderItem(item, i))}
          </div>
        ))}
        {dates.length === 0 && !loading && (
          <div className="tl-empty">Nothing yet. Start chatting or create a task.</div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

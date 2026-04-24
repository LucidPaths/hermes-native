import { useEffect, useState } from 'react'

interface TimelineItem {
  type: 'msg' | 'task' | 'pulse'
  t: string
  data: Record<string, any>
}

export default function MemoryTimeline() {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/timeline?limit=50')
      .then(r => r.json())
      .then((data: TimelineItem[]) => {
        setItems(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return ts }
  }

  const renderItem = (item: TimelineItem, i: number) => {
    switch (item.type) {
      case 'msg':
        return (
          <div key={i} className="tl-item tl-msg">
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
          <div key={i} className={`tl-item tl-task tl-${item.data.status}`}>
            <span className="tl-icon">⚡</span>
            <div className="tl-body">
              <span className="tl-role">task</span>
              <span className="tl-content">{item.data.desc}</span>
              {item.data.result && <span className="tl-result">{item.data.result}</span>}
            </div>
            <span className="tl-ts">{formatTime(item.t)}</span>
          </div>
        )
      case 'pulse':
        return (
          <div key={i} className="tl-item tl-pulse">
            <span className="tl-icon">◈</span>
            <div className="tl-body">
              <span className="tl-role">pulse #{item.data.pulse}</span>
              <span className="tl-status">{item.data.status}</span>
            </div>
            <span className="tl-ts">{formatTime(item.t)}</span>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="timeline-area">
      <h2>Timeline <span className="tag">memory</span></h2>
      {loading && <div className="tl-loading">loading memory...</div>}
      <div className="timeline">
        {items.map((item, i) => renderItem(item, i))}
      </div>
    </div>
  )
}

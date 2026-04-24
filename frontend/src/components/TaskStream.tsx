import { useState, useRef, useEffect } from 'react'

interface Task {
  id: string
  desc: string
  status: string
  created: string
  completed?: string
  result?: string
  error?: string
}

export default function TaskStream() {
  const [taskMap, setTaskMap] = useState<Record<string, Task>>({})
  const [input, setInput] = useState('')
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const wsRef = useRef<EventSource | null>(null)

  // Load DB history on mount
  useEffect(() => {
    fetch('/api/tasks/history?limit=50')
      .then(r => r.json())
      .then((data: Task[]) => {
        if (Array.isArray(data)) {
          const map: Record<string, Task> = {}
          data.forEach(t => { map[t.id] = t })
          setTaskMap(map)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const es = new EventSource('/events')
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'state') {
        const q = msg.data.task_queue || []
        setTaskMap(prev => {
          const next = { ...prev }
          q.forEach((t: Task) => {
            next[t.id] = { ...(next[t.id] || {}), ...t }
          })
          return next
        })
        setLastEvent(new Date().toLocaleTimeString())
      }
      if (msg.type === 'task') {
        setTaskMap(prev => {
          const id = msg.data.id || msg.data.task_key
          if (!id) return prev
          return { ...prev, [id]: { ...(prev[id] || {}), ...msg.data } }
        })
      }
    }
    es.onerror = () => {}
    wsRef.current = es
    return () => es.close()
  }, [])

  const tasks = Object.values(taskMap).sort((a, b) => {
    const ta = a.completed || a.created || ''
    const tb = b.completed || b.created || ''
    return tb.localeCompare(ta)
  })

  const sendTask = async () => {
    if (!input.trim()) return
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: input }),
    })
    setInput('')
  }

  return (
    <div className="task-area">
      <h2>Task Stream {lastEvent && <span style={{fontSize:10, color:'var(--text-faint)', marginLeft:8}}>● {lastEvent}</span>}</h2>
      <div className="task-create">
        <input
          placeholder="What should Hermes do?"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendTask()}
        />
        <button onClick={sendTask}>Enqueue</button>
      </div>
      <div className="task-list">
        {tasks.length === 0 && (
          <p style={{color:'var(--text-faint)', fontSize:13, padding:12}}>
            No tasks yet. Hermes is idle.
          </p>
        )}
        {tasks.map(t => (
          <div className="task-card" key={t.id}>
            <span className="tid">{t.id}</span>
            <span className="tdesc">{t.desc}</span>
            <span className={`tstatus ${t.status}`}>{t.status}</span>
            {t.result && <span className="tresult" title={t.result}>{t.result.slice(0,60)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

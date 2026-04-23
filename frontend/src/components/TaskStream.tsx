import { useState, useRef, useEffect } from 'react'

interface Task {
  id: string
  desc: string
  status: string
  created: string
  result?: string
  error?: string
}

export default function TaskStream() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [input, setInput] = useState('')
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const wsRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource('/events')
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'state') {
        const q = msg.data.task_queue || []
        setTasks(q)
        setLastEvent(new Date().toLocaleTimeString())
      }
      if (msg.type === 'task') {
        setTasks(prev => [...prev, msg.data])
      }
    }
    es.onerror = () => {}
    wsRef.current = es
    return () => es.close()
  }, [])

  const sendTask = async () => {
    if (!input.trim()) return
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: input }),
    })
    setInput('')
  }

  const complete = async (id: string) => {
    await fetch('/api/tasks/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: id }),
    })
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
        {!tasks.length && (
          <p style={{color:'var(--text-faint)', fontSize:13, padding:12}}>
            No tasks queued. Hermes is idle.
          </p>
        )}
        {tasks.map(t => (
          <div className="task-card" key={t.id}>
            <span className="tid">{t.id}</span>
            <span className="tdesc">{t.desc}</span>
            <span className={`tstatus ${t.status}`}>{t.status}</span>
            {t.result && <span className="tresult" title={t.result}>{t.result.slice(0,60)}</span>}
            {t.status !== 'done' && t.status !== 'running' && (
              <button
                style={{background:'none',border:'none',color:'var(--text-faint)',cursor:'pointer',fontSize:11}}
                onClick={() => complete(t.id)}
              >done</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

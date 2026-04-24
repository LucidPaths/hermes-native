import { useState, useRef, useEffect } from 'react'

interface APIMessage {
  id: number
  role: string
  content: string
  created: string
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  ts: string
  id?: number
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'Hermes Native chat — history persists', ts: 'boot' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/chat/history?limit=50')
      .then(r => r.json())
      .then((data: APIMessage[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const loaded: Message[] = data.map(m => ({
            role: m.role as 'user'|'assistant'|'system',
            content: m.content,
            ts: m.created,
            id: m.id,
          }))
          setMessages(prev => {
            const boot = prev.filter(p => p.ts === 'boot')
            return [...boot, ...loaded]
          })
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const send = async () => {
    if (!input.trim() || busy) return
    const userMsg: Message = { role: 'user', content: input.trim(), ts: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setBusy(true)

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content }),
      })
      const data = await resp.json()
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.response || '(no response)',
        ts: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${(e as Error).message}`,
        ts: new Date().toISOString(),
      }])
    } finally {
      setBusy(false)
    }
  }

  const formatTime = (ts: string) => {
    if (ts === 'boot') return ''
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className="chat-area">
      <h2>Chat {loaded && <span className="tag">persisted</span>}</h2>
      <div className="chat-history">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>
            <span className="chat-role">{m.role === 'system' ? '◈' : m.role === 'user' ? '◉' : '🜹'}</span>
            <div className="chat-bubble">
              <span className="chat-body">{m.content}</span>
              <span className="chat-ts">{formatTime(m.ts)}</span>
            </div>
          </div>
        ))}
        {busy && (
          <div className="chat-msg chat-system">
            <span className="chat-role blink">🜹</span>
            <span className="chat-body">thinking...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <input
          placeholder="Say something..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={busy}
        />
        <button onClick={send} disabled={busy}>{busy ? '◐' : '🜹'}</button>
      </div>
    </div>
  )
}

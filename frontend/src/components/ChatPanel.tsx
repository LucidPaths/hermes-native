import { useState, useRef, useEffect } from 'react'
import { marked } from 'marked'

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
  streaming?: boolean
}

interface WSMessage {
  type: 'start' | 'chunk' | 'done' | 'error'
  text: string
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'Hermes Native chat — streaming v0.6.0', ts: 'boot' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamingRef = useRef(false)

  // Load persistent history
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
    if (!input.trim() || busy || streamingRef.current) return
    const userMsg: Message = { role: 'user', content: input.trim(), ts: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setBusy(true)
    streamingRef.current = true

    // Try WebSocket first
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/chat`
    let ws = new WebSocket(wsUrl)
    wsRef.current = ws

    let streamingIndex = -1

    ws.onopen = () => {
      ws.send(JSON.stringify({ message: userMsg.content }))
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        if (msg.type === 'start') {
          const assistantMsg: Message = { role: 'assistant', content: '', ts: new Date().toISOString(), streaming: true }
          setMessages(prev => {
            streamingIndex = prev.length
            return [...prev, assistantMsg]
          })
        } else if (msg.type === 'chunk') {
          setMessages(prev => {
            const updated = [...prev]
            if (streamingIndex >= 0 && updated[streamingIndex]) {
              updated[streamingIndex] = { ...updated[streamingIndex], content: updated[streamingIndex].content + (msg.text ? '\n' + msg.text : '') }
            }
            return updated
          })
        } else if (msg.type === 'done') {
          setMessages(prev => {
            const updated = [...prev]
            if (streamingIndex >= 0 && updated[streamingIndex]) {
              updated[streamingIndex] = { ...updated[streamingIndex], content: msg.text || updated[streamingIndex].content, streaming: false }
            }
            return updated
          })
          ws.close()
          setBusy(false)
          streamingRef.current = false
        } else if (msg.type === 'error') {
          setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg.text}`, ts: new Date().toISOString() }])
          ws.close()
          setBusy(false)
          streamingRef.current = false
        }
      } catch {}
    }

    ws.onerror = () => {
      ws.close()
      fallbackHTTP(userMsg)
    }

    ws.onclose = () => {
      wsRef.current = null
      if (streamingRef.current) {
        streamingRef.current = false
        setBusy(false)
      }
    }
  }

  const fallbackHTTP = async (userMsg: Message) => {
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
      streamingRef.current = false
    }
  }

  const formatTime = (ts: string) => {
    if (ts === 'boot') return ''
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  const clearChat = async () => {
    if (!window.confirm('Clear all chat history?')) return
    try {
      await fetch('/api/chat/clear', { method: 'POST' })
      setMessages([{ role: 'system', content: 'Chat cleared.', ts: new Date().toISOString() }])
    } catch (e) {
      console.error(e)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        wsRef.current?.close()
        setBusy(false)
        streamingRef.current = false
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        clearChat()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="chat-area">
      <h2>
        Chat
        {loaded && <span className="tag">streaming</span>}
        <button className="btn-ghost" onClick={clearChat} title="Clear chat (Ctrl+K)" style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px' }}>Clear</button>
      </h2>
      <div className="chat-history">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>
            <span className="chat-role">{m.role === 'system' ? '◈' : m.role === 'user' ? '◉' : '🜹'}</span>
            <div className="chat-bubble">
              <span className={`chat-body ${m.streaming ? 'streaming' : ''}`} dangerouslySetInnerHTML={{ __html: marked.parse(m.content || '') }} />
              <span className="chat-ts">{formatTime(m.ts)} {m.streaming && <span className="typing">●</span>}</span>
            </div>
          </div>
        ))}
        {busy && !streamingRef.current && (
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

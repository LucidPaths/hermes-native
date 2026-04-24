import { useState, useRef, useEffect } from 'react'
import { marked } from 'marked'

interface APIMessage {
  id: number
  role: string
  content: string
  created: string
  session_id?: string
  tokens?: number
}

interface Session {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface SearchResult {
  id: number
  role: string
  content: string
  created: string
  session_id?: string
  tokens?: number
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  ts: string
  id?: number
  tokens?: number
  streaming?: boolean
}

interface WSMessage {
  type: 'start' | 'chunk' | 'done' | 'error'
  text: string
}

function parseMarkdown(content: string): string {
  try {
    return (marked as any).parseSync(content || '') as string
  } catch {
    try {
      return marked.parse(content || '') as string
    } catch {
      return content || ''
    }
  }
}

function markedCopyable(code: string, infostring?: string) {
  const lang = infostring || 'text'
  const safeCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div class="code-block-wrap"><div class="code-header"><span class="code-lang">${lang}</span><button class="code-copy" onclick="(function(btn){const code=btn.closest('.code-block-wrap').querySelector('code').textContent;navigator.clipboard.writeText(code);btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy'},1500)})(this)">Copy</button></div><pre><code>${safeCode}</code></pre></div>`
}

function setupMarked() {
  try {
    marked.setOptions({ gfm: true, breaks: true })
    marked.use({
      renderer: {
        code(this: any, code: string, infostring: string | undefined, _escaped: boolean) {
          return markedCopyable(code, infostring)
        }
      } as any
    })
  } catch {}
}

setupMarked()

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'Hermes Native chat — v0.11.0', ts: 'boot' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamingRef = useRef(false)

  // Sessions
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  // Search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Load sessions
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => {
        const list: Session[] = data.sessions || []
        setSessions(list)
        setSessionsLoaded(true)
        if (list.length > 0 && !currentSession) {
          setCurrentSession(list[0].id)
        }
      })
      .catch(() => setSessionsLoaded(true))
  }, [])

  // Load messages when session changes (or load all if no session)
  const loadMessages = (sid: string | null) => {
    const url = sid ? `/api/sessions/${sid}` : '/api/chat/history?limit=50'
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const raw: APIMessage[] = sid ? (data.messages || []) : data
        if (Array.isArray(raw) && raw.length > 0) {
          const loaded: Message[] = raw.map(m => ({
            role: m.role as 'user'|'assistant'|'system',
            content: m.content,
            ts: m.created,
            id: m.id,
            tokens: m.tokens,
          }))
          setMessages(prev => {
            const boot = prev.filter(p => p.ts === 'boot')
            return [...boot, ...loaded]
          })
        } else {
          setMessages(prev => prev.filter(p => p.ts === 'boot'))
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }

  useEffect(() => {
    if (currentSession || sessionsLoaded) {
      loadMessages(currentSession)
    }
  }, [currentSession])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const ensureSession = async (): Promise<string | null> => {
    if (currentSession) return currentSession
    const title = input.trim().slice(0, 60) || 'New Session'
    try {
      const resp = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await resp.json()
      if (data.id) {
        setSessions(prev => [data, ...prev])
        setCurrentSession(data.id)
        setMessages(prev => prev.filter(p => p.ts === 'boot'))
        return data.id
      }
    } catch (e) {
      console.error('ensure session', e)
    }
    return null
  }

  const createSession = async () => {
    const title = input.trim() || 'New Session'
    try {
      const resp = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await resp.json()
      if (data.id) {
        setSessions(prev => [data, ...prev])
        setCurrentSession(data.id)
        setInput('')
        setMessages(prev => prev.filter(p => p.ts === 'boot'))
      }
    } catch (e) {
      console.error('create session', e)
    }
  }

  const deleteSession = async (sid: string) => {
    if (!window.confirm('Delete this session and its messages?')) return
    try {
      await fetch(`/api/sessions/${sid}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.id !== sid))
      if (currentSession === sid) {
        const remaining = sessions.filter(s => s.id !== sid)
        setCurrentSession(remaining.length > 0 ? remaining[0].id : null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const renameSession = async (sid: string, title: string) => {
    try {
      await fetch(`/api/sessions/${sid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, title } : s))
    } catch (e) {
      console.error(e)
    }
  }

  const deleteMessage = async (msgId: number | undefined) => {
    if (!msgId) return
    if (!window.confirm('Delete this message?')) return
    try {
      await fetch(`/api/messages/${msgId}`, { method: 'DELETE' })
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch (e) {
      console.error('delete msg', e)
    }
  }

  // Search
  useEffect(() => {
    if (!searchOpen) return
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=30`)
        .then(r => r.json())
        .then(data => setSearchResults(data.results || []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, searchOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        wsRef.current?.close()
        setBusy(false)
        streamingRef.current = false
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        clearChat()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        createSession()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [input])

  const send = async () => {
    if (!input.trim() || busy || streamingRef.current) return

    // Auto-create session if none selected
    const activeSession = await ensureSession()
    if (!activeSession) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: could not create session', ts: new Date().toISOString() }])
      return
    }

    const userMsg: Message = { role: 'user', content: input.trim(), ts: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setBusy(true)
    streamingRef.current = true

    // Update session title from first message if still 'Untitled' or default
    const s = sessions.find(s => s.id === activeSession)
    if (s && (s.title === 'Untitled' || s.title === 'New Session')) {
      const autoTitle = userMsg.content.slice(0, 40)
      renameSession(activeSession, autoTitle || 'Session')
    }

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/chat`
    let ws = new WebSocket(wsUrl)
    wsRef.current = ws

    let streamingIndex = -1

    ws.onopen = () => {
      ws.send(JSON.stringify({ message: userMsg.content, session_id: activeSession }))
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
      fallbackHTTP(userMsg, activeSession)
    }

    ws.onclose = () => {
      wsRef.current = null
      if (streamingRef.current) {
        streamingRef.current = false
        setBusy(false)
      }
    }
  }

  const fallbackHTTP = async (userMsg: Message, sid: string | null) => {
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content, session_id: sid }),
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

  const jumpToSearchResult = (r: SearchResult) => {
    if (r.session_id) {
      setCurrentSession(r.session_id)
    }
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
  }

  return (
    <div className="chat-wrap">
      {searchOpen && (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="search-box" onClick={e => e.stopPropagation()}>
            <input
              ref={searchInputRef}
              placeholder="Search messages..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <div className="search-results">
              {searchResults.length === 0 && searchQuery && <div className="search-empty">No results</div>}
              {searchResults.map(r => (
                <div key={r.id} className="search-result" onClick={() => jumpToSearchResult(r)} title="Jump to session">
                  <span className="sr-role">{r.role === 'user' ? '◉' : '🜹'}</span>
                  <span className="sr-content">{r.content.slice(0, 120)}</span>
                  <span className="sr-ts">{new Date(r.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
            <div className="search-hint">ESC to close · Click result to jump · Ctrl+N new session</div>
          </div>
        </div>
      )}

      <aside className="chat-sidebar">
        <div className="cs-header">
          <span className="cs-title">Sessions</span>
          <button className="cs-new" onClick={createSession} title="New session (Ctrl+N)">+</button>
        </div>
        <div className="cs-list">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`cs-item ${currentSession === s.id ? 'active' : ''}`}
              onClick={() => setCurrentSession(s.id)}
            >
              <div className="cs-title-text">{s.title}</div>
              <div className="cs-meta">{new Date(s.updated_at).toLocaleDateString()}</div>
              <button className="cs-del" onClick={e => { e.stopPropagation(); deleteSession(s.id); }} title="Delete">×</button>
            </div>
          ))}
          {sessions.length === 0 && <div className="cs-empty">No sessions yet</div>}
        </div>
        <button className="cs-search-btn" onClick={() => setSearchOpen(true)}>🔍 Search (Ctrl+F)</button>
      </aside>

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
                <span className={`chat-body ${m.streaming ? 'streaming' : ''}`} dangerouslySetInnerHTML={{ __html: parseMarkdown(m.content || '') }} />
                <span className="chat-ts">
                  {formatTime(m.ts)} {m.streaming && <span className="typing">●</span>}
                  {m.tokens !== undefined && m.tokens > 0 && <span className="token-badge">{m.tokens}t</span>}
                  {m.id && m.role !== 'system' && (
                    <button className="msg-del" onClick={() => deleteMessage(m.id)} title="Delete message">×</button>
                  )}
                </span>
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
            placeholder={currentSession ? 'Say something...' : 'Start a new session...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={busy}
          />
          <button onClick={send} disabled={busy}>{busy ? '◐' : '🜹'}</button>
        </div>
      </div>
    </div>
  )
}

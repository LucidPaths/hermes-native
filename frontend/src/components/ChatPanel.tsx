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
  message_count?: number
  token_count?: number
}

interface SearchResult {
  id: number
  role: string
  content: string
  created: string
  session_id?: string
  tokens?: number
  session_title?: string
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

const DRAFT_KEY = 'hermes-native:drafts'

function getDraft(sid: string | null): string {
  if (!sid) return ''
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return ''
    const map = JSON.parse(raw)
    return map[sid] || ''
  } catch { return '' }
}

function setDraft(sid: string | null, text: string) {
  if (!sid) return
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[sid] = text
    localStorage.setItem(DRAFT_KEY, JSON.stringify(map))
  } catch {}
}


export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'Hermes Native chat — v0.17.0', ts: 'boot' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamingRef = useRef(false)

  // Sessions
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(() => {
    try { return localStorage.getItem('selectedSession'); } catch { return null; }
  })
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  useEffect(() => {
    if (currentSession) {
      try { localStorage.setItem('selectedSession', currentSession); } catch {}
    }
  }, [currentSession])

  // Search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [editingSession, setEditingSession] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
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

  // Draft persistence: save draft when input changes; restore on session switch
  useEffect(() => {
    setDraft(currentSession, input)
  }, [input, currentSession])

  useEffect(() => {
    if (currentSession) {
      const saved = getDraft(currentSession)
      setInput(saved)
    }
  }, [currentSession])

  // Message inline editing
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null)
  const [editMsgContent, setEditMsgContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const startEditMessage = (msg: Message) => {
    if (msg.role !== 'user' || !msg.id) return
    setEditingMsgId(msg.id)
    setEditMsgContent(msg.content)
  }

  const saveEditMessage = async (msgId: number) => {
    try {
      const resp = await fetch(`/api/messages/${msgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editMsgContent }),
      })
      const data = await resp.json()
      if (data.ok) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: editMsgContent } : m))
      }
    } catch (e) {
      console.error('edit msg', e)
    } finally {
      setEditingMsgId(null)
      setEditMsgContent('')
    }
  }

  // Auto-resize textarea helper
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  useEffect(() => {
    autoResize(textareaRef.current)
  }, [input])

  useEffect(() => {
    if (editingMsgId !== null) {
      const el = document.querySelector('.msg-edit-area') as HTMLTextAreaElement
      if (el) autoResize(el)
    }
  }, [editMsgContent, editingMsgId])

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

  const triggerSmartTitle = (sid: string) => {
    // Only trigger if session title is still auto-generated
    const s = sessions.find(s => s.id === sid)
    if (!s || (s.title !== 'Untitled' && s.title !== 'New Session' && s.title !== '')) return
    fetch(`/api/sessions/${sid}/smart-title`, { method: 'POST' })
      .then(r => r.json())
      .then((data: any) => {
        if (data.ok && data.title) {
          setSessions(prev => prev.map(s => s.id === sid ? { ...s, title: data.title } : s))
        }
      })
      .catch(() => {})
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

  const copyMessage = async (content: string | undefined) => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
    } catch (e) {
      console.error('copy msg', e)
    }
  }

  const regenerateMessage = async (msgId: number | undefined) => {
    if (!msgId) return
    if (!window.confirm('Regenerate this response?')) return
    try {
      const resp = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msgId }),
      })
      const data = await resp.json()
      if (data.ok && data.response) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: data.response } : m))
      }
    } catch (e) {
      console.error('regenerate msg', e)
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

  const send = async (contentOverride?: string) => {
    const text = (contentOverride ?? input).trim()
    if (!text || busy || streamingRef.current) return

    // Auto-create session if none selected
    const activeSession = await ensureSession()
    if (!activeSession) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: could not create session', ts: new Date().toISOString() }])
      return
    }

    // If this is a re-send (contentOverride), don't add another user bubble
    if (!contentOverride) {
      const userMsg: Message = { role: 'user', content: text, ts: new Date().toISOString() }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      setDraft(activeSession, '')
    }
    setBusy(true)
    streamingRef.current = true

    // Update session title from first message if still 'Untitled' or default
    const s = sessions.find(s => s.id === activeSession)
    if (s && (s.title === 'Untitled' || s.title === 'New Session')) {
      const autoTitle = text.slice(0, 40)
      renameSession(activeSession, autoTitle || 'Session')
    }

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/chat`
    let ws = new WebSocket(wsUrl)
    wsRef.current = ws

    let streamingIndex = -1

    ws.onopen = () => {
      ws.send(JSON.stringify({ message: text, session_id: activeSession }))
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        if (msg.type === 'start') {
          // When re-sending (overriding), replace existing assistant msg if present at end
          if (contentOverride && messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { ...updated[updated.length - 1], content: '', streaming: true, ts: new Date().toISOString() }
              streamingIndex = updated.length - 1
              return updated
            })
          } else {
            const assistantMsg: Message = { role: 'assistant', content: '', ts: new Date().toISOString(), streaming: true }
            setMessages(prev => {
              streamingIndex = prev.length
              return [...prev, assistantMsg]
            })
          }
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
          // trigger smart title generation after first meaningful exchange
          const userMsgs = messages.filter(m => m.role === 'user').length
          if (activeSession && userMsgs <= 1) {
            triggerSmartTitle(activeSession)
          }
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
      fallbackHTTP({ content: text, ts: new Date().toISOString(), role: 'user' }, activeSession)
    }

    ws.onclose = () => {
      wsRef.current = null
      if (streamingRef.current) {
        streamingRef.current = false
        setBusy(false)
      }
    }
  }

  const stopStreaming = () => {
    wsRef.current?.close()
    wsRef.current = null
    streamingRef.current = false
    setBusy(false)
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

  const exportSession = async () => {
    if (!currentSession) return
    try {
      const resp = await fetch(`/api/export/chat?session_id=${encodeURIComponent(currentSession)}`)
      const data = await resp.json()
      if (data.ok) {
        setMessages(prev => [...prev, { role: 'system', content: `Session exported to ${data.path}`, ts: new Date().toISOString() }])
      }
    } catch (e) {
      console.error('export session', e)
    }
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
                  <span className="sr-content">
                    {r.content.slice(0, 120)}
                    {r.session_title && 
                      <span className="sr-session">in “{r.session_title}”</span>
                    }
                  </span>
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
              {editingSession === s.id ? (
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { renameSession(s.id, editTitle); setEditingSession(null); }
                    if (e.key === 'Escape') { setEditingSession(null); }
                  }}
                  onBlur={() => { renameSession(s.id, editTitle); setEditingSession(null); }}
                  autoFocus
                  className="cs-edit-input"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <div
                    className="cs-title-text"
                    onDoubleClick={e => { e.stopPropagation(); setEditingSession(s.id); setEditTitle(s.title); }}
                  >
                    {s.title}
                  </div>
                  <div className="cs-meta">
                    <span>{new Date(s.updated_at).toLocaleDateString()}</span>
                    <span className="cs-counts">{s.message_count ?? 0} msgs · {(s.token_count ?? 0).toLocaleString()}t</span>
                  </div>
                </>
              )}
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
          {currentSession && <button className="btn-ghost" onClick={exportSession} title="Export this session" style={{ marginLeft: 4, fontSize: 10, padding: '2px 6px' }}>Export</button>}
        </h2>
        <div className="chat-history">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-${m.role}`}>
              <span className="chat-role">{m.role === 'system' ? '◈' : m.role === 'user' ? '◉' : '🜹'}</span>
              <div className="chat-bubble">
                {editingMsgId === m.id ? (
                  <div className="msg-edit-wrap">
                    <textarea
                      className="msg-edit-area"
                      rows={3}
                      value={editMsgContent}
                      onChange={e => setEditMsgContent(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); saveEditMessage(m.id!) }
                        if (e.key === 'Escape') { setEditingMsgId(null); setEditMsgContent('') }
                      }}
                      style={{ resize: 'none', overflow: 'hidden' }}
                    />
                    <div className="msg-edit-actions">
                      <button className="msg-edit-btn" onClick={() => saveEditMessage(m.id!)}>Save</button>
                      <button className="msg-edit-btn cancel" onClick={() => { setEditingMsgId(null); setEditMsgContent('') }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <span className={`chat-body ${m.streaming ? 'streaming' : ''}`} dangerouslySetInnerHTML={{ __html: parseMarkdown(m.content || '') }} />
                )}
                <span className="chat-ts">
                  {formatTime(m.ts)} {m.streaming && <span className="typing">●</span>}
                  {m.tokens !== undefined && m.tokens > 0 && <span className="token-badge">{m.tokens}t</span>}
                  {m.id && m.role !== 'system' && editingMsgId !== m.id && (
                    <>
                      <button className="msg-act" onClick={() => copyMessage(m.content)} title="Copy message">📋</button>
                      {m.role === 'assistant' && <button className="msg-act" onClick={() => regenerateMessage(m.id)} title="Regenerate">↻</button>}
                      {m.role === 'user' && <button className="msg-act" onClick={() => startEditMessage(m)} title="Edit">✎</button>}
                      <button className="msg-act msg-del" onClick={() => deleteMessage(m.id)} title="Delete message">×</button>
                    </>
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
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={currentSession ? 'Say something...' : 'Start a new session...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            disabled={busy}
            style={{ resize: 'none', overflow: 'hidden' }}
          />
          {busy ? (
            <button onClick={stopStreaming} title="Stop">×</button>
          ) : (
            <button onClick={() => send()} disabled={busy}>{'🜹'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

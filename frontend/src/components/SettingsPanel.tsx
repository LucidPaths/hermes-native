import { useState } from 'react'

const MODELS = [
  'auto',
  'kimi-k2.6',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
  'openai/gpt-4o',
  'google/gemini-2.5-pro',
  'xai/grok-3',
]

const PROVIDERS = [
  'auto',
  'kimi-coding',
  'anthropic',
  'openai',
  'gemini',
  'xai',
  'ollama-cloud',
  'openrouter',
]

export default function SettingsPanel({
  currentModel,
  currentProvider,
}: {
  currentModel: string
  currentProvider: string
}) {
  const [model, setModel] = useState(currentModel)
  const [provider, setProvider] = useState(currentProvider)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportPath, setExportPath] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await fetch('/api/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, provider }),
      })
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
      setTimeout(() => setSaved(true), 0)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const exportChat = async () => {
    setExporting(true)
    try {
      const r = await fetch('/api/export/chat')
      const data = await r.json()
      if (data.ok) setExportPath(data.path)
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="settings-area">
      <h2>Settings</h2>
      <div className="settings-group">
        <label>Model</label>
        <select value={model} onChange={e => setModel(e.target.value)}>
          {MODELS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="settings-group">
        <label>Provider</label>
        <select value={provider} onChange={e => setProvider(e.target.value)}>
          {PROVIDERS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <button className="btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Apply'}
      </button>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

      <h3 style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)', marginBottom: 12 }}>Export</h3>
      <button className="btn-secondary" onClick={exportChat} disabled={exporting}>
        {exporting ? 'Exporting...' : 'Export Chat to Markdown'}
      </button>
      {exportPath && (
        <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
          Saved: {exportPath}
        </p>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

      <h3 style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)', marginBottom: 12 }}>Stats</h3>
      <div className="kv-row">
        <span className="kv-key">db</span>
        <span className="kv-val" style={{ fontSize: 11 }}>~/.hermes-native/state/memory.db</span>
      </div>
      <div className="kv-row">
        <span className="kv-key">version</span>
        <span className="kv-val" id="settings-version">v0.6.2</span>
      </div>
    </div>
  )
}

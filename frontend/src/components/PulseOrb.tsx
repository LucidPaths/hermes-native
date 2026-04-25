interface OrbProps {
  status: string
  moodColor?: string
}

export default function PulseOrb({ status, moodColor }: OrbProps) {
  const accent = moodColor || 'var(--accent)'
  const dreaming = status === 'dreaming'
  return (
    <div className="orb-wrap">
      <div className={`orb ${dreaming ? 'orb-dreaming' : ''}`} style={{ background: dreaming ? 'conic-gradient(from 0deg, #a855f7, var(--void), #22d3ee)' : `conic-gradient(from 0deg, ${accent}, var(--void), ${accent})` }}>
        <div
          className={`orb-core status-${status}`}
          style={{
            background: dreaming
              ? 'radial-gradient(circle at 35% 35%, #a855f7, #22d3ee)'
              : `radial-gradient(circle at 35% 35%, ${accent}, var(--void))`,
            boxShadow: dreaming
              ? '0 0 40px #a855f744, inset 0 0 20px #22d3ee55'
              : `0 0 40px ${accent}44, inset 0 0 20px ${accent}55`
          }}
        />
      </div>
      <span className="orb-label">{status}</span>
    </div>
  )
}

interface OrbProps {
  status: string
  moodColor?: string
}

export default function PulseOrb({ status, moodColor }: OrbProps) {
  const accent = moodColor || 'var(--accent)'
  return (
    <div className="orb-wrap">
      <div className="orb" style={{ background: `conic-gradient(from 0deg, ${accent}, var(--void), ${accent})` }}>
        <div
          className={`orb-core status-${status}`}
          style={{
            background: `radial-gradient(circle at 35% 35%, ${accent}, var(--void))`,
            boxShadow: `0 0 40px ${accent}44, inset 0 0 20px ${accent}55`
          }}
        />
      </div>
      <span className="orb-label">{status}</span>
    </div>
  )
}

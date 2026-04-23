interface OrbProps {
  status: string
}

export default function PulseOrb({ status }: OrbProps) {
  return (
    <div className="orb-wrap">
      <div className="orb">
        <div className={`orb-core status-${status}`} />
      </div>
      <span className="orb-label">{status}</span>
    </div>
  )
}

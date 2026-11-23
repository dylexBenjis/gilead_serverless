import Image from 'next/image'

export function GileadMark({ size =56 }: { size?: number }) {
  return (
    <Image
      src="/gilead-logo.png"
      alt="Gilead Healthcare Services"
      width={size}
      height={size}
      className="block object-contain"
      priority
    />
  )
}

export function GileadLogo({ size = 140, light = false }: { size?: number; light?: boolean }) {
  const ink = light ? '#ffffff' : '#1a3040'
  const accent = light ? 'rgba(255,255,255,0.65)' : '#2a9d8f'
  const rule = light ? 'rgba(255,255,255,0.4)' : '#2a9d8f'

  return (
    <div className="flex flex-col items-center" style={{ gap: size * 0.08 }}>
      <Image
        src="/gilead-logo.png"
        alt="Gilead Healthcare Services"
        width={size}
        height={size}
        className="block object-contain"
        priority
      />
      <div className="flex flex-col items-center gap-[5px]">
        <span
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            color: ink,
            fontSize: size * 0.19,
            fontWeight: 700,
            letterSpacing: '0.2em',
            lineHeight: 1,
          }}
        >
          GILEAD
        </span>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 16, height: 1, background: rule }} />
          <span
            className="uppercase"
            style={{
              color: accent,
              fontSize: size * 0.07,
              fontWeight: 600,
              letterSpacing: '0.14em',
            }}
          >
            Healthcare Services
          </span>
          <div style={{ width: 16, height: 1, background: rule }} />
        </div>
      </div>
    </div>
  )
}


export function GileadLogo_horizontal({ size = 140, light = false }: { size?: number; light?: boolean }) {
  const ink = light ? '#ffffff' : '#1a3040'
  const accent = light ? 'rgba(255,255,255,0.65)' : '#2a9d8f'
  const rule = light ? 'rgba(255,255,255,0.4)' : '#2a9d8f'

  return (
    <div className="flex flex-row items-center" style={{ gap: size * 0.08 }}>
      <Image
        src="/gilead-logo.png"
        alt="Gilead Healthcare Services"
        width={size}
        height={size}
        className="block object-contain"
        priority
      />
      <div className="flex flex-col items-center gap-[5px]">
        <span
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            color: ink,
            fontSize: size * 0.3,
            fontWeight: 700,
            letterSpacing: '0.2em',
            lineHeight: 1,
          }}
        >
          GILEAD
        </span>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 5, height: 1, background: rule }} />
          <span
            className="uppercase"
            style={{
              color: accent,
              fontSize: size * 0.15,
              fontWeight: 600,
              letterSpacing: '0.14em',
            }}
          >
            Healthcare Services
          </span>
          <div style={{ width: 5, height: 1, background: rule }} />
        </div>
      </div>
    </div>
  )
}

'use client'

interface AvatarProps {
  url: string | null | undefined
  name: string | null | undefined
  size?: number
}

export default function Avatar({ url, name, size = 32 }: AvatarProps) {
  const initials = (name ?? '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        border: '1px solid rgba(34,197,94,0.25)',
        background: url ? 'transparent' : 'rgba(34,197,94,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {url ? (
        <img
          src={url}
          alt={name ?? 'Avatar'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span
          style={{
            fontSize: size * 0.35,
            fontWeight: 700,
            color: 'var(--green)',
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {initials}
        </span>
      )}
    </div>
  )
}

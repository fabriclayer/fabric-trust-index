'use client'

import { useState } from 'react'

interface ServiceLogoProps {
  logoUrl?: string | null
  githubRepo?: string
  domain?: string
  name: string
  size?: number
  className?: string
}

// Deterministic color from name — gives each service a unique but consistent color
function nameToColor(name: string): { bg: string; text: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = [
    { bg: '#EEF2FF', text: '#4338CA' }, // indigo
    { bg: '#F0FDF4', text: '#166534' }, // green
    { bg: '#FFF7ED', text: '#C2410C' }, // orange
    { bg: '#FDF2F8', text: '#BE185D' }, // pink
    { bg: '#F0F9FF', text: '#0369A1' }, // sky
    { bg: '#FEF3C7', text: '#B45309' }, // amber
    { bg: '#F5F3FF', text: '#7C3AED' }, // violet
    { bg: '#ECFDF5', text: '#047857' }, // emerald
    { bg: '#FFF1F2', text: '#BE123C' }, // rose
    { bg: '#E0F2FE', text: '#0C4A6E' }, // light blue
    { bg: '#FAF5FF', text: '#7E22CE' }, // purple
    { bg: '#FEF9C3', text: '#854D0E' }, // yellow
  ]
  return colors[Math.abs(hash) % colors.length]
}

export default function ServiceLogo({ logoUrl, githubRepo, domain, name, size = 40, className = '' }: ServiceLogoProps) {
  const [failedLogo, setFailedLogo] = useState(false)
  const [failedGithub, setFailedGithub] = useState(false)
  const [failedDomain, setFailedDomain] = useState(false)

  const borderRadius = Math.round(size * 0.25)

  // 1. Curated logo URL (highest priority)
  if (logoUrl && !failedLogo) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        width={size}
        height={size}
        className={`flex-shrink-0 bg-white border border-fabric-200 object-contain ${className}`}
        style={{ borderRadius, padding: size > 40 ? 4 : 2 }}
        onError={() => setFailedLogo(true)}
      />
    )
  }

  // 2. GitHub org/user avatar
  if (githubRepo && !failedGithub) {
    const owner = githubRepo.split('/')[0]
    return (
      <img
        src={`https://github.com/${owner}.png?size=${Math.max(size * 2, 128)}`}
        alt={`${name} logo`}
        width={size}
        height={size}
        className={`flex-shrink-0 bg-white border border-fabric-200 object-cover ${className}`}
        style={{ borderRadius }}
        onError={() => setFailedGithub(true)}
      />
    )
  }

  // 3. Domain favicon via unavatar
  if (domain && !failedDomain) {
    return (
      <img
        src={`https://unavatar.io/${domain}?fallback=false`}
        alt={`${name} logo`}
        width={size}
        height={size}
        className={`flex-shrink-0 bg-white border border-fabric-200 object-contain ${className}`}
        style={{ borderRadius, padding: size > 40 ? 4 : 2 }}
        onError={() => setFailedDomain(true)}
      />
    )
  }

  // 4. Colored letter fallback
  const { bg, text } = nameToColor(name)
  const initial = name.replace(/^@/, '').charAt(0).toUpperCase()
  return (
    <div
      className={`flex items-center justify-center font-semibold font-sans flex-shrink-0 border ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius,
        fontSize: size * 0.38,
        backgroundColor: bg,
        color: text,
        borderColor: text + '20',
        letterSpacing: '0.02em',
      }}
    >
      {initial}
    </div>
  )
}

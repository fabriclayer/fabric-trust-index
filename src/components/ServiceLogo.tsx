'use client'

import { useState } from 'react'

interface ServiceLogoProps {
  domain?: string
  githubRepo?: string
  name: string
  size?: number
  className?: string
}

export default function ServiceLogo({ domain, githubRepo, name, size = 40, className = '' }: ServiceLogoProps) {
  const [failedDomain, setFailedDomain] = useState(false)
  const [failedGithub, setFailedGithub] = useState(false)

  const borderRadius = Math.round(size * 0.25)

  // Try domain favicon first
  if (domain && !failedDomain) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
        alt={`${name} logo`}
        width={size}
        height={size}
        className={`flex-shrink-0 bg-fabric-100 border border-fabric-200 object-contain ${className}`}
        style={{ borderRadius }}
        onError={() => setFailedDomain(true)}
      />
    )
  }

  // Fallback: GitHub org/user avatar
  if (githubRepo && !failedGithub) {
    const owner = githubRepo.split('/')[0]
    return (
      <img
        src={`https://github.com/${owner}.png?size=${size * 2}`}
        alt={`${name} logo`}
        width={size}
        height={size}
        className={`flex-shrink-0 bg-fabric-100 border border-fabric-200 object-cover ${className}`}
        style={{ borderRadius }}
        onError={() => setFailedGithub(true)}
      />
    )
  }

  // Final fallback: first letter
  return (
    <div
      className={`bg-fabric-100 border border-fabric-200 flex items-center justify-center font-semibold text-fabric-500 font-sans uppercase flex-shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius, fontSize: size * 0.4 }}
    >
      {name.charAt(0)}
    </div>
  )
}

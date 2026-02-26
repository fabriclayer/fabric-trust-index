'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export interface Incident {
  id: string
  service_id: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string | null
  score_at_time: number | null
  created_at: string
  service?: {
    name: string
    slug: string
    status: string
  }
}

// Severity dot colors
const DOT_COLORS: Record<string, string> = {
  critical: '#d03a3d',
  warning: '#f7931e',
  info: '#a0a09c',
}

// Badge color schemes
type BadgeColor = 'red' | 'amber' | 'green' | 'gray'

const BADGE_STYLES: Record<BadgeColor, string> = {
  red: 'bg-[#fef2f2] text-[#b91c1c]',
  amber: 'bg-[#fffbeb] text-[#b45309]',
  green: 'bg-[#f0fdf4] text-[#15803d]',
  gray: 'bg-fabric-100 text-fabric-600',
}

function getBadge(type: string, description: string | null): { label: string; color: BadgeColor } {
  switch (type) {
    case 'initial_index':
      return { label: 'INDEXED', color: 'gray' }
    case 'cve_found':
      return { label: 'CVE FOUND', color: 'red' }
    case 'high_cve_found':
      return { label: 'HIGH CVE', color: 'red' }
    case 'cve_patched':
      return { label: 'CVE PATCHED', color: 'green' }
    case 'score_change': {
      const isDown = description?.toLowerCase().includes('decreased')
      return isDown
        ? { label: 'SCORE DROP', color: 'amber' }
        : { label: 'SCORE UP', color: 'green' }
    }
    case 'uptime_drop':
      return { label: 'DOWNTIME', color: 'amber' }
    case 'uptime_restored':
      return { label: 'RESTORED', color: 'green' }
    case 'version_release':
      return { label: 'NEW VERSION', color: 'green' }
    case 'status_change': {
      const isDown = description?.toLowerCase().includes('downgraded')
      return isDown
        ? { label: 'STATUS CHANGE', color: 'red' }
        : { label: 'STATUS CHANGE', color: 'green' }
    }
    case 'abandoned':
      return { label: 'ABANDONED', color: 'red' }
    case 'npm_deprecated':
      return { label: 'DEPRECATED', color: 'red' }
    case 'npm_owner_changed':
      return { label: 'OWNER CHANGED', color: 'amber' }
    case 'pypi_yanked':
      return { label: 'YANKED', color: 'red' }
    case 'repo_archived':
      return { label: 'ARCHIVED', color: 'red' }
    case 'repo_transferred':
      return { label: 'TRANSFERRED', color: 'amber' }
    case 'smithery_scan_failed':
      return { label: 'SCAN FAILED', color: 'amber' }
    case 'supply_chain_cve':
      return { label: 'SUPPLY CHAIN', color: 'amber' }
    case 'license_removed':
      return { label: 'LICENSE REMOVED', color: 'amber' }
    case 'security_md_added':
      return { label: 'SECURITY.MD', color: 'green' }
    default:
      return { label: type.replace(/_/g, ' ').toUpperCase(), color: 'gray' }
  }
}

// Left border classes per severity
const SEVERITY_BORDER: Record<string, string> = {
  critical: '',
  warning: '',
  info: '',
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

export default function AlertsFeed({
  incidents,
  open,
  onClose,
}: {
  incidents: Incident[]
  open: boolean
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  const PAGE_SIZE = 50
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const [severityFilter, setSeverityFilter] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset display count and filter when sidebar opens
  useEffect(() => {
    if (open) {
      setDisplayCount(PAGE_SIZE)
      setSeverityFilter(null)
    }
  }, [open])

  // Filter out initial_index log events — they're not real alerts
  const alertIncidents = incidents.filter(i => i.type !== 'initial_index')

  const filtered = severityFilter
    ? alertIncidents.filter(i => i.severity === severityFilter)
    : alertIncidents

  const displayed = filtered.slice(0, displayCount)
  const hasMore = displayCount < filtered.length

  const criticalCount = alertIncidents.filter(i => i.severity === 'critical').length
  const warningCount = alertIncidents.filter(i => i.severity === 'warning').length

  const toggleFilter = (severity: string) => {
    setSeverityFilter(prev => prev === severity ? null : severity)
    setDisplayCount(PAGE_SIZE)
  }

  return (
    <>
      {/* Pulse animation for critical dots */}
      <style jsx global>{`
        @keyframes alertPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.4); }
        }
        .alert-dot-critical {
          animation: alertPulse 2s ease-in-out infinite;
        }
      `}</style>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/10 z-[100] md:hidden" onClick={onClose} />
      )}

      {/* Sidebar panel */}
      <div
        ref={panelRef}
        aria-label="Alerts"
        className={`fixed top-14 right-0 bottom-0 w-[360px] max-w-[90vw] bg-white border-l border-fabric-200 z-[100] transform transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'} overflow-hidden flex flex-col`}
      >
        {/* Header — height matches toolbar so bottom borders align */}
        <div className="flex items-center justify-between px-4 border-b border-fabric-200 min-h-[58.5px]">
          <div className="flex items-center gap-2">
            <h2 className="font-sans text-[0.92rem] font-semibold text-black tracking-tight">Alerts</h2>
            {criticalCount > 0 && (
              <button
                onClick={() => toggleFilter('critical')}
                className={`font-mono text-[0.6rem] bg-red/10 text-red px-1.5 py-0.5 rounded-full cursor-pointer transition-opacity ${severityFilter && severityFilter !== 'critical' ? 'opacity-40' : ''} ${severityFilter === 'critical' ? 'ring-1 ring-red/30' : ''}`}
              >
                {criticalCount} critical
              </button>
            )}
            {warningCount > 0 && (
              <button
                onClick={() => toggleFilter('warning')}
                className={`font-mono text-[0.6rem] bg-orange/10 text-orange px-1.5 py-0.5 rounded-full cursor-pointer transition-opacity ${severityFilter && severityFilter !== 'warning' ? 'opacity-40' : ''} ${severityFilter === 'warning' ? 'ring-1 ring-orange/30' : ''}`}
              >
                {warningCount} warning
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-fabric-400 hover:text-fabric-700 hover:bg-fabric-50 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" /><path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Incident list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {alertIncidents.length === 0 ? (
            <div className="text-center py-12 px-4">
              <svg className="mx-auto text-fabric-300 mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <p className="font-mono text-[0.72rem] text-fabric-400">No recent trust alerts</p>
            </div>
          ) : (
            <>
            <div className="divide-y divide-fabric-100">
              {displayed.map(incident => {
                const dotColor = DOT_COLORS[incident.severity] ?? DOT_COLORS.info
                const badge = getBadge(incident.type, incident.description)
                const borderClass = SEVERITY_BORDER[incident.severity] ?? ''

                return (
                  <div key={incident.id} className={`px-4 py-3 hover:bg-fabric-50/50 transition-colors ${borderClass}`}>
                    <div className="flex items-start gap-2.5">
                      {/* Severity dot */}
                      <div className="flex-shrink-0 mt-1.5">
                        <span
                          className={`block w-[7px] h-[7px] rounded-full ${incident.severity === 'critical' ? 'alert-dot-critical' : ''}`}
                          style={{ backgroundColor: dotColor }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Service name + time */}
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          {incident.service ? (
                            <Link
                              href={`/${incident.service.slug}`}
                              className="font-sans text-[0.78rem] font-semibold text-fabric-800 hover:text-blue truncate transition-colors"
                            >
                              {incident.service.name}
                            </Link>
                          ) : (
                            <span className="font-sans text-[0.78rem] font-semibold text-fabric-800 truncate">
                              Unknown service
                            </span>
                          )}
                          <span className="font-mono text-[0.58rem] text-fabric-400 flex-shrink-0">
                            {formatRelativeTime(incident.created_at)}
                          </span>
                        </div>

                        {/* Type badge */}
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`font-mono text-[0.56rem] uppercase tracking-wider px-1.5 py-[1px] rounded-full ${BADGE_STYLES[badge.color]}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Title */}
                        <p className="font-sans text-[0.72rem] text-fabric-600 leading-snug">
                          {incident.title}
                        </p>

                        {/* Score at time */}
                        {incident.score_at_time != null && (
                          <p className="font-mono text-[0.58rem] text-fabric-400 mt-1">
                            Score: {incident.score_at_time.toFixed(2)}/5.00
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {hasMore && (
              <div className="text-center py-4">
                <button
                  onClick={() => setDisplayCount(prev => Math.min(prev + PAGE_SIZE, filtered.length))}
                  className="font-mono text-[0.62rem] text-fabric-500 hover:text-fabric-800 cursor-pointer transition-colors"
                >
                  Load more ({filtered.length - displayCount} remaining)
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

export function AlertsBellButton({
  criticalCount,
  onClick,
  active,
}: {
  criticalCount: number
  onClick: () => void
  active: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`relative p-2 rounded-lg border transition-all cursor-pointer ${active ? 'border-blue bg-white shadow-[0_0_0_3px_rgba(61,138,247,0.1)]' : 'border-fabric-200 bg-white hover:border-fabric-300'}`}
      title="Alerts"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fabric-600">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {criticalCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center font-mono text-[0.56rem] font-bold text-white bg-red rounded-full px-1">
          {criticalCount > 99 ? '99+' : criticalCount}
        </span>
      )}
    </button>
  )
}

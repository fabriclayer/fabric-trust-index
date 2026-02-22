'use client'

import { useState, useRef, useEffect } from 'react'
import { CATEGORIES } from '@/lib/utils'

interface SearchToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  activeStatuses: Set<string>
  onToggleStatus: (s: string) => void
  activeCategory: string
  onCategoryChange: (c: string) => void
  activeSort: string
  onSortChange: (s: string) => void
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  totalCount?: number
  filteredCount?: number
}

const SORTS: Record<string, string> = {
  'score-desc': 'Highest trust',
  'score-asc': 'Lowest trust',
  'name-asc': 'A → Z',
  'name-desc': 'Z → A',
  'updated': 'Recently updated',
}

function Dropdown({ label, options, value, onChange, badge }: {
  label: string
  options: Record<string, string>
  value: string
  onChange: (v: string) => void
  badge?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`font-mono text-[0.68rem] text-fabric-600 bg-white border rounded-lg px-2.5 py-1.5 cursor-pointer outline-none flex items-center gap-1.5 whitespace-nowrap transition-all select-none hover:border-fabric-300 ${open ? 'border-pink shadow-[0_0_0_3px_rgba(254,131,224,0.1)]' : 'border-fabric-200'}`}
      >
        <span className="font-medium text-fabric-800">{options[value] || label}</span>
        {badge && <span className="text-[0.6rem] text-fabric-400 bg-fabric-50 rounded px-1 py-px">{badge}</span>}
        <svg className={`w-2.5 h-2.5 text-fabric-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-[80] bg-white border border-fabric-200 rounded-[10px] shadow-lg p-1.5 min-w-[180px]">
          {Object.entries(options).map(([k, v]) => (
            <div
              key={k}
              onClick={() => { onChange(k); setOpen(false) }}
              className={`font-mono text-[0.72rem] text-fabric-600 py-2 px-2.5 rounded-md cursor-pointer flex items-center gap-2 transition-all whitespace-nowrap hover:bg-fabric-50 hover:text-fabric-800 ${value === k ? 'text-pink bg-[rgba(254,131,224,0.06)]' : ''}`}
            >
              {value === k && <span className="w-[5px] h-[5px] rounded-full bg-pink flex-shrink-0" />}
              {v}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SearchToolbar(props: SearchToolbarProps) {
  const statusPills = [
    { key: 'trusted', label: 'Trusted', color: 'bg-[rgba(13,201,86,0.08)] text-[#0dc956]', dot: 'bg-[#0dc956]', border: 'border-[#0dc956]' },
    { key: 'caution', label: 'Caution', color: 'bg-[rgba(247,147,30,0.08)] text-[#f7931e]', dot: 'bg-[#f7931e]', border: 'border-[#f7931e]' },
    { key: 'blocked', label: 'Blocked', color: 'bg-[rgba(208,58,61,0.08)] text-[#d03a3d]', dot: 'bg-[#d03a3d]', border: 'border-[#d03a3d]' },
  ]

  return (
    <div className="sticky top-14 z-[90] bg-fabric-50/[0.92] backdrop-blur-2xl border-b border-fabric-200 py-2.5 px-8 max-md:px-4">
      <div className="max-w-container mx-auto flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-2 py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] min-w-[200px] flex-1 transition-all focus-within:border-pink focus-within:shadow-[0_0_0_3px_rgba(254,131,224,0.1)]">
          <svg className="flex-shrink-0 text-fabric-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={props.searchInputRef}
            type="text"
            placeholder="Search services, models, agents..."
            value={props.searchQuery}
            onChange={e => props.onSearchChange(e.target.value)}
            className="border-none outline-none bg-transparent font-sans text-[0.82rem] text-fabric-800 w-full placeholder:text-fabric-400"
          />
          {props.searchQuery && (
            <button
              onClick={() => props.onSearchChange('')}
              className="flex items-center justify-center bg-transparent border-none cursor-pointer p-0.5 text-fabric-400 rounded hover:text-fabric-700 flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Status pills */}
        <div className="flex gap-1.5 ml-auto">
          {statusPills.map(p => {
            const active = props.activeStatuses.has(p.key)
            return (
              <div
                key={p.key}
                onClick={() => props.onToggleStatus(p.key)}
                className={`font-mono text-[0.58rem] py-0.5 px-2 rounded-full cursor-pointer transition-all flex items-center gap-1 select-none border ${p.color} ${active ? p.border : 'border-transparent'}`}
              >
                <span className={`w-[5px] h-[5px] rounded-full ${p.dot}`} />
                {p.label}
              </div>
            )
          })}
        </div>

        {/* Category dropdown */}
        <Dropdown
          label="All Categories"
          options={CATEGORIES}
          value={props.activeCategory}
          onChange={props.onCategoryChange}
          badge={props.filteredCount != null ? props.filteredCount.toLocaleString() : undefined}
        />

        {/* Sort dropdown */}
        <Dropdown
          label="Highest trust"
          options={SORTS}
          value={props.activeSort}
          onChange={props.onSortChange}
        />
      </div>
    </div>
  )
}

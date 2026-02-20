'use client'

import { TAG_COLORS } from '@/lib/utils'

interface CategoryTagProps {
  tag: string
  category: string
  active?: boolean
}

export default function CategoryTag({ tag, category, active = false }: CategoryTagProps) {
  const colors = TAG_COLORS[tag]
  const label = category.replace(/-/g, ' ')

  return (
    <span
      className="font-mono text-[0.58rem] py-0.5 px-2 rounded-full uppercase tracking-wider font-medium whitespace-nowrap inline-block self-start leading-none transition-all duration-200 border cursor-default"
      style={
        active && colors
          ? { color: colors.text, borderColor: colors.border, background: colors.bg }
          : { color: '#c8c8c4', borderColor: '#f0f0ee', background: 'transparent' }
      }
      onMouseEnter={e => {
        if (!active && colors) {
          (e.target as HTMLElement).style.color = colors.text;
          (e.target as HTMLElement).style.borderColor = colors.border;
          (e.target as HTMLElement).style.background = colors.bg
        }
      }}
      onMouseLeave={e => {
        if (!active && colors) {
          (e.target as HTMLElement).style.color = '#c8c8c4';
          (e.target as HTMLElement).style.borderColor = '#f0f0ee';
          (e.target as HTMLElement).style.background = 'transparent'
        }
      }}
    >
      {label}
    </span>
  )
}

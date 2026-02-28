'use client'

import { useState } from 'react'
import Link from 'next/link'
import FabricLogo from './FabricLogo'

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)

  const links: { href: string; label: string; disabled?: boolean }[] = [
    { href: '#', label: 'API', disabled: true },
    { href: 'https://fabriclayer.ai/blog', label: 'Blog' },
    { href: 'https://fabriclayer.ai/docs', label: 'Docs' },
  ]

  return (
    <>
      <nav className="sticky top-0 z-[100] bg-white border-b border-fabric-200 px-8 h-14 max-md:px-4">
        <div className="max-w-container mx-auto h-full flex items-center justify-between">
          <div className="flex items-center gap-5">
            <a href="https://fabriclayer.ai" className="flex items-center gap-2.5 text-black no-underline">
              <FabricLogo className="h-[18px] w-auto" />
            </a>
            <Link href="/" className="font-mono text-[0.78rem] font-normal tracking-wide text-fabric-400 border-l border-fabric-200 pl-2.5 no-underline hover:text-pink transition-colors">
              trust index
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-6">
              {links.map(l => l.disabled ? (
                <span key={l.label} className="relative group font-mono text-[0.78rem] font-normal text-fabric-300 cursor-default select-none">
                  {l.label}
                  <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 bg-fabric-800 text-white text-[0.62rem] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Coming soon
                  </span>
                </span>
              ) : (
                <a key={l.href} href={l.href} className="font-mono text-[0.78rem] font-normal text-fabric-500 no-underline transition-colors hover:text-pink">
                  {l.label}
                </a>
              ))}
            </div>
            <button
              className="flex md:hidden flex-col gap-1 bg-transparent border-none cursor-pointer p-1.5 min-w-[44px] min-h-[44px] items-center justify-center rounded-md transition-colors hover:bg-fabric-100"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              <span className={`block w-[18px] h-[1.5px] bg-fabric-700 rounded-sm transition-all ${menuOpen ? 'translate-y-[5.5px] rotate-45' : ''}`} />
              <span className={`block w-[18px] h-[1.5px] bg-fabric-700 rounded-sm transition-all ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-[18px] h-[1.5px] bg-fabric-700 rounded-sm transition-all ${menuOpen ? '-translate-y-[5.5px] -rotate-45' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed top-14 right-0 z-[99] bg-white border border-fabric-200 rounded-bl-xl shadow-lg py-2 min-w-[180px] md:hidden">
          {links.map(l => l.disabled ? (
            <span key={l.label} className="block font-mono text-[0.78rem] text-fabric-300 py-2 px-5 cursor-default">
              {l.label} <span className="text-[0.62rem]">· coming soon</span>
            </span>
          ) : (
            <a key={l.href} href={l.href} className="flex items-center min-h-[44px] font-mono text-[0.78rem] text-fabric-600 no-underline py-2 px-5 transition-all hover:bg-fabric-50 hover:text-black">
              {l.label}
            </a>
          ))}
        </div>
      )}
    </>
  )
}

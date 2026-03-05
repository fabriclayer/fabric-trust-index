'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import SearchToolbar from '@/components/SearchToolbar'
import ServiceCard from '@/components/ServiceCard'
import DisclaimerModal from '@/components/DisclaimerModal'
import SubmitServiceModal from '@/components/SubmitServiceModal'
import AlertsFeed, { type Incident } from '@/components/AlertsFeed'
import type { Service } from '@/data/services'

const PAGE_SIZE = 24

export default function TrustIndexClient({ services, incidents = [] }: { services: Service[]; incidents?: Incident[] }) {
  // Disclaimer
  const [accepted, setAccepted] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('fabric-disclaimer') === 'accepted') {
      setAccepted(true)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('fabric-disclaimer', 'accepted')
    setAccepted(true)
  }
  const handleDecline = () => {
    window.location.href = 'https://fabriclayer.dev'
  }

  // Cmd+K shortcut
  const searchInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  // Filters
  const router = useRouter()
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category') || 'all'
  const publisherParam = searchParams.get('publisher') || ''
  const queryParam = searchParams.get('q') || ''
  const [searchQuery, setSearchQuery] = useState(queryParam)
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set(['trusted', 'caution', 'blocked']))
  const [activeCategory, setActiveCategory] = useState(categoryParam)
  const [activePublisher, setActivePublisher] = useState(publisherParam)

  useEffect(() => {
    setActiveCategory(categoryParam)
  }, [categoryParam])

  useEffect(() => {
    setActivePublisher(publisherParam)
  }, [publisherParam])

  useEffect(() => {
    setSearchQuery(queryParam)
  }, [queryParam])

  const buildUrl = useCallback((params: { category?: string; publisher?: string }) => {
    const cat = params.category ?? activeCategory
    const pub = params.publisher ?? activePublisher
    const parts: string[] = []
    if (cat !== 'all') parts.push(`category=${cat}`)
    if (pub) parts.push(`publisher=${encodeURIComponent(pub)}`)
    return parts.length ? `/?${parts.join('&')}` : '/'
  }, [activeCategory, activePublisher])

  const handleCategoryChange = useCallback((c: string) => {
    setActiveCategory(c)
    router.replace(buildUrl({ category: c }), { scroll: false })
  }, [router, buildUrl])

  const handlePublisherClear = useCallback(() => {
    setActivePublisher('')
    router.replace(buildUrl({ publisher: '' }), { scroll: false })
  }, [router, buildUrl])
  const [activeSort, setActiveSort] = useState('score-desc')
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  // undefined = not yet loaded from localStorage, null = no stored value, string = timestamp
  const [alertsSeenAt, setAlertsSeenAt] = useState<string | null | undefined>(undefined)

  // Restore last-seen timestamp from localStorage
  useEffect(() => {
    setAlertsSeenAt(localStorage.getItem('fabric-alerts-seen-at'))
  }, [])

  const criticalCount = useMemo(() => {
    if (alertsSeenAt === undefined) return 0 // suppress badge until localStorage checked
    if (!alertsSeenAt) return incidents.filter(i => i.severity === 'critical').length
    return incidents.filter(i => i.severity === 'critical' && i.created_at > alertsSeenAt).length
  }, [incidents, alertsSeenAt])

  const toggleStatus = useCallback((s: string) => {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
    setDisplayCount(PAGE_SIZE)
  }, [])

  // Filter & sort
  const filtered = useMemo(() => {
    let result = services.filter(svc => {
      if (!activeStatuses.has(svc.status)) return false
      if (activeCategory !== 'all' && svc.category !== activeCategory) return false
      if (activePublisher && svc.publisher !== activePublisher) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return svc.name.toLowerCase().includes(q) ||
          svc.publisher.toLowerCase().includes(q) ||
          svc.description.toLowerCase().includes(q)
      }
      return true
    })

    switch (activeSort) {
      case 'score-desc': result.sort((a, b) => b.score - a.score); break
      case 'score-asc': result.sort((a, b) => a.score - b.score); break
      case 'name-asc': result.sort((a, b) => a.name.localeCompare(b.name)); break
      case 'name-desc': result.sort((a, b) => b.name.localeCompare(a.name)); break
      case 'updated': result.sort((a, b) => {
        const aDate = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const bDate = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return bDate - aDate
      }); break
      case 'indexed': result.sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0
        return bDate - aDate
      }); break
    }

    return result
  }, [services, searchQuery, activeStatuses, activeCategory, activePublisher, activeSort])

  // Reset display count on filter change
  useEffect(() => {
    setDisplayCount(PAGE_SIZE)
  }, [searchQuery, activeStatuses, activeCategory, activePublisher, activeSort])

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && displayCount < filtered.length) {
        setDisplayCount(prev => Math.min(prev + PAGE_SIZE, filtered.length))
      }
    }, { rootMargin: '200px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [displayCount, filtered.length])

  const displayed = filtered.slice(0, displayCount)
  const hasMore = displayCount < filtered.length
  const allLoaded = displayCount >= filtered.length && filtered.length > 0

  return (
    <>
      {!accepted && <DisclaimerModal onAccept={handleAccept} onDecline={handleDecline} />}

      <Nav />

      <SearchToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeStatuses={activeStatuses}
        onToggleStatus={toggleStatus}
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        activePublisher={activePublisher}
        onPublisherClear={handlePublisherClear}
        activeSort={activeSort}
        onSortChange={s => setActiveSort(s)}
        searchInputRef={searchInputRef}
        totalCount={services.length}
        filteredCount={filtered.length}
        alertsOpen={alertsOpen}
        onToggleAlerts={() => {
          setAlertsOpen(o => !o)
          const now = new Date().toISOString()
          setAlertsSeenAt(now)
          localStorage.setItem('fabric-alerts-seen-at', now)
        }}
        criticalCount={criticalCount}
      />

      <AlertsFeed incidents={incidents} open={alertsOpen} onClose={() => setAlertsOpen(false)} />

      <div className={`px-8 pt-5 pb-16 max-md:px-4 transition-[margin] duration-200 ${alertsOpen ? 'mr-[360px] max-md:mr-0' : ''}`}>
       <div className="max-w-container mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 max-[480px]:py-8">
            <svg className="mx-auto text-fabric-300 mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
              <path d="M8 11h6" />
            </svg>
            <h3 className="text-base font-semibold text-fabric-600 mb-1">No services found</h3>
            <p className="font-mono text-[0.72rem] text-fabric-400 mb-4">Try adjusting your search or filters</p>
            {searchQuery.trim() && (
              <button
                onClick={() => setShowSubmitModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-fabric-800 text-white font-sans text-[0.78rem] font-semibold rounded-[10px] cursor-pointer transition-all hover:bg-black"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Request this service
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 max-md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] max-md:gap-2 max-[480px]:grid-cols-2 max-[380px]:grid-cols-1">
              {displayed.map(svc => (
                <ServiceCard key={svc.slug} service={svc} />
              ))}
            </div>

            {hasMore && (
              <div className="text-center py-8 font-mono text-[0.72rem] text-fabric-400">
                <span className="spinner" />Loading more services...
              </div>
            )}

            {allLoaded && (
              <div className="text-center py-8 font-mono text-[0.72rem] text-fabric-400">
                You&apos;ve seen all matching services
              </div>
            )}

            <div ref={sentinelRef} className="h-px" />
          </>
        )}
       </div>
      </div>

      <Footer />

      {showSubmitModal && (
        <SubmitServiceModal
          initialName={searchQuery}
          onClose={() => setShowSubmitModal(false)}
        />
      )}
    </>
  )
}

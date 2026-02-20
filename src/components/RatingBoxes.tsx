'use client'

import { useEffect, useRef } from 'react'

const RATING_PATH = "M0,14.57v94.17c0,8.05,6.52,14.57,14.57,14.57h94.17c8.05,0,14.57-6.52,14.57-14.57V14.57c0-8.05-6.52-14.57-14.57-14.57H14.57C6.52,0,0,6.52,0,14.57ZM72.96,19.4l7.51,5.41-3.57,30.98,16.03-21.88,6.81,4.91-16.79,23.14-13.59-9.91,3.6-32.65ZM31.62,33.12l28.33,12.98-15.83-22.06,6.82-4.91,16.79,23.08-13.61,9.92-29.9-13.51,7.4-5.5ZM24.42,82.22l21.23-23.06-25.9,8.28-2.63-7.97,27.17-8.81,5.18,15.99-22.09,24.25-2.96-8.68ZM68.91,104.19l-15.35-27.39-.1,27.29-8.49.04v-28.57s16.89-.04,16.89-.04l16.22,28.51-9.17.16ZM103.46,68.68l-30.49,6.14,25.61,8.48-2.51,8.04-27.14-8.8,5.19-16.02,32.08-6.63-2.74,8.79Z"

function RatingSvg({ sizePx }: { sizePx: number }) {
  return (
    <svg viewBox="0 0 123.32 123.32" width={sizePx} height={sizePx} style={{ display: 'block', flexShrink: 0 }}>
      <path d={RATING_PATH} />
    </svg>
  )
}

interface RatingBoxesProps {
  score: number
  status: 'trusted' | 'caution' | 'blocked'
  size?: 'sm' | 'lg'
}

const fillColorClass = {
  trusted: '[&_path]:fill-[#0dc956]',
  caution: '[&_path]:fill-[#f7931e]',
  blocked: '[&_path]:fill-[#d03a3d]',
}

export default function RatingBoxes({ score, status, size = 'sm' }: RatingBoxesProps) {
  const ref = useRef<HTMLDivElement>(null)
  const sweepRef = useRef<HTMLDivElement>(null)

  const full = Math.floor(score)
  const frac = score - full
  const px = size === 'lg' ? 36 : 18
  const gapPx = size === 'lg' ? 5 : 3
  const boxSize = size === 'lg' ? 'w-9 h-9' : 'w-[18px] h-[18px]'
  const gap = size === 'lg' ? 'gap-[5px]' : 'gap-[3px]'

  useEffect(() => {
    if (!ref.current || !sweepRef.current) return
    const el = ref.current
    const sweep = sweepRef.current
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          // Calculate the target width: full boxes + partial box + gaps
          const lastFilledBox = frac > 0 ? full + 1 : full
          const fullBoxesWidth = lastFilledBox * px
          const gapsWidth = Math.max(0, lastFilledBox - 1) * gapPx
          // For the partial box, we need the full box width (clip happens inside the box)
          const totalWidth = fullBoxesWidth + gapsWidth
          sweep.style.width = totalWidth + 'px'
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [score, full, frac, px, gapPx])

  // Build the colored fill boxes (always at full correct width)
  const fillBoxes = []
  for (let i = 1; i <= 5; i++) {
    let fillPct = 0
    if (i <= full) fillPct = 100
    else if (i === full + 1) fillPct = Math.round(frac * 100)

    fillBoxes.push(
      <div key={i} className={`${boxSize} relative flex-shrink-0`}>
        {fillPct > 0 && (
          <div
            className={`absolute top-0 left-0 h-full overflow-hidden ${fillColorClass[status]}`}
            style={{ width: fillPct + '%' }}
          >
            <RatingSvg sizePx={px} />
          </div>
        )}
      </div>
    )
  }

  // Build the gray background boxes
  const bgBoxes = []
  for (let i = 1; i <= 5; i++) {
    bgBoxes.push(
      <div key={i} className={`${boxSize} flex-shrink-0 [&_path]:fill-[#e6e6e6]`}>
        <RatingSvg sizePx={px} />
      </div>
    )
  }

  return (
    <div ref={ref} className={`relative flex ${gap}`} style={{ width: px * 5 + gapPx * 4 }}>
      {/* Gray background layer */}
      <div className={`flex ${gap}`}>
        {bgBoxes}
      </div>
      {/* Colored sweep layer — single overflow-hidden div that expands left to right */}
      <div
        ref={sweepRef}
        className="absolute top-0 left-0 h-full overflow-hidden"
        style={{ width: 0, transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className={`flex ${gap}`} style={{ width: px * 5 + gapPx * 4 }}>
          {fillBoxes}
        </div>
      </div>
    </div>
  )
}

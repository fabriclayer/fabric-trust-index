'use client'

import Link from 'next/link'
import type { Service } from '@/data/services'
import RatingBoxes from './RatingBoxes'
import CategoryTag from './CategoryTag'

const scoreNumColor = {
  trusted: 'text-[#0dc956]',
  caution: 'text-[#f7931e]',
  blocked: 'text-[#d03a3d]',
}

export default function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      href={`/${service.slug}`}
      className="group bg-white border border-fabric-200 rounded-card p-5 cursor-pointer transition-all duration-200 flex flex-col gap-2.5 relative no-underline hover:border-fabric-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-px max-[480px]:p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-10 h-10 rounded-[10px] bg-fabric-100 border border-fabric-200 flex items-center justify-center text-base flex-shrink-0 font-semibold text-fabric-500 font-sans uppercase">
          {service.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[0.92rem] font-semibold text-black tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {service.name}
          </div>
          <div className="font-mono text-[0.62rem] text-fabric-400 whitespace-nowrap overflow-hidden text-ellipsis">
            {service.publisher}
          </div>
        </div>
      </div>

      <CategoryTag tag={service.tag} category={service.category} />

      <div className="text-[0.78rem] leading-relaxed text-fabric-600 line-clamp-2 max-[480px]:line-clamp-1 max-[480px]:text-[0.72rem]">
        {service.description}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-fabric-100 mt-auto">
        <RatingBoxes score={service.score} status={service.status} />
        <span className={`font-mono text-[0.82rem] font-semibold tracking-tight ${scoreNumColor[service.status]}`}>
          {service.score.toFixed(2)}
        </span>
        <span className="font-mono text-[0.58rem] text-fabric-400 ml-auto whitespace-nowrap">
          {service.updated} ago
        </span>
      </div>
    </Link>
  )
}

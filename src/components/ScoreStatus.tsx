const statusStyles: Record<string, string> = {
  trusted: 'bg-[rgba(13,201,86,0.1)] text-[#0dc956]',
  caution: 'bg-[rgba(247,147,30,0.1)] text-[#f7931e]',
  blocked: 'bg-[rgba(208,58,61,0.1)] text-[#d03a3d]',
  pending: 'bg-[rgba(160,160,156,0.1)] text-[#a0a09c]',
}

const dotStyles: Record<string, string> = {
  trusted: 'bg-[#0dc956]',
  caution: 'bg-[#f7931e]',
  blocked: 'bg-[#d03a3d]',
  pending: 'bg-[#a0a09c]',
}

const statusLabels: Record<string, string> = {
  trusted: 'trusted',
  caution: 'caution',
  blocked: 'blocked',
  pending: 'evaluation pending',
}

export default function ScoreStatus({ status }: { status: 'trusted' | 'caution' | 'blocked' | 'pending' }) {
  return (
    <span className={`font-mono text-[0.65rem] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 leading-none ${statusStyles[status] ?? statusStyles.pending}`}>
      <span className={`w-1.5 h-1.5 rounded-full animate-dot-pulse ${dotStyles[status] ?? dotStyles.pending}`} />
      {statusLabels[status] ?? status}
    </span>
  )
}

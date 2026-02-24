const VT_API = 'https://www.virustotal.com/api/v3'

// Rate limiter: 4 requests per minute
let lastRequestTime = 0
const MIN_INTERVAL = 15500 // 15.5 seconds between requests (safe margin)

export interface VTReport {
  malicious: number
  suspicious: number
  undetected: number
  harmless: number
  reputation: number
  lastAnalysisDate: number
  sha256: string
}

async function vtRateLimited() {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL - elapsed))
  }
  lastRequestTime = Date.now()
}

export async function getVTReport(sha256: string): Promise<VTReport | null> {
  if (!process.env.VIRUSTOTAL_API_KEY) {
    console.warn('VIRUSTOTAL_API_KEY not set — skipping VT lookup')
    return null
  }
  await vtRateLimited()
  try {
    const res = await fetch(`${VT_API}/files/${sha256}`, {
      headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY }
    })
    if (res.status === 404) return null // Not in VT database
    if (res.status === 429) throw new Error('VT rate limited')
    if (!res.ok) return null
    const json = await res.json()
    const attrs = json.data?.attributes
    if (!attrs) return null
    return {
      malicious: attrs.last_analysis_stats?.malicious ?? 0,
      suspicious: attrs.last_analysis_stats?.suspicious ?? 0,
      undetected: attrs.last_analysis_stats?.undetected ?? 0,
      harmless: attrs.last_analysis_stats?.harmless ?? 0,
      reputation: attrs.reputation ?? 0,
      lastAnalysisDate: attrs.last_analysis_date ?? 0,
      sha256: attrs.sha256 ?? sha256,
    }
  } catch (e) {
    console.error('VT API error:', e)
    return null
  }
}

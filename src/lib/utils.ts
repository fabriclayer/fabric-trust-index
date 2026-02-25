// Re-export canonical scoring functions from thresholds
export { computeComposite as computeScore, getStatus, getScoreColor } from '@/lib/scoring/thresholds'

export function getStatusColor(status: string): string {
  switch (status) {
    case 'trusted': return '#0dc956'
    case 'caution': return '#f7931e'
    case 'blocked': return '#d03a3d'
    case 'pending': return '#a0a09c'
    default: return '#a0a09c'
  }
}

export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function fromSlug(slug: string): string {
  return slug.replace(/-/g, ' ')
}

export function randomUpdated(): string {
  const units = ['2h', '4h', '8h', '12h', '1d', '2d', '3d', '5d', '1w', '2w']
  return units[Math.floor(Math.random() * units.length)]
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Category display names
export const CATEGORIES: Record<string, string> = {
  'all': 'Categories',
  'skill': 'Skills',
  'image-generation': 'Image Gen',
  'llm': 'LLMs',
  'web-search': 'Search',
  'code': 'Code',
  'speech': 'Speech',
  'data-api': 'Data APIs',
  'agent': 'Agents',
  'embedding': 'Embeddings',
  'vision': 'Vision',
  'infra': 'Infra',
  'framework': 'Frameworks',
}

// Tag class mapping
export const TAG_CLASSES: Record<string, string> = {
  'image-generation': 'tag-gen',
  'llm': 'tag-llm',
  'web-search': 'tag-search',
  'code': 'tag-code',
  'speech': 'tag-speech',
  'data-api': 'tag-data',
  'agent': 'tag-agent',
  'embedding': 'tag-embed',
  'vision': 'tag-vision',
  'infra': 'tag-infra',
  'framework': 'tag-frame',
  'skill': 'tag-skill',
}

// Category colors for tag highlighting
export const TAG_COLORS: Record<string, { text: string; border: string; bg: string }> = {
  'tag-gen': { text: '#8b5cf6', border: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  'tag-llm': { text: '#3d8af7', border: '#3d8af7', bg: 'rgba(61,138,247,0.08)' },
  'tag-search': { text: '#0dc956', border: '#0dc956', bg: 'rgba(13,201,86,0.08)' },
  'tag-code': { text: '#fe83e0', border: '#fe83e0', bg: 'rgba(254,131,224,0.08)' },
  'tag-agent': { text: '#f7931e', border: '#f7931e', bg: 'rgba(247,147,30,0.08)' },
  'tag-data': { text: '#06b6d4', border: '#06b6d4', bg: 'rgba(6,182,212,0.08)' },
  'tag-embed': { text: '#ec4899', border: '#ec4899', bg: 'rgba(236,72,153,0.08)' },
  'tag-infra': { text: '#d97706', border: '#d97706', bg: 'rgba(217,119,6,0.08)' },
  'tag-speech': { text: '#14b8a6', border: '#14b8a6', bg: 'rgba(20,184,166,0.08)' },
  'tag-vision': { text: '#e82d35', border: '#e82d35', bg: 'rgba(232,45,53,0.08)' },
  'tag-frame': { text: '#7c3aed', border: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
  'tag-skill': { text: '#059669', border: '#059669', bg: 'rgba(5,150,105,0.08)' },
}

// Signal labels for the product page (packages: npm, PyPI, HTTP endpoints)
export const SIGNAL_LABELS = [
  { name: 'Vulnerability & Safety', weight: '×0.25', detail: 'Zero known CVEs across full dependency tree. No malware signatures detected. Clean install scripts. No typosquatting indicators. All dependencies scanned recursively.' },
  { name: 'Operational Health', weight: '×0.15', detail: 'Fabric Monitor active — 99.95% uptime over rolling 30d. Sub-200ms p50 latency. Consistent behavioral responses across identical checks. 15-minute ping cycle.' },
  { name: 'Maintenance Activity', weight: '×0.20', detail: 'Active commits within last 7 days. Regular release cadence. Median issue response under 24h. Healthy open/closed issue ratio. Consistent PR merge velocity.' },
  { name: 'Adoption', weight: '×0.15', detail: 'Top-tier download volume normalised against category peers. Strong growth velocity. High unique caller count. Logarithmic scale — raw numbers weighted against ecosystem averages.' },
  { name: 'Transparency', weight: '×0.15', detail: 'Published model card and system card. SECURITY.md present. API documentation with input/output schemas. Research papers linked. Closed-weight model limits full source visibility.' },
  { name: 'Publisher Trust', weight: '×0.10', detail: 'Verified organisation account. Consistent identity across npm, PyPI, and GitHub. Multiple maintained packages. Clean track record with no prior security incidents. Domain-verified.' },
]

// Signal labels for skill category (ClawHub/OpenClaw skills)
export const SKILL_SIGNAL_LABELS = [
  { name: 'VirusTotal Scan', weight: '×0.30', detail: 'ClawHub submits every skill to VirusTotal on publish. Scanned by 70+ security vendors for malware, trojans, and suspicious patterns. Clean scan with zero detections scores highest.' },
  { name: 'Content Safety', weight: '×0.25', detail: 'Static analysis of SKILL.md for hardcoded secrets, suspicious shell commands, credential exfiltration, agent config tampering (SOUL.md/MEMORY.md), and sensitive path access. Self-disclosed operations are not penalized.' },
  { name: 'Publisher Reputation', weight: '×0.15', detail: 'GitHub account age, public repositories, organisation status, profile completeness, and follower count. Newer accounts with minimal history score lower.' },
  { name: 'Adoption', weight: '×0.10', detail: 'ClawHub install count and star ratings. Logarithmic scale — widely used skills with community endorsement score higher.' },
  { name: 'Freshness', weight: '×0.10', detail: 'Last update recency, version count, and changelog presence. Actively maintained skills with regular updates score higher.' },
  { name: 'Transparency', weight: '×0.10', detail: 'Metadata completeness — description quality, tag declarations, usage instructions, environment variable disclosure, dependency declarations, and version iteration.' },
]

// Data sources for skill category (displayed on product page)
export const SKILL_DATA_SOURCES = [
  { icon: '◎', label: 'VirusTotal', meta: 'Malware scanning by 70+ security vendors' },
  { icon: '◈', label: 'ClawHub Registry', meta: 'Install counts, stars, version history, moderation status' },
  { icon: '◈', label: 'GitHub API', meta: 'Publisher account age, activity, reputation' },
  { icon: '△', label: 'SKILL.md Analysis', meta: 'Static content analysis for credential leaks, malicious patterns' },
]

export const SIGNAL_WEIGHTS = {
  vulnerability: 0.25,
  operational: 0.20,
  maintenance: 0.20,
  adoption: 0.15,
  transparency: 0.10,
  publisher_trust: 0.10,
} as const

export const SIGNAL_ORDER = [
  'vulnerability',
  'operational',
  'maintenance',
  'adoption',
  'transparency',
  'publisher_trust',
] as const

export type SignalName = typeof SIGNAL_ORDER[number]

export const THRESHOLDS = {
  trusted: 4.50,    // >=4.50
  caution: 3.50,    // >=3.50
  // below 3.50 = blocked
} as const

export const MODIFIERS = {
  new_provider: { threshold: 10, multiplier: 0.8 },
  inactive: { threshold_days: 7, multiplier: 0.7 },
} as const

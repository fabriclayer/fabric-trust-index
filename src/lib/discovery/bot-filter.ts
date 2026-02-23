/**
 * Known CI bot names to filter from publisher resolution.
 * If a resolved publisher matches any of these, skip to the next resolution method.
 */
export const CI_BOT_NAMES = new Set([
  'github-actions[bot]',
  'github-actions',
  'dependabot[bot]',
  'dependabot',
  'semantic-release-bot',
  'greenkeeper[bot]',
  'renovate[bot]',
  'renovate',
  'snyk-bot',
  'snyk',
  'mergify[bot]',
  'codecov[bot]',
  'allcontributors[bot]',
  'stale[bot]',
])

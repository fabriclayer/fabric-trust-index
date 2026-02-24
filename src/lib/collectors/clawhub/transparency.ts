import type { CollectorResult } from '../types'
import { clampScore } from '../types'
import type { ClawHubSkillData } from './api'

export function collectTransparency(
  data: ClawHubSkillData | null,
  skillContent: string | null,
): CollectorResult {
  let score = 0
  const checks: Record<string, boolean> = {}

  // 1. Has description/summary (0.5)
  if (data?.skill.summary && data.skill.summary.length > 0) {
    score += 0.5
    checks.hasDescription = true
  }

  // 2. Has tags defined (0.5)
  const tagCount = data ? Object.keys(data.skill.tags).filter(t => t !== 'latest').length : 0
  if (tagCount > 0) {
    score += 0.5
    checks.hasTags = true
  }

  // 3. SKILL.md has usage instructions (content > 200 chars) (0.5)
  if (skillContent && skillContent.length > 200) {
    score += 0.5
    checks.hasUsageInstructions = true
  }

  // 4. Declares environment variables (requires.env) (0.5)
  if (skillContent && /requires\.env|env_vars|environment.variables/i.test(skillContent)) {
    score += 0.5
    checks.declaresEnvVars = true
  }

  // 5. Declares dependencies (requires.bins or dependencies) (0.5)
  if (skillContent && /requires\.bins|dependencies|prerequisites/i.test(skillContent)) {
    score += 0.5
    checks.declaresDeps = true
  }

  // 6. Has version > 1.0.0 (indicates iteration) (0.5)
  const version = data?.latestVersion.version
  if (version) {
    const major = parseInt(version.split('.')[0])
    if (major >= 1 && version !== '1.0.0') {
      score += 0.5
      checks.hasIteratedVersion = true
    }
  }

  // 7. Description is substantive (> 50 chars, not just name) (0.5)
  if (data?.skill.summary && data.skill.summary.length > 50) {
    score += 0.5
    checks.substantiveDescription = true
  }

  // 8. Has frontmatter/metadata block (0.5)
  if (skillContent && /^---\n[\s\S]*?\n---/m.test(skillContent)) {
    score += 0.5
    checks.hasFrontmatter = true
  }

  // 9. No obfuscated content (0.5)
  const hasObfuscation = skillContent && /[A-Za-z0-9+/]{200,}={0,2}/.test(skillContent)
  if (!hasObfuscation) {
    score += 0.5
    checks.noObfuscation = true
  }

  // 10. Has changelog (0.5)
  if (data?.latestVersion.changelog && data.latestVersion.changelog.length > 10) {
    score += 0.5
    checks.hasChangelog = true
  }

  return {
    signal_name: 'transparency',
    score: clampScore(score),
    metadata: { checks, tagCount, contentLength: skillContent?.length ?? 0 },
    sources: data ? ['clawhub:api'] : [],
  }
}

import type { CollectorResult } from '../types'
import { clampScore } from '../types'
import { fetchSkillMd } from './api'

// Patterns that indicate hardcoded secrets or API keys
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,                    // OpenAI keys
  /AKIA[A-Z0-9]{16}/,                        // AWS access keys
  /ghp_[a-zA-Z0-9]{36}/,                     // GitHub personal access tokens
  /gho_[a-zA-Z0-9]{36}/,                     // GitHub OAuth tokens
  /glpat-[a-zA-Z0-9_-]{20,}/,               // GitLab tokens
  /xox[bpsa]-[a-zA-Z0-9-]{10,}/,            // Slack tokens
  /AIza[a-zA-Z0-9_-]{35}/,                   // Google API keys
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,   // Private keys
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/, // JWT tokens (long ones)
]

// Suspicious shell command patterns
const SUSPICIOUS_COMMANDS = [
  /curl\s+[^\n]*\|\s*(ba)?sh/i,             // curl | bash
  /wget\s+[^\n]*\|\s*(ba)?sh/i,             // wget | bash
  /\beval\s*\(/,                              // eval()
  /\bexec\s*\(/,                              // exec()
  /rm\s+-rf\s+\//,                            // rm -rf /
  />\s*\/dev\/sd[a-z]/,                       // write to disk device
  /mkfs\./,                                    // format filesystem
  /:(){ :\|:& };:/,                           // fork bomb
]

// Credential handling patterns (agent told to pass secrets through LLM)
const CREDENTIAL_LEAK_PATTERNS = [
  /echo\s+\$[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i,
  /console\.log\(.*(?:apiKey|token|secret|password)/i,
  /print\(.*(?:api_key|token|secret|password)/i,
]

// Sensitive file system paths
const SENSITIVE_PATHS = [
  /~\/\.ssh\//,
  /~\/\.aws\//,
  /~\/\.gnupg\//,
  /\/etc\/shadow/,
  /\/etc\/passwd/,
  /~\/\.env/,
]

// Base64 encoded payloads (unusually long)
const BASE64_PAYLOAD = /[A-Za-z0-9+/]{100,}={0,2}/

export async function collectContentSafety(
  skillSlug: string,
  ownerHandle: string | null,
): Promise<CollectorResult> {
  // Try to fetch SKILL.md
  let content: string | null = null
  if (ownerHandle) {
    content = await fetchSkillMd(ownerHandle, skillSlug)
  }

  if (!content) {
    return {
      signal_name: 'content_safety',
      score: 2.5,
      metadata: { reason: 'skill_not_found' },
      sources: [],
    }
  }

  let score = 5.0
  const findings: string[] = []

  // Check for hardcoded secrets
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      score -= 2.0
      findings.push(`hardcoded_secret: ${pattern.source.slice(0, 30)}`)
      break // one penalty for secrets
    }
  }

  // Check for suspicious shell commands
  for (const pattern of SUSPICIOUS_COMMANDS) {
    if (pattern.test(content)) {
      score -= 1.5
      findings.push(`suspicious_command: ${pattern.source.slice(0, 40)}`)
      break
    }
  }

  // Check for credential leaks in prompts
  for (const pattern of CREDENTIAL_LEAK_PATTERNS) {
    if (pattern.test(content)) {
      score -= 1.5
      findings.push(`credential_leak: ${pattern.source.slice(0, 40)}`)
      break
    }
  }

  // Check for sensitive file paths
  for (const pattern of SENSITIVE_PATHS) {
    if (pattern.test(content)) {
      score -= 1.0
      findings.push(`sensitive_path: ${pattern.source.slice(0, 30)}`)
      break
    }
  }

  // Check for base64 encoded payloads
  const base64Matches = content.match(BASE64_PAYLOAD)
  if (base64Matches && base64Matches[0].length > 200) {
    score -= 1.0
    findings.push('base64_payload')
  }

  // Check for excessive permission requests
  if (/\bsudo\b/.test(content) || /\bchmod\s+777\b/.test(content)) {
    score -= 0.5
    findings.push('excessive_permissions')
  }

  return {
    signal_name: 'content_safety',
    score: clampScore(score),
    metadata: {
      findings,
      contentLength: content.length,
      findingsCount: findings.length,
    },
    sources: [`github:openclaw/skills/${ownerHandle}/${skillSlug}`],
  }
}

import type { DbService } from '@/lib/supabase/types'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Supply Chain Collector (informational — no score impact)
 *
 * Fetches direct dependencies from npm/PyPI registries,
 * queries OSV.dev for known CVEs per dependency,
 * and upserts results into the supply_chain table.
 */

interface NpmPackageData {
  dependencies?: Record<string, string>
}

interface PyPIPackageData {
  info?: {
    requires_dist?: string[] | null
  }
}

interface OsvQueryResponse {
  vulns?: Array<{ id: string }>
}

async function getNpmDependencies(
  pkg: string
): Promise<Array<{ name: string; version: string }>> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`)
    if (!res.ok) return []
    const data: NpmPackageData = await res.json()
    if (!data.dependencies) return []
    return Object.entries(data.dependencies).map(([name, version]) => ({
      name,
      version,
    }))
  } catch {
    return []
  }
}

async function getPyPIDependencies(
  pkg: string
): Promise<Array<{ name: string; version: string }>> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${pkg}/json`)
    if (!res.ok) return []
    const data: PyPIPackageData = await res.json()
    const requires = data.info?.requires_dist
    if (!requires || requires.length === 0) return []
    return requires.map(spec => {
      // Parse "package_name (>=1.0)" or "package_name>=1.0" or just "package_name"
      const match = spec.match(/^([a-zA-Z0-9_.-]+)\s*(?:\(([^)]*)\)|([<>=!~].*))?/)
      return {
        name: match?.[1] ?? spec.split(/[\s(>=<!~;]/)[0],
        version: match?.[2] ?? match?.[3] ?? '*',
      }
    })
  } catch {
    return []
  }
}

async function getOsvCveCount(
  packageName: string,
  ecosystem: 'npm' | 'PyPI'
): Promise<number> {
  try {
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: packageName, ecosystem },
      }),
    })
    if (!res.ok) return 0
    const data: OsvQueryResponse = await res.json()
    return data.vulns?.length ?? 0
  } catch {
    return 0
  }
}

export async function collectSupplyChain(service: DbService): Promise<{
  total: number
  withCves: number
}> {
  const supabase = createServerClient()
  let total = 0
  let withCves = 0

  // Collect npm dependencies
  if (service.npm_package) {
    const deps = await getNpmDependencies(service.npm_package)
    for (const dep of deps) {
      const cveCount = await getOsvCveCount(dep.name, 'npm')
      const hasCves = cveCount > 0
      if (hasCves) withCves++
      total++

      await supabase
        .from('supply_chain')
        .upsert(
          {
            service_id: service.id,
            dependency_name: dep.name,
            dependency_type: 'npm',
            dependency_version: dep.version,
            has_known_cves: hasCves,
            cve_count: cveCount,
          },
          { onConflict: 'service_id,dependency_name' }
        )
    }
  }

  // Collect PyPI dependencies
  if (service.pypi_package) {
    const deps = await getPyPIDependencies(service.pypi_package)
    for (const dep of deps) {
      const cveCount = await getOsvCveCount(dep.name, 'PyPI')
      const hasCves = cveCount > 0
      if (hasCves) withCves++
      total++

      await supabase
        .from('supply_chain')
        .upsert(
          {
            service_id: service.id,
            dependency_name: dep.name,
            dependency_type: 'pypi',
            dependency_version: dep.version,
            has_known_cves: hasCves,
            cve_count: cveCount,
          },
          { onConflict: 'service_id,dependency_name' }
        )
    }
  }

  return { total, withCves }
}

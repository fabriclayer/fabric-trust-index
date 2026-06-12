/**
 * Smoke test for all API v1 endpoints.
 * Usage: npx tsx src/scripts/smoke-api.ts
 * Env vars:
 *   API_BASE_URL  — default http://localhost:3000
 *   API_KEY       — if set, tests authenticated endpoints too
 */

const BASE = process.env.API_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:3000";
const API_KEY = process.env.API_KEY;

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

interface Result {
  name: string;
  pass: boolean;
  detail?: string;
}

const results: Result[] = [];

async function test(
  name: string,
  method: string,
  path: string,
  opts: {
    auth?: boolean;
    body?: unknown;
    expect: (status: number, body: any) => boolean;
  },
) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {};
  if (opts.auth && API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  if (opts.body) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("json") ? await res.json() : await res.text();
    const pass = opts.expect(res.status, body);
    results.push({ name, pass, detail: pass ? undefined : `status=${res.status}` });
    console.log(pass ? green("  PASS") : red("  FAIL"), name, pass ? "" : dim(`(status=${res.status})`));
  } catch (err: any) {
    results.push({ name, pass: false, detail: err.message });
    console.log(red("  FAIL"), name, dim(`(${err.message})`));
  }
}

async function main() {
  console.log(bold(`\nSmoke testing ${BASE}\n`));

  // --- Public endpoints ---
  console.log(bold("Public endpoints:"));

  await test("GET /api/v1/public-lookup?slug=openai", "GET", "/api/v1/public-lookup?slug=openai", {
    expect: (s, b) => s === 200 && (b.score !== undefined || b.status !== undefined),
  });

  await test("GET /api/v1/openapi.json", "GET", "/api/v1/openapi.json", {
    expect: (s, b) => s === 200 && b.openapi !== undefined,
  });

  await test("GET /api/v1/api-index", "GET", "/api/v1/api-index", {
    expect: (s, b) => s === 200 && b.endpoints !== undefined,
  });

  // --- Authenticated endpoints ---
  if (API_KEY) {
    console.log(bold("\nAuthenticated endpoints:"));

    await test("GET /api/v1/lookup?slug=openai", "GET", "/api/v1/lookup?slug=openai", {
      auth: true,
      expect: (s) => s === 200,
    });

    await test("GET /api/v1/usage", "GET", "/api/v1/usage", {
      auth: true,
      expect: (s, b) => s === 200 && b.plan !== undefined,
    });

    await test("POST /api/v1/batch", "POST", "/api/v1/batch", {
      auth: true,
      body: { slugs: ["openai"] },
      expect: (s) => s === 200,
    });

    await test("GET /api/v1/alerts?slug=openai", "GET", "/api/v1/alerts?slug=openai", {
      auth: true,
      expect: (s) => s === 200,
    });

    await test("GET /api/v1/services/openai", "GET", "/api/v1/services/openai", {
      auth: true,
      expect: (s) => s === 200,
    });
  } else {
    console.log(dim("\nSkipping authenticated endpoints (API_KEY not set)"));
  }

  // --- Summary ---
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const allPassed = passed === total;

  console.log(
    bold(`\nSummary: ${allPassed ? green(`${passed}/${total} passed`) : red(`${passed}/${total} passed`)}\n`),
  );

  process.exit(allPassed ? 0 : 1);
}

main();

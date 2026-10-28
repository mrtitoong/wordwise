/**
 * Tra IP của tên miền cho fetch-article (chặn tên miền trỏ vào mạng nội bộ). Dùng Deno.resolveDns
 * (cùng bộ phân giải với fetch()); môi trường không có hoặc không cho dùng thì hỏi DNS-over-HTTPS của
 * Cloudflare. Tra không được thì báo lỗi – fetchPage coi là không tải được, không tải liều.
 */

export type HostResolver = (host: string) => Promise<string[]>;

export type ResolveDns = (host: string, type: "A" | "AAAA") => Promise<string[]>;

export const DOH_URL = "https://cloudflare-dns.com/dns-query";

const RECORD_TYPES = { A: 1, AAAA: 28 } as const;

/** Tên miền không có bản ghi loại này: không phải lỗi. */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "NotFound";
}

async function resolveDoh(host: string, fetchImpl: typeof fetch): Promise<string[]> {
  const out: string[] = [];
  for (const [type, code] of Object.entries(RECORD_TYPES)) {
    const url = `${DOH_URL}?name=${encodeURIComponent(host)}&type=${type}`;
    const response = await fetchImpl(url, { headers: { accept: "application/dns-json" } });
    if (!response.ok) throw new Error(`DoH ${response.status}`);
    const body = (await response.json()) as { Answer?: { type: number; data: string }[] };
    for (const answer of body.Answer ?? []) {
      if (answer.type === code) out.push(answer.data);
    }
  }
  return out;
}

export function createResolver(deps: {
  resolveDns?: ResolveDns;
  fetch: typeof fetch;
}): HostResolver {
  return async (host) => {
    if (deps.resolveDns) {
      const results = await Promise.allSettled([
        deps.resolveDns(host, "A"),
        deps.resolveDns(host, "AAAA"),
      ]);
      if (results.every((r) => r.status === "fulfilled" || isNotFound(r.reason))) {
        return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      }
    }
    return resolveDoh(host, deps.fetch);
  };
}

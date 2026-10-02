// Stub for @vercel/oidc: the real package requires node:fs at load time, which
// crashes the edge server. The app never authenticates via Vercel OIDC.
export function getContext(): { headers?: Record<string, string> } {
  return {};
}
export async function getVercelOidcToken(): Promise<string> {
  throw new Error("Vercel OIDC is not available in this runtime");
}

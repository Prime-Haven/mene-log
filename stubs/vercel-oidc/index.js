// Stub: the real package loads node:fs at startup, which crashes the edge server.
export function getContext() { return {}; }
export async function getVercelOidcToken() { throw new Error("Vercel OIDC unavailable"); }
export async function getVercelOidcTokenSync() { throw new Error("Vercel OIDC unavailable"); }

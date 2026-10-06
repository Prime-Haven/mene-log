// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  plugins: [
    {
      // Stubs for edge-incompatible and WebAssembly packages:
      // 1. @vercel/oidc loads node:fs which crashes edge runtime.
      // 2. @streamdown/code pulls in shiki/dist/onig.wasm which triggers unwasm module "env" error.
      name: "stub-edge-incompatible-modules",
      enforce: "pre",
      resolveId(id) {
        if (id === "@vercel/oidc") {
          return new URL("./src/lib/vercel-oidc-stub.ts", import.meta.url).pathname;
        }
        if (id === "@streamdown/code") {
          return new URL("./src/lib/streamdown-code-stub.ts", import.meta.url).pathname;
        }
        return null;
      },
    },
  ],
  vite: {
    // Public browser configuration must be present in the compiled bundle.
    // Lovable Cloud normally injects these values, while these non-secret
    // fallbacks keep published auth and data pages functional if injection is
    // unavailable during a deployment. Private credentials remain server-only.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        "https://pmkimlbvdzgduxgxucsx.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_UWtwnrZyj1q_4jHqR4517w_yt1pXFUQ",
      ),
    },
  },
});

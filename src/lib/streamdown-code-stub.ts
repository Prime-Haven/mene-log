/**
 * Clean, WebAssembly-free stub for @streamdown/code
 * Eliminates shiki and onig.wasm dependencies, resolving:
 * "[plugin unwasm] Failed to load the WebAssembly module: Cannot resolve module 'env'"
 */

export interface CodePluginOptions {
  themes?: [string, string];
}

export function createCodePlugin(options: CodePluginOptions = {}) {
  const themes = options.themes ?? ["github-light", "github-dark"];
  return {
    name: "shiki" as const,
    type: "code-highlighter" as const,
    supportsLanguage(_lang: string) {
      return true;
    },
    getSupportedLanguages() {
      return ["typescript", "javascript", "json", "html", "css", "sql", "markdown", "text"];
    },
    getThemes() {
      return themes;
    },
    highlight() {
      return null;
    },
  };
}

export const code = createCodePlugin();
export default code;

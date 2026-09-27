import { Component, type ReactNode } from "react";

// Keeps a single failing piece of rendered content (e.g. an AI answer with
// unusual formatting) from taking down the whole page.
export class SafeRender extends Component<{ fallback: ReactNode; children: ReactNode; resetKey?: unknown }, { failed: boolean; key?: unknown }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { failed: boolean; key?: unknown }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  componentDidCatch(error: unknown) {
    console.error("[SafeRender]", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

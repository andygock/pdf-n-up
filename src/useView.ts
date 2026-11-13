import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { pageTitles } from "./format.ts";

export type View = keyof typeof pageTitles;
const viewFromHash = (): View => {
  const hash = window.location?.hash;
  return hash === "#view-guide"
    ? "guide"
    : hash === "#view-privacy"
      ? "privacy"
      : "convert";
};

export function useView() {
  const [view, setView] = useState<View>(viewFromHash);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const activeView = useRef(view);
  const positions = useRef<
    Partial<Record<View, { top: number; focus: HTMLElement | null }>>
  >({});
  useEffect(() => {
    const remember = () => {
      const previous = positions.current[activeView.current];
      positions.current[activeView.current] = {
        top: mainRef.current?.scrollTop ?? 0,
        focus: previous?.focus ?? null,
      };
    };
    const focus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof window.HTMLElement)) return;
      if (!target.closest("main, #dropZone") || target.closest("[hidden]"))
        return;
      remember();
      const position = positions.current[activeView.current];
      if (position) position.focus = target;
    };
    const navigate = () => {
      remember();
      setView(viewFromHash());
    };
    const main = mainRef.current;
    main?.addEventListener("scroll", remember);
    document.addEventListener("focusin", focus);
    window.addEventListener("hashchange", navigate);
    return () => {
      main?.removeEventListener("scroll", remember);
      document.removeEventListener("focusin", focus);
      window.removeEventListener("hashchange", navigate);
    };
  }, []);
  useLayoutEffect(() => {
    if (view === activeView.current) return;
    activeView.current = view;
    const saved = positions.current[view];
    if (mainRef.current) mainRef.current.scrollTop = saved?.top ?? 0;
    // Restore only controls that still belong to the visible destination.
    const previous = saved?.focus;
    const target =
      previous?.isConnected && !previous.closest("[hidden], :disabled")
        ? previous
        : view === "convert"
          ? document.getElementById("selectFileButton")
          : headingRef.current;
    target?.focus({ preventScroll: true });
  }, [view]);
  return { view, setView, headingRef, mainRef };
}

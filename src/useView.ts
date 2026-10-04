import { useEffect, useRef, useState } from "react";
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
  const focusRequested = useRef(false);
  useEffect(() => {
    const navigate = () => {
      focusRequested.current = true;
      setView(viewFromHash());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    // The destination heading does not exist until React commits the new view.
    const target =
      view === "convert"
        ? document.getElementById("selectFileButton")
        : headingRef.current;
    target?.focus({ preventScroll: true });
  }, [view]);
  return { view, setView, headingRef };
}

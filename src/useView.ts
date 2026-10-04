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
  useEffect(() => {
    const navigate = () => {
      setView(viewFromHash());
      window.scrollTo({ top: 0, behavior: "smooth" });
      headingRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  return { view, setView, headingRef };
}

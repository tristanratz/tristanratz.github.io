import { useEffect, useLayoutEffect } from "react";

// The site is also rendered ahead of time in Node (see scripts/prerender.mjs), where there is no window.
export const isBrowser = typeof window !== "undefined";

export const prefersReducedMotion = () =>
    isBrowser && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** useLayoutEffect in the browser, useEffect on the server (where layout effects don't run and only warn). */
export const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect;

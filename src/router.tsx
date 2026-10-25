import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { isBrowser } from "./env";

export type Lang = "en" | "de";

export interface Route {
    lang: Lang;
    /** Slug of the project shown in the detail view, if any. */
    project: string | null;
}

/** Routes: /, /projects/<slug>/, /de/, /de/projects/<slug>/ */
export function parsePath(path: string): Route {
    const parts = path.split("/").filter(Boolean);
    const lang: Lang = parts[0] === "de" ? "de" : "en";
    if (lang === "de") parts.shift();
    const project = parts[0] === "projects" && parts[1] ? decodeURIComponent(parts[1]) : null;
    return { lang, project };
}

export const routePath = ({ lang, project }: Route) =>
    (lang === "de" ? "/de" : "") + (project ? `/projects/${project}/` : "/");

interface RouterValue {
    route: Route;
    /** `replace` swaps the current history entry instead of adding one (used when closing a project). */
    navigate: (to: Route, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue>({ route: { lang: "en", project: null }, navigate: () => {} });

/** Minimal router: the URL decides the language and which project is open. */
export function RouterProvider({ url, children }: { url?: string, children: ReactNode }) {
    const [route, setRoute] = useState(() => parsePath(url ?? (isBrowser ? window.location.pathname : "/")));

    useEffect(() => {
        const onPop = () => setRoute(parsePath(window.location.pathname));
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    const navigate = useCallback((to: Route, options: { replace?: boolean } = {}) => {
        const path = routePath(to);
        // Opening a project adds a history entry, so the back button closes it again.
        if (path !== window.location.pathname) {
            window.history[options.replace ? "replaceState" : "pushState"](null, "", path + window.location.search);
        }
        setRoute(to);
    }, []);

    return <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>;
}

export const useRoute = () => useContext(RouterContext);

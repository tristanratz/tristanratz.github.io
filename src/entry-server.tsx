// Server entry for pre-rendering: renders a page to HTML (see scripts/prerender.mjs).
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
import { parsePath, RouterProvider } from "./router";

export { allRoutes, headTags, pageMeta, sitemap } from "./seo";
export { parsePath };

export const render = (url: string) => renderToString(
    <StrictMode>
        <RouterProvider url={url}><App /></RouterProvider>
    </StrictMode>,
);

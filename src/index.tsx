import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/montserrat";
import "./styles/global.scss";
import App from "./App";
import { RouterProvider } from "./router";

const container = document.getElementById("root")!;
const app = (
    <React.StrictMode>
        <RouterProvider><App /></RouterProvider>
    </React.StrictMode>
);

// Pages are pre-rendered at build time; the browser takes over that HTML instead of rebuilding it.
if (container.hasChildNodes()) hydrateRoot(container, app);
else createRoot(container).render(app);

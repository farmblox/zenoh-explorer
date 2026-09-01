/**
 * Entry point. Boots the backend bridge, then renders.
 *
 * `bootstrap` is awaited before the first render so the app never paints an
 * empty session list it is about to replace a frame later.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/App";
import { bootstrap } from "@/app/bootstrap";
import "@/styles/index.css";

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");

await bootstrap();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

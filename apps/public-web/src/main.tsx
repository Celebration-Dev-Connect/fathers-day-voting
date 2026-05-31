import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "@carshow/carshow-components/styles.css";
import { PUBLIC_BASE_PATH } from "./config";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={PUBLIC_BASE_PATH}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

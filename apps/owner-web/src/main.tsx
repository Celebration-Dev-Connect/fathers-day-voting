import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@carshow/carshow-components/styles.css";
import { App } from "./App";
import { PUBLIC_BASE_PATH } from "./config";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={PUBLIC_BASE_PATH}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

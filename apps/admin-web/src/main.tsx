import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@carshow/carshow-components/styles.css";
import "./help.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

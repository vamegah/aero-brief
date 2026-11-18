import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { FeaturesProvider } from "./features/FeaturesProvider";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/primitives.css";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <StrictMode>
    <FeaturesProvider>
      <App />
    </FeaturesProvider>
  </StrictMode>,
);

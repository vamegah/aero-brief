import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { FeaturesProvider } from "./features/FeaturesProvider";
import { ThemeController } from "./theme/ThemeController";
import "./styles/tokens.css";
import "./styles/tokens-phase2.css";
import "./styles/themes.css";
import "./styles/app.css";
import "./styles/primitives.css";
import "./styles/display-settings.css";
import "./styles/freshness.css";
import "./styles/webhook-settings.css";
import "./styles/digest-settings.css";
import "./index.css";
import "./styles/shell.css";
import "./styles/tables.css";
import "./styles/controls.css";
import "./styles/settings.css";
import "./styles/surfaces.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <StrictMode>
    <FeaturesProvider>
      <ThemeController />
      <App />
    </FeaturesProvider>
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import App from "./App";
import { initReaderBridge } from "./lib/reader";
import { initSettingsBridge } from "./lib/settings";

void initSettingsBridge();
void initReaderBridge();

const container = document.getElementById("root");
if (!container) throw new Error("缺少根节点");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

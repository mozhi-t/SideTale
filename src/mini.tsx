import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { MiniReader } from "./mini/MiniReader";
import { initReaderBridge } from "./lib/reader";
import { api } from "./lib/api";
import { getSettings, initSettingsBridge } from "./lib/settings";

void initSettingsBridge();
void initReaderBridge();

const settings = getSettings();
if (settings.privacyProtection) {
  void api.setPrivacyProtection(true).catch(() => undefined);
}

const container = document.getElementById("root");
if (!container) throw new Error("缺少根节点");

createRoot(container).render(
  <StrictMode>
    <MiniReader />
  </StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import {
  installMobileNativeStorageAdapter,
  isMobileStorageUnreadable,
} from "@/services/storage/installMobileNativeStorage";
import "./styles/global.css";

function renderFatal(root: HTMLElement, message: string): void {
  root.textContent = message;
}

async function boot(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;
  try {
    if (isMobileHost()) {
      await installMobileNativeStorageAdapter();
      if (isMobileStorageUnreadable()) {
        renderFatal(
          root,
          "Your existing wallet data could not be opened. It has not been deleted. Do not create or import another wallet until you export diagnostics or recover the original file.",
        );
        return;
      }
    }
    const { default: App } = await import("./App");
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch {
    renderFatal(
      root,
      "Get NowHere could not open local storage. WebView storage was not used.",
    );
  }
}

void boot();

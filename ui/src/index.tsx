import type { Dispose } from "@tokimo/sdk";
import { RuntimeProvider, defineApp } from "@tokimo/sdk";
import { ConfigProvider, ToastProvider, enUS as uiEnUS, zhCN as uiZhCN } from "@tokimo/ui";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import "./index.css";

export default defineApp({
  id: "qq-music",
  manifest: {
    id: "qq-music",
    appName: "QQ音乐",
    icon: "Music2",
    color: "#00d47e",
    windowType: "qq-music",
    defaultSize: { width: 1280, height: 850 },
    titleBarStyle: "overlay",
    fullBleed: true,
    category: "app",
  },
  mount(container, ctx): Dispose {
    const root: Root = createRoot(container);
    const locale = ctx.locale.startsWith("zh") ? uiZhCN : uiEnUS;
    root.render(
      <StrictMode>
        <RuntimeProvider value={ctx}>
          <ConfigProvider locale={locale}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ConfigProvider>
        </RuntimeProvider>
      </StrictMode>,
    );
    return () => root.unmount();
  },
});

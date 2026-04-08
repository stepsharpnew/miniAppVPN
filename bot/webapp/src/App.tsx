import WebApp from "@twa-dev/sdk";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { BottomNav, type TabId } from "./components/BottomNav";
import { ChannelSubscribeGate } from "./components/ChannelSubscribeGate";
import { Preloader } from "./components/Preloader";
import { InstructionsPage } from "./pages/InstructionsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PurchasePage } from "./pages/PurchasePage";
import { SupportPage } from "./pages/SupportPage";
import { waitForTelegramInitData } from "./utils/telegramInitData";

function initialTabFromLocation(): TabId {
  if (typeof window === "undefined") return "profile";
  const raw = window.location.hash.replace(/^#/, "").split(/[?&]/)[0];
  const valid: TabId[] = ["purchase", "profile", "instructions", "support"];
  return valid.includes(raw as TabId) ? (raw as TabId) : "profile";
}

const DEFAULT_CHANNEL_URL = "https://t.me/MemeVPNbest";

async function fetchChannelSubscription(): Promise<{
  subscribed: boolean;
  channelUrl: string;
}> {
  const initData = await waitForTelegramInitData();
  if (!initData) {
    return { subscribed: false, channelUrl: DEFAULT_CHANNEL_URL };
  }
  const r = await fetch("/api/channel-subscription", {
    headers: { "X-Telegram-Init-Data": initData },
  });
  if (!r.ok) {
    return { subscribed: false, channelUrl: DEFAULT_CHANNEL_URL };
  }
  const data = (await r.json()) as {
    subscribed?: boolean;
    channelUrl?: string | null;
  };
  return {
    subscribed: Boolean(data.subscribed),
    channelUrl: data.channelUrl?.trim() || DEFAULT_CHANNEL_URL,
  };
}

const pageStyle: CSSProperties = {
  transition: "opacity 0.2s ease, transform 0.2s ease",
};

const hiddenStyle: CSSProperties = {
  ...pageStyle,
  opacity: 0,
  transform: "translateY(8px)",
  pointerEvents: "none",
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
};

const visibleStyle: CSSProperties = {
  ...pageStyle,
  opacity: 1,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(initialTabFromLocation);
  const [boot, setBoot] = useState<"loading" | "gate" | "app">("loading");
  const [gateChannelUrl, setGateChannelUrl] = useState(DEFAULT_CHANNEL_URL);
  const [splash, setSplash] = useState(true);

  const runChannelCheck = useCallback(async () => {
    try {
      const { subscribed, channelUrl } = await fetchChannelSubscription();
      setGateChannelUrl(channelUrl);
      if (subscribed) {
        setBoot("app");
        return;
      }
      setBoot("gate");
    } catch {
      setGateChannelUrl(DEFAULT_CHANNEL_URL);
      setBoot("gate");
    }
  }, []);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    WebApp.setHeaderColor("#0A0A1A");
    WebApp.setBackgroundColor("#0A0A1A");
    void runChannelCheck();
  }, [runChannelCheck]);

  useEffect(() => {
    if (boot !== "app") return;
    const timer = setTimeout(() => setSplash(false), 1500);
    return () => clearTimeout(timer);
  }, [boot]);

  const showPreloader = boot === "loading" || (boot === "app" && splash);

  return (
    <>
      <Preloader visible={showPreloader} />
      {boot === "gate" ? (
        <ChannelSubscribeGate
          channelUrl={gateChannelUrl}
          onRecheck={runChannelCheck}
        />
      ) : null}
      {boot === "app" ? (
        <>
          <div
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overscrollBehaviorY: "contain",
              WebkitOverflowScrolling: "touch",
              paddingBottom:
                "calc(60px + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            hidden={splash}
          >
            <div style={activeTab === "purchase" ? visibleStyle : hiddenStyle}>
              <PurchasePage active={activeTab === "purchase"} />
            </div>
            <div style={activeTab === "profile" ? visibleStyle : hiddenStyle}>
              <ProfilePage />
            </div>
            <div
              style={activeTab === "instructions" ? visibleStyle : hiddenStyle}
            >
              <InstructionsPage />
            </div>
            <div style={activeTab === "support" ? visibleStyle : hiddenStyle}>
              <SupportPage active={activeTab === "support"} />
            </div>
          </div>
          {!splash ? (
            <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

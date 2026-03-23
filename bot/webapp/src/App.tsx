import WebApp from "@twa-dev/sdk";
import { useEffect, useState } from "react";
import { BottomNav, type TabId } from "./components/BottomNav";
import { Preloader } from "./components/Preloader";
import { InstructionsPage } from "./pages/InstructionsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PurchasePage } from "./pages/PurchasePage";
import { SupportPage } from "./pages/SupportPage";

const pageStyle: React.CSSProperties = {
  transition: "opacity 0.2s ease, transform 0.2s ease",
};

const hiddenStyle: React.CSSProperties = {
  ...pageStyle,
  opacity: 0,
  transform: "translateY(8px)",
  pointerEvents: "none",
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
};

const visibleStyle: React.CSSProperties = {
  ...pageStyle,
  opacity: 1,
  transform: "translateY(0)",
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("purchase");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    WebApp.setHeaderColor("#0A0A1A");
    WebApp.setBackgroundColor("#0A0A1A");

    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Preloader visible={loading} />
      <div
        style={{
          position: "relative",
          flex: 1,
          overflowY: "auto",
          paddingBottom: 70,
        }}
      >
        <div style={activeTab === "purchase" ? visibleStyle : hiddenStyle}>
          <PurchasePage active={activeTab === "purchase"} />
        </div>
        <div style={activeTab === "profile" ? visibleStyle : hiddenStyle}>
          <ProfilePage />
        </div>
        <div style={activeTab === "instructions" ? visibleStyle : hiddenStyle}>
          <InstructionsPage />
        </div>
        <div style={activeTab === "support" ? visibleStyle : hiddenStyle}>
          <SupportPage />
        </div>
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}

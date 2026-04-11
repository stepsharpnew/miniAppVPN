import { useState, type CSSProperties } from "react";
import { BottomNav, type TabId } from "./components/BottomNav";
import { HomePage } from "./pages/HomePage";
import { PricingPage } from "./pages/PricingPage";
import { InstructionsPage } from "./pages/InstructionsPage";
import { FaqPage } from "./pages/FaqPage";

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
  const [activeTab, setActiveTab] = useState<TabId>("home");

  return (
    <>
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehaviorY: "contain",
          WebkitOverflowScrolling: "touch",
          paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <div style={activeTab === "home" ? visibleStyle : hiddenStyle}>
          <HomePage onNavigate={setActiveTab as (tab: "pricing") => void} />
        </div>
        <div style={activeTab === "pricing" ? visibleStyle : hiddenStyle}>
          <PricingPage />
        </div>
        <div style={activeTab === "instructions" ? visibleStyle : hiddenStyle}>
          <InstructionsPage />
        </div>
        <div style={activeTab === "faq" ? visibleStyle : hiddenStyle}>
          <FaqPage />
        </div>
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}

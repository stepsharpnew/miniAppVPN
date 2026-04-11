import { useState, type CSSProperties } from "react";
import { Navbar, type TabId } from "./components/Navbar";
import { ProfilePage } from "./pages/ProfilePage";
import { PricingPage } from "./pages/PricingPage";
import { InstructionsPage } from "./pages/InstructionsPage";
import { FaqPage } from "./pages/FaqPage";

const pageStyle: CSSProperties = {
  transition: "opacity 0.25s ease, transform 0.25s ease",
};

const hiddenStyle: CSSProperties = {
  ...pageStyle,
  opacity: 0,
  transform: "translateY(6px)",
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
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <>
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      <main
        style={{
          position: "relative",
          flex: 1,
          width: "100%",
          maxWidth: "var(--content-max-width)",
          margin: "0 auto",
          padding: "24px 16px 48px",
        }}
      >
        <div style={activeTab === "profile" ? visibleStyle : hiddenStyle}>
          <ProfilePage onNavigate={setActiveTab as (tab: "pricing") => void} />
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
      </main>
    </>
  );
}

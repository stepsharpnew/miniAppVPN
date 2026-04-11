import { useState } from "react";
import { Navbar, type TabId } from "./components/Navbar";
import { ProfilePage } from "./pages/ProfilePage";
import { PricingPage } from "./pages/PricingPage";
import { InstructionsPage } from "./pages/InstructionsPage";
import { FaqPage } from "./pages/FaqPage";
import { SupportPage } from "./pages/SupportPage";
import { AuthPage } from "./pages/AuthPage";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const auth = useAuth();

  if (activeTab === "profile" && !auth.user && !auth.loading) {
    return (
      <>
        <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="page-container">
          <AuthPage onSuccess={auth.refresh} />
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="page-container">
        {activeTab === "profile" && (
          <ProfilePage user={auth.user} onLogout={auth.logout} onNavigate={setActiveTab as (tab: "pricing") => void} />
        )}
        {activeTab === "pricing" && <PricingPage user={auth.user} />}
        {activeTab === "instructions" && <InstructionsPage />}
        {activeTab === "support" && <SupportPage user={auth.user} />}
        {activeTab === "faq" && <FaqPage />}
      </main>
    </>
  );
}

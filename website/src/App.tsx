import { useCallback, useEffect, useState } from "react";
import { BottomNav, type TabId } from "./components/BottomNav";
import { ProfilePage } from "./pages/ProfilePage";
import { PricingPage } from "./pages/PricingPage";
import { InstructionsPage } from "./pages/InstructionsPage";
import { ReferralPage } from "./pages/ReferralPage";
import { SupportPage } from "./pages/SupportPage";
import { AuthPage } from "./pages/AuthPage";
import { useAuth } from "./hooks/useAuth";

const AUTH_REQUIRED_TABS = new Set<TabId>(["profile", "referral", "support"]);

function tabFromHash(): TabId {
  if (typeof window === "undefined") return "profile";
  const raw = window.location.hash.replace(/^#/, "").split(/[?&]/)[0];
  if (raw === "pricing") return "purchase";
  const valid: TabId[] = ["profile", "purchase", "referral", "instructions", "support"];
  return valid.includes(raw as TabId) ? (raw as TabId) : "profile";
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(tabFromHash);
  const auth = useAuth();

  useEffect(() => {
    const onHashChange = () => setActiveTab(tabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (typeof window !== "undefined" && window.location.hash !== `#${tab}`) {
      window.location.hash = tab;
    }
  }, []);

  const needsAuth = AUTH_REQUIRED_TABS.has(activeTab);
  const showAuth = needsAuth && !auth.user && !auth.loading;

  if (showAuth) {
    return (
      <>
        <main className="page-container">
          <AuthPage onSuccess={auth.refresh} />
        </main>
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </>
    );
  }

  return (
    <>
      <main className="page-container">
        {activeTab === "profile" && (
          <ProfilePage
            user={auth.user}
            onLogout={auth.logout}
            onNavigate={handleTabChange}
          />
        )}
        {activeTab === "purchase" && (
          <PricingPage user={auth.user} onPaymentSuccess={() => handleTabChange("profile")} />
        )}
        {activeTab === "referral" && <ReferralPage user={auth.user} />}
        {activeTab === "instructions" && <InstructionsPage />}
        {activeTab === "support" && <SupportPage user={auth.user} />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </>
  );
}

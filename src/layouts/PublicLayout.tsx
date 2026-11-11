import type { FC } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Nav } from "../sections/Nav";
import { Footer } from "../sections/Footer";
import { MobileStickyBar } from "../components/MobileStickyBar";

export const PublicLayout: FC = () => {
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Compact Floating Navigation Bar */}
      <Nav />

      {/* Main Content Area: systematically offsets page content to prevent navbar overlap on subpages */}
      <main className={`flex-1 w-full ${isHomePage ? "" : "pt-20 sm:pt-24"}`}>
        <Outlet />
      </main>

      {/* Deep Navy Footer */}
      <Footer />

      {/* Mobile Sticky Register Bar (appears after hero scrolls out) */}
      <MobileStickyBar />
    </div>
  );
};

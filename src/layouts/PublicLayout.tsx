import type { FC } from "react";
import { Outlet } from "react-router-dom";
import { Nav } from "../sections/Nav";
import { Footer } from "../sections/Footer";
import { MobileStickyBar } from "../components/MobileStickyBar";

export const PublicLayout: FC = () => {
  return (
    <div className="flex flex-col min-h-screen bg-[#FAF9F4] text-[#191936]">
      {/* Sticky Pill Navigation */}
      <Nav />

      {/* Main Content Area */}
      <main className="flex-1 w-full">
        <Outlet />
      </main>

      {/* Deep Navy Footer */}
      <Footer />

      {/* Mobile Sticky Register Bar (appears after hero scrolls out) */}
      <MobileStickyBar />
    </div>
  );
};

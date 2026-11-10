import React from "react";
import { Outlet } from "react-router-dom";

/**
 * AdminLayout
 * Strictly isolated: no public nav, no public footer, no public styles.
 */
export const AdminLayout: React.FC = () => {
  return (
    <div
      dir="ltr"
      style={{
        backgroundColor: "#F8F7FC",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Manrope', sans-serif",
        color: "#151535",
        padding: "24px",
      }}
    >
      <Outlet />
    </div>
  );
};

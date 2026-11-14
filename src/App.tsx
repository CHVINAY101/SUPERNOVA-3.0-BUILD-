import { Routes, Route, Navigate } from "react-router-dom";
import { PublicLayout } from "./layouts/PublicLayout";
import { AdminGuard } from "./components/admin/AdminGuard";

// Public Pages
import { HomePage } from "./pages/HomePage";
import { RegisterPage } from "./pages/RegisterPage";
import { GalleryPage } from "./pages/GalleryPage";
import About from "./pages/public/About";
import Events from "./pages/public/Events";
import Schedule from "./pages/public/Schedule";
import Contact from "./pages/public/Contact";
import Esports from "./pages/public/Esports";
import Announcements from "./pages/public/Announcements";
import Sponsors from "./pages/public/Sponsors";
import EsportsLive from "./pages/public/EsportsLive";
import ScienceExpo from "./pages/public/ScienceExpo";
import SchoolExhibition from "./pages/public/SchoolExhibition";
import Animation from "./pages/public/Animation";
import VisitorInfo from "./pages/public/VisitorInfo";
import Privacy from "./pages/public/Privacy";

// Admin Pages
import AdminLayout from "./pages/admin/AdminLayout";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCheckin from "./pages/admin/AdminCheckin";
import AdminEsportsControl from "./pages/admin/AdminEsportsControl";
import AdminRegistrationControls from "./pages/admin/AdminRegistrationControls";
import AdminParticipationRegistrations from "./pages/admin/AdminParticipationRegistrations";
import AdminEsportsRegistrations from "./pages/admin/AdminEsportsRegistrations";
import AdminVisitorRegistrations from "./pages/admin/AdminVisitorRegistrations";
import AdminSchedule from "./pages/admin/AdminSchedule";
import AdminAnnouncements from "./pages/admin/AdminAnnouncements";
import AdminContent from "./pages/admin/AdminContent";
import AdminMedia from "./pages/admin/AdminMedia";
import AdminGallery from "./pages/admin/AdminGallery";
import AdminSponsors from "./pages/admin/AdminSponsors";
import AdminFaqs from "./pages/admin/AdminFaqs";
import AdminGames from "./pages/admin/AdminGames";
import AdminInstitutions from "./pages/admin/AdminInstitutions";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminFormOptions from "./pages/admin/AdminFormOptions";
import AdminAuditLogs from "./pages/admin/AdminAuditLogs";
import AdminSystemReadiness from "./pages/admin/AdminSystemReadiness";
import AdminDataExports from "./pages/admin/AdminDataExports";
import AdminCrmEmails from "./pages/admin/AdminCrmEmails";
import AdminUsers from "./pages/admin/AdminUsers";

export default function App() {
  return (
    <Routes>
      {/* Public Pages with Nav, Footer, MobileStickyBar */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<About />} />
        <Route path="/events" element={<Events />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/esports" element={<Esports />} />
        <Route path="/sponsors" element={<Sponsors />} />
        <Route path="/updates" element={<Announcements />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/esports" element={<Navigate to="/register?type=esports" replace />} />
        <Route path="/register/participation" element={<Navigate to="/register?type=participation" replace />} />
        <Route path="/register/visitor" element={<Navigate to="/register?type=visitor" replace />} />
        <Route path="/esports/live" element={<EsportsLive />} />
        <Route path="/science-expo" element={<ScienceExpo />} />
        <Route path="/school-exhibition" element={<SchoolExhibition />} />
        <Route path="/animation" element={<Animation />} />
        <Route path="/visitor-info" element={<VisitorInfo />} />
        <Route path="/privacy" element={<Privacy />} />
      </Route>

      {/* Staff redirect to checkin */}
      <Route path="/staff" element={<Navigate to="/admin/checkin" replace />} />

      {/* Admin Login (Public entry to Admin Area) */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Strictly Protected Admin Control Centre & Staff Operations */}
      <Route
        path="/admin"
        element={
          <AdminGuard>
            <AdminLayout />
          </AdminGuard>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="checkin" element={<AdminCheckin />} />
        <Route path="esports-control" element={<AdminEsportsControl />} />
        <Route path="registration-controls" element={<AdminRegistrationControls />} />
        <Route path="participation-registrations" element={<AdminParticipationRegistrations />} />
        <Route path="esports-registrations" element={<AdminEsportsRegistrations />} />
        <Route path="visitor-registrations" element={<AdminVisitorRegistrations />} />
        <Route path="crm-emails" element={<AdminCrmEmails />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="schedule" element={<AdminSchedule />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="content" element={<AdminContent />} />
        <Route path="media" element={<AdminMedia />} />
        <Route path="gallery" element={<AdminGallery />} />
        <Route path="sponsors" element={<AdminSponsors />} />
        <Route path="faqs" element={<AdminFaqs />} />
        <Route path="games" element={<AdminGames />} />
        <Route path="institutions" element={<AdminInstitutions />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="form-options" element={<AdminFormOptions />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
        <Route path="system-readiness" element={<AdminSystemReadiness />} />
        <Route path="data-exports" element={<AdminDataExports />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      {/* Fallback to Home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

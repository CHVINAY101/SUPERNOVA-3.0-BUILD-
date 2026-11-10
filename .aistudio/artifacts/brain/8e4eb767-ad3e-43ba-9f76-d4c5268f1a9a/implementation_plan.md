# Supernova 3.0 — Complete Event Platform Implementation Plan

## Executive Summary & Architectural Overview

This plan coordinates the development of the entire **Supernova 3.0 Digital Event Platform** for the National Education Society of Karnataka institutions and the Department of Animation. 

The platform connects three core pillars sharing a single central database architecture and role-based access control system:
1. **Public Event Website**: Central interactive Supernova Broadcast retro television centerpiece, information pages (About, Events, Schedule, Gallery, Sponsors, Announcements, FAQs, Contact), and mobile-first registration portal.
2. **Main Admin Control Centre**: Full operational dashboard, registration approval desk, team/player manager, esports bracket coordinator, CMS, announcement publisher, sponsor manager, audit logger, and reports/export engines.
3. **Staff Operations Portal**: Role-segregated workspaces for Super Admins, Event Admins, Esports Operators, Check-in Desk Staff (Nov 20 & 21 check-in and on-spot registrations), and Content Managers.

---

## 1. Existing Project Audit & Reuse Strategy

| Module | Existing State | Plan Action |
| :--- | :--- | :--- |
| **Routing (`src/App.tsx`)** | Public routes working; `/admin` was temporarily pointing to `AdminStub.tsx`. | **Wire All Admin Routes**: Connect `/admin/login`, `/admin` (dashboard), and all 16 administrative sub-modules under `AdminGuard` and `AdminLayout`. |
| **Auth & Security (`src/lib/auth.tsx`)** | Supabase Auth context with role verification (`is_admin`, `user_roles`). | **Expand Roles**: Support `super_admin`, `event_admin`, `esports_operator`, `checkin_staff`, and `content_manager`. Add demo role-switcher for immediate testing. |
| **Database & Mocking (`src/lib/supabase.ts`)** | Dual-mode: real Supabase client when configured, complete responsive in-memory/localStorage store when in Demo Mode (`VITE_USE_MOCK=true`). | **Extend Schema**: Add structured tables for 4 Esports games (Valorant, BGMI, Free Fire, Mobile Legends), dynamic rosters, match schedules, 2-day attendance, and email previews. |
| **Public Website (`src/pages/`)** | Refined Retro Television Hero with scroll-triggered navigation, About, Events, Schedule, Gallery, Contact, and Organisers. | **Preserve & Connect CMS**: Retain approved visual identity (Warm Cream, Ink Navy, Electric Blue, Fresh Lime, Warm Orange), wire live CMS content and announcements from database. |
| **Public Registration (`src/pages/RegisterPage.tsx`)** | Generic forms for Participation, Visitor, and Esports. | **Revamp Esports Registration**: Build dynamic game-specific roster builder, "complete roster later" option, institution validation, and reference ID generation (`SN3-VLR-0001`, etc.). |
| **Check-in Desk (`src/pages/admin/AdminCheckin.tsx`)** | Basic multi-table search and check-in. | **Enhance**: Add 2-day event attendance (Nov 20 vs Nov 21), duplicate check-in alerts, desk operator attribution, and on-spot registration workflow. |

---

## 2. Platform Architecture & Data Flow

```
                      [ CENTRAL SUPABASE / POSTGRESQL DATABASE ]
                                          ▲
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
       [ PUBLIC EVENT WEBSITE ]                       [ SECURE AUTHENTICATED PORTAL ]
   - Supernova Broadcast Retro TV               - Role-Based Access Control (RLS & Guard)
   - Public Pages (About, Events, Schedule)      - Demo / Production Mode Switcher
   - Dynamic Team & Visitor Registration         
                   │                                             │
                   ▼                                             ▼
         [ Public Submissions ]                        [ Admin Control Centre & Staff Desks ]
      • Draft / Incomplete Roster                  1. Dashboard & Real-Time Telemetry
      • Pending Review (Reference ID)              2. Esports Management & Brackets
      • Instant Email Preview / Confirmation       3. Registration Approval Desk
                                                   4. Check-in Desk (Day 1 & Day 2)
                                                   5. On-Spot Registration
                                                   6. Website CMS & Announcements
                                                   7. Sponsor & Gallery Manager
                                                   8. CSV Reports & Audit Logs
```

---

## 3. Detailed Module Implementation Specifications

### Module 1: Admin Control Centre & Staff Operations Portal
- **Role Permissions Hierarchy**:
  - `super_admin`: Full access to all settings, staff roles, and exports.
  - `event_admin`: Manage general registrations, schedule, sponsors, announcements, and CMS.
  - `esports_operator`: Manage games, team approvals, player rosters, matches, scores, and esports check-in.
  - `checkin_staff`: Dedicated check-in workspace for Day 1 & Day 2, manual search, attendance logging, and on-spot entry.
  - `content_manager`: Manage page text, schedule, FAQs, gallery media, and announcements.
- **Login Experience (`/admin/login`)**:
  - Email/Password form with real Supabase authentication.
  - One-click Demo Role Selector (Super Admin, Esports Operator, Check-in Desk, Content Manager) for evaluation.
- **Unified Dashboard (`/admin`)**:
  - Live metric cards: Total Registrations (Esports Teams, Participation, Visitors), Pending Reviews, Approved Teams, Day 1 & Day 2 Attendance Counts, Live Match Count.
  - Game-wise summary breakdown.
  - Quick action alerts (e.g. "4 teams pending review", "2 rosters incomplete").
  - Recent audit trail.

### Module 2: Esports Management & Planning Rules
- **Configurable Games**:
  - **VALORANT**: Team size: 5, Substitutes: 0, Eligibility: College, Roster Changes: Not permitted, Registration state: Planned Open, Fee: TBD, Rules: Official standard competitive map pool.
  - **BGMI**: Team size: 4, Substitutes: TBD, Fee: TBD, Rules: Standard competitive placement scoring (TBD).
  - **FREE FIRE**: Team size: 4, Substitutes: TBD, Fee: TBD, Rules: Squad Battle Royale format (TBD).
  - **MOBILE LEGENDS**: Team size: 5, Substitutes: TBD, Fee: TBD, Rules: 5v5 MOBA format (TBD).
- **Admin Configuration Screen (`/admin/games`)**:
  - Add, edit, activate/deactivate games, toggle on-spot registration availability, set team limits and registration status.

### Module 3: Public Team Registration Journey (`/register`)
- **Step-by-step Flow**:
  1. **Game Selection**: Choose from active games with clear team size indicators and planning notices.
  2. **Team & Institution Identity**: Team Name and required Institution / College Name (The National College, National PU College, Dr. HNCE, etc., or guest institution).
  3. **Representative Details**: Captain/Rep Name, Email, Phone, Discord/In-Game Tag.
  4. **Dynamic Player Roster**:
     - Game-aware slots (e.g. 5 slots for Valorant, 4 slots for BGMI).
     - Option: *"Submit with initial details and complete roster before tournament deadline"*.
     - Player Name, Student ID, and Gamer Tag / In-game ID for each player.
  5. **Review & Declaration**: Agree to tournament eligibility declarations and privacy policy.
  6. **Submission & Reference Generation**:
     - Unique reference generated safely: `SN3-VLR-0001`, `SN3-BGMI-0001`, `SN3-FF-0001`, `SN3-ML-0001`.
     - Confirmation screen with reference badge, status indicator (`Under Review`), and print/save receipt option.

### Module 4: Registration Approval Desk (`/admin/esports-registrations`)
- **Status Lifecycle**: `Draft` → `Submitted / Pending` → `Incomplete Roster` → `Under Review` → `Correction Requested` → `Approved` / `Declined`.
- **Review Tools**:
  - Filter by game, status, institution, and search query.
  - Expandable team modal showing full roster, student IDs, and in-game handles.
  - Quick approval actions (`Approve Team`, `Request Correction`, `Decline`).
  - Internal Admin Notes box and action timestamp logging.
  - Notification trigger (marks email notification state).

### Module 5: Team & Player Management Database
- **Relational Integrity**:
  - `registrations` (Team record) linked to `players` (Individual roster entries).
  - Flag for duplicate gamer tags or duplicate phone numbers across teams.
  - Roster completion badge (e.g., *"5/5 Confirmed"* vs *"3/5 Incomplete"*).
  - CSV Export: Complete player sheet with Team Name, Captain, Player Name, In-Game ID, Institution, and Status.

### Module 6: Tournament Management & Match Coordinator (`/admin/esports-control`)
- **Match Management**:
  - Create match pairings between approved teams.
  - Set Round (Group Stage, Quarterfinals, Semifinals, Grand Finals), scheduled time, and station/desk.
  - Match status workflow: `Upcoming` → `Live` → `Completed`.
  - Enter and verify scores (e.g., Team A 2 - 1 Team B), declare match winner.
  - Public match ticker feed synchronization.

### Module 7: Event Operations & Check-in Desk (`/admin/checkin`)
- **Desk Operations Workspace**:
  - Instant lookup by Reference ID (`SN3-VLR-0001`), Team Name, Representative, or Phone.
  - Multi-desk selector (General Visitor Desk, Esports Arena Desk, Science/Animation Desk).
  - Separate 2-Day Attendance tracking:
    - **Day 1 (20 November 2026)** attendance timestamp & badge.
    - **Day 2 (21 November 2026)** attendance timestamp & badge.
  - Duplicate check-in detection with alert dialog.
  - Individual player check-in checkbox within an approved team.
  - **On-Spot Registration Desk**:
    - Direct modal for walk-in teams/visitors when permitted.
    - Submissions routed through organizer approval queue before tournament clearance.

### Module 8: Website Content Management, Sponsors & Announcements
- **CMS Modules**:
  - **Schedule Coordinator (`/admin/schedule`)**: Day 1 & Day 2 chronological program entries.
  - **Announcements Desk (`/admin/announcements`)**: Broadcast urgent updates, rules clarifications, or ceremony timings with pin/publish controls.
  - **Sponsors Manager (`/admin/sponsors`)**: Manage sponsor organizations, contact details, logo uploads, and recognition tiers (without promising unapproved stall benefits).
  - **Media & Gallery Manager (`/admin/gallery`, `/admin/media`)**: Curate photo archives and video reels.
  - **FAQs Manager (`/admin/faqs`)**: Manage question and answer cards.

### Module 9: Email Notification Simulator & Audit System
- **Transactional Templates**:
  1. *Registration Received*: Includes registration reference and roster status.
  2. *Team Approved*: Official badge, reporting venue, and instructions.
  3. *Correction Requested*: Organizer notes on missing player IDs or institutional verification.
  4. *Registration Declined*: Courteous notification with reason.
- **Delivery Log**:
  - Recipient email, template type, trigger timestamp, status (`Delivered (Mock)` or `Sent`).
  - Modal to view exact rendered email preview and trigger admin resend.
- **Audit Logs (`/admin/audit-logs`)**:
  - Logs actor identity, action name, target entity ID, and metadata.

### Module 10: Reports & CSV Export Engine
- Exportable structured CSV reports:
  - Game-wise Esports Teams Report.
  - Master Player Roster Sheet.
  - Pending Approvals Report.
  - Daily Attendance Register (Nov 20 & Nov 21).
  - Participation Projects & Visitor Registrations.

---

## 4. Database Schema Extensions

We will extend `src/types/database.ts` and the active store in `src/lib/supabase.ts` with:
- `game_categories`: Expanded game attributes (min/max roster, substitutes, rank restrictions, fee, open status).
- `player_roster`: Relational player entries with verification status, gamer tag, student ID.
- `attendance_logs`: Day 1 / Day 2 check-ins with operator ID and timestamps.
- `tournament_matches`: Round, Team A, Team B, score, status, winner ID.
- `email_logs`: Reference ID, recipient, template, sent status, preview payload.
- `audit_logs`: Operational action history.

---

## 5. Verification & Acceptance Plan

| Test Category | Target State | Verification Method |
| :--- | :--- | :--- |
| **Public Website Navigation** | Retro TV hero displays centrally without top nav initially; slides down smoothly on scroll. | Playwright browser automated test at `http://localhost:3000`. |
| **Esports Team Submission** | Submitting a Valorant team generates a unique `SN3-VLR-000X` reference and appears immediately in admin queue. | Form submission test & reference verification. |
| **Admin Login & Role Guard** | Admin login page permits super admin, esports operator, and staff logins; restricts unauthorized routes. | Route guard and session role inspection. |
| **Approval Workflow** | Admin approves team; status transitions from `pending` to `approved` with audit trail and email notification record. | Admin approval test on `/admin/esports-registrations`. |
| **Check-in Desk Operations** | Search by reference code or name; check in for Day 1 and Day 2; duplicate check-in triggers warning. | Check-in tests on `/admin/checkin`. |
| **Tournament Coordinator** | Create match between 2 approved teams, update scores, verify winner. | Match workflow test on `/admin/esports-control`. |
| **Reports Export** | CSV export downloads properly formatted tabular data. | Data export verification. |
| **Compilation & Linting** | Zero TypeScript compiler errors; zero lint errors. | `compile_applet` and `lint_applet` verification. |

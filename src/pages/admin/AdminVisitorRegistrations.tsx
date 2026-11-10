import { RegistrationManager, type RegistrationRow } from "@/components/admin/RegistrationManager";

const SELECT = "id, registration_ref, full_name, email, phone, institution, visitor_category, status, submitted_at";

function toRow(raw: Record<string, unknown>): RegistrationRow {
  return {
    id: String(raw.id),
    registration_ref: String(raw.registration_ref),
    status: String(raw.status),
    submitted_at: String(raw.submitted_at),
    email: String(raw.email),
    phone: String(raw.phone),
    institution: (raw.institution as string | null) ?? null,
    headline: String(raw.full_name),
    details: String(raw.visitor_category ?? "Category not provided"),
  };
}

export default function AdminVisitorRegistrations() {
  return <RegistrationManager title="Visitor registrations" table="visitor_registrations" select={SELECT} toRow={toRow} />;
}

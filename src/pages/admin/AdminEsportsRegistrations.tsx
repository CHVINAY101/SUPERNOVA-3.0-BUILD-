import { RegistrationManager, type RegistrationRow } from "@/components/admin/RegistrationManager";

const SELECT = "id, registration_ref, team_name, captain_name, email, phone, institution, status, submitted_at, games(title), players(player_name)";

function toRow(raw: Record<string, unknown>): RegistrationRow {
  const game = raw.games as { title?: string } | null;
  const players = (raw.players as { player_name: string }[] | null) ?? [];
  return {
    id: String(raw.id),
    registration_ref: String(raw.registration_ref),
    status: String(raw.status),
    submitted_at: String(raw.submitted_at),
    email: String(raw.email),
    phone: String(raw.phone),
    institution: (raw.institution as string | null) ?? null,
    headline: String(raw.team_name),
    details: `${game?.title ?? "Game to be announced"} · Representative: ${String(raw.captain_name)} · Players: ${players.map((p) => p.player_name).join(", ") || "None"}`,
  };
}

export default function AdminEsportsRegistrations() {
  return <RegistrationManager title="Esports registrations" table="registrations" select={SELECT} toRow={toRow} />;
}

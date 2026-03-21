import { normalizeEmail } from "../../../utils/validation";

export interface InvitationRequest {
  inviteeEmail: string;
  inviteeName: string;
  inviterName: string;
  inviterId: string;
  /** DB row id — included in the CTA link so Accept can mark invitations.accepted */
  invitationId: string;
}

export type ParsedBody =
  | { ok: true; data: InvitationRequest }
  | { ok: false; missing: string[] }
  | { ok: false; invalid: true };

export function parseInvitationBody(raw: unknown): ParsedBody {
  if (!raw || typeof raw !== "object") return { ok: false, invalid: true };
  const o = raw as Record<string, unknown>;
  const rawInviteeEmail = String(
    o.inviteeEmail ?? o.invitee_email ?? "",
  ).trim();
  const inviteeEmail = normalizeEmail(rawInviteeEmail) ?? "";
  const inviteeName = String(o.inviteeName ?? o.invitee_name ?? "").trim();
  const inviterName = String(o.inviterName ?? o.inviter_name ?? "").trim();
  const inviterId = String(o.inviterId ?? o.inviter_id ?? "").trim();
  const invitationId = String(o.invitationId ?? o.invitation_id ?? "").trim();
  const missing: string[] = [];
  if (!inviteeEmail) missing.push("inviteeEmail");
  if (!inviteeName) missing.push("inviteeName");
  if (!inviterName) missing.push("inviterName");
  if (!inviterId) missing.push("inviterId");
  if (!invitationId) missing.push("invitationId");
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    data: { inviteeEmail, inviteeName, inviterName, inviterId, invitationId },
  };
}

export function inviteCtaUrl(inviterId: string, invitationId: string): string {
  const q = new URLSearchParams({ invitation: invitationId });
  return `https://split-space.com/invite/${encodeURIComponent(inviterId)}?${q.toString()}`;
}

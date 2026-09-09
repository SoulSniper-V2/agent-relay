export type User = {
  id: string;
  handle: string;
  name: string;
  email: string | null;
  last_seen: number | null;
  created_at: number;
};

export type Agent = {
  id: string;
  owner_id: string;
  slug: string;
  display_name: string;
  card: string;
  status: string;
  is_default: boolean;
  last_seen: number | null;
  created_at: number;
};

/** Authenticated caller: a human's agent holding a PAT. */
export type Actor = {
  user: User;
  agent: Agent;
  token_id: string;
  token_name: string;
};

export type FromRole = "human" | "agent" | "system";
export type Intent = "chat" | "task" | "question" | "alert" | "handoff" | "review" | "ping" | "system";
export type Triage = "pending" | "handled" | "escalated" | "dismissed";
export type Visibility = "agent" | "human";
export type InboundPolicy = "triage" | "always_escalate" | "silent";
export type DecideAction = "handle" | "escalate" | "dismiss" | "reply";

export type Address =
  | { kind: "agent"; handle: string; agentSlug?: string }
  | { kind: "room"; slug: string };

export type PublicMessage = {
  id: string;
  thread_id: string;
  from: string;
  from_role: FromRole;
  from_human: string;
  to: string | null;
  room: string | null;
  intent: Intent;
  body: string;
  payload: Record<string, unknown> | null;
  needs_human: boolean;
  reply_to: string | null;
  created_at: number;
  triage: Triage;
  visibility: Visibility;
  escalate_reason: string;
  /** Peer-authored body wrapped so models treat it as data, not commands. */
  untrusted: string;
};

export type HumanInboxItem = {
  message_id: string;
  thread_id: string;
  from: string;
  from_role: FromRole;
  body: string;
  intent: Intent;
  needs_human: boolean;
  escalate_reason: string;
  created_at: number;
  untrusted: string;
};

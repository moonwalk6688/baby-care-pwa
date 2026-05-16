import { User } from "@supabase/supabase-js";
import {
  AppState,
  BabyProfile,
  CareEvent,
  DiaperDetails,
  FeedingDetails,
  FamilyMember,
  MemberRole,
  SleepDetails
} from "@/lib/types";
import { supabase } from "@/lib/supabase";

type EventRow = {
  id: string;
  family_id: string;
  baby_id: string;
  type: CareEvent["type"];
  happened_at: string;
  ended_at: string | null;
  created_by: string;
  role: MemberRole;
  note: string | null;
  deleted_at: string | null;
  details: CareEvent["details"];
};

type MemberRow = {
  id: string;
  family_id: string;
  user_id: string;
  role: MemberRole;
  display_name: string;
  families: {
    id: string;
    name: string;
    invite_code: string;
  } | null;
};

type BabyRow = {
  id: string;
  family_id: string;
  nickname: string;
  birth_at: string;
  gender: BabyProfile["gender"];
  avatar_url: string | null;
};

export function hasSupabaseConfig() {
  return Boolean(supabase);
}

export async function ensureUserProfile(user: User, displayName: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const name = displayName.trim() || user.email?.split("@")[0] || "家庭成员";
  const { error } = await supabase.from("users").upsert({
    id: user.id,
    display_name: name,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

export async function loadCloudState(user: User): Promise<AppState | null> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: memberships, error: memberError } = await supabase
    .from("family_members")
    .select("id,family_id,user_id,role,display_name,families(id,name,invite_code)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .returns<MemberRow[]>();
  if (memberError) throw memberError;

  const membership = memberships?.[0];
  const familyRow = membership?.families;
  if (!membership || !familyRow) return null;

  const familyId = membership.family_id;
  const [{ data: memberRows, error: membersError }, { data: babies, error: babyError }] = await Promise.all([
    supabase
      .from("family_members")
      .select("id,family_id,user_id,role,display_name,families(id,name,invite_code)")
      .eq("family_id", familyId)
      .is("deleted_at", null)
      .returns<MemberRow[]>(),
    supabase
      .from("babies")
      .select("id,family_id,nickname,birth_at,gender,avatar_url")
      .eq("family_id", familyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .returns<BabyRow[]>()
  ]);
  if (membersError) throw membersError;
  if (babyError) throw babyError;

  const baby = babies?.[0];
  if (!baby) return null;

  const { data: eventRows, error: eventError } = await supabase
    .from("events")
    .select("id,family_id,baby_id,type,happened_at,ended_at,created_by,role,note,deleted_at,details")
    .eq("family_id", familyId)
    .eq("baby_id", baby.id)
    .is("deleted_at", null)
    .order("happened_at", { ascending: false })
    .returns<EventRow[]>();
  if (eventError) throw eventError;

  const members: FamilyMember[] = (memberRows ?? []).map((item) => ({
    id: item.user_id,
    name: item.display_name,
    role: item.role
  }));

  return {
    baby: {
      id: baby.id,
      nickname: baby.nickname,
      birthAt: baby.birth_at,
      gender: baby.gender,
      avatar: baby.avatar_url ?? undefined
    },
    family: {
      id: familyRow.id,
      name: familyRow.name,
      inviteCode: familyRow.invite_code,
      members
    },
    activeMemberId: user.id,
    events: (eventRows ?? []).map(fromEventRow)
  };
}

export async function createCloudFamily(input: {
  user: User;
  displayName: string;
  role: MemberRole;
  familyName: string;
  babyNickname: string;
  babyBirthAt: string;
  babyGender: BabyProfile["gender"];
}): Promise<AppState> {
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureUserProfile(input.user, input.displayName);
  const familyId = crypto.randomUUID();
  const babyId = crypto.randomUUID();
  const inviteCode = makeInviteCode();
  const displayName = input.displayName.trim() || "家庭成员";
  const familyName = input.familyName.trim() || "我们的照护本";
  const babyNickname = input.babyNickname.trim() || "小宝";

  const { error: familyError } = await supabase
    .from("families")
    .insert({
      id: familyId,
      name: familyName,
      invite_code: inviteCode,
      created_by: input.user.id
    });
  if (familyError) throw familyError;

  const { error: memberError } = await supabase.from("family_members").insert({
    family_id: familyId,
    user_id: input.user.id,
    role: input.role,
    display_name: displayName
  });
  if (memberError) throw memberError;

  const { error: babyError } = await supabase.from("babies").insert({
    id: babyId,
    family_id: familyId,
    nickname: babyNickname,
    birth_at: input.babyBirthAt,
    gender: input.babyGender
  });
  if (babyError) throw babyError;

  return {
    baby: {
      id: babyId,
      nickname: babyNickname,
      birthAt: input.babyBirthAt,
      gender: input.babyGender
    },
    family: {
      id: familyId,
      name: familyName,
      inviteCode,
      members: [{ id: input.user.id, name: displayName, role: input.role }]
    },
    activeMemberId: input.user.id,
    events: []
  };
}

export async function joinCloudFamily(input: {
  user: User;
  displayName: string;
  role: MemberRole;
  inviteCode: string;
}) {
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureUserProfile(input.user, input.displayName);
  const { error } = await supabase.rpc("join_family_by_invite", {
    code: input.inviteCode.trim().toUpperCase(),
    member_role: input.role,
    member_name: input.displayName.trim() || "家庭成员"
  });
  if (error) throw error;
}

export async function insertCloudEvent(event: CareEvent) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("events")
    .insert({
      family_id: event.familyId,
      baby_id: event.babyId,
      type: event.type,
      happened_at: event.happenedAt,
      ended_at: event.endedAt,
      created_by: event.createdBy,
      role: event.role,
      note: event.note,
      details: event.details
    })
    .select("id")
    .single();
  if (error) throw error;

  const eventId = data.id as string;
  await insertDetail(eventId, event);
  return eventId;
}

export async function softDeleteCloudEvent(eventId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) throw error;
}

export async function completeCloudSleepEvent(input: {
  eventId: string;
  endedAt: string;
  startAt: string;
  durationMinutes: number;
}) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const details: SleepDetails = {
    startAt: input.startAt,
    endAt: input.endedAt,
    durationMinutes: input.durationMinutes
  };
  const { error: eventError } = await supabase
    .from("events")
    .update({
      ended_at: input.endedAt,
      details,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.eventId);
  if (eventError) throw eventError;

  const { error: detailError } = await supabase
    .from("sleep_details")
    .update({
      end_at: input.endedAt,
      duration_minutes: input.durationMinutes,
      updated_at: new Date().toISOString()
    })
    .eq("event_id", input.eventId);
  if (detailError) throw detailError;
}

export async function updateCloudBaby(baby: BabyProfile) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("babies")
    .update({
      nickname: baby.nickname,
      birth_at: baby.birthAt,
      gender: baby.gender,
      avatar_url: baby.avatar,
      updated_at: new Date().toISOString()
    })
    .eq("id", baby.id);
  if (error) throw error;
}

async function insertDetail(eventId: string, event: CareEvent) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (event.type === "feeding") {
    const detail = event.details as FeedingDetails;
    const { error } = await supabase.from("feeding_details").insert({
      event_id: eventId,
      kind: detail.kind,
      side: detail.side,
      started_side: detail.startedSide,
      left_minutes: detail.leftMinutes,
      right_minutes: detail.rightMinutes,
      total_minutes: detail.totalMinutes,
      amount_ml: detail.amountMl
    });
    if (error) throw error;
  }
  if (event.type === "diaper") {
    const detail = event.details as DiaperDetails;
    const { error } = await supabase.from("diaper_details").insert({
      event_id: eventId,
      kind: detail.kind,
      stool_color: detail.stoolColor,
      stool_state: detail.stoolState ?? []
    });
    if (error) throw error;
  }
  if (event.type === "sleep") {
    const detail = event.details as SleepDetails;
    const { error } = await supabase.from("sleep_details").insert({
      event_id: eventId,
      start_at: detail.startAt,
      end_at: detail.endAt,
      duration_minutes: detail.durationMinutes
    });
    if (error) throw error;
  }
}

function fromEventRow(row: EventRow): CareEvent {
  return {
    id: row.id,
    familyId: row.family_id,
    babyId: row.baby_id,
    type: row.type,
    happenedAt: row.happened_at,
    endedAt: row.ended_at ?? undefined,
    createdBy: row.created_by,
    role: row.role,
    note: row.note ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    details: row.details
  };
}

function makeInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

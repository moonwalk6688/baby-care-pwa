import { AppState, CareEvent, FamilyMember } from "@/lib/types";

const STORAGE_KEY = "baby-care-pwa-state-v1";

const now = new Date();
const birth = new Date(now);
birth.setDate(now.getDate() - 16);
birth.setHours(9, 18, 0, 0);

const member: FamilyMember = {
  id: "member-dad",
  name: "爸爸",
  role: "爸爸"
};

export const defaultState: AppState = {
  baby: {
    id: "baby-demo",
    nickname: "小宝",
    birthAt: birth.toISOString(),
    gender: "暂不设置"
  },
  family: {
    id: "family-demo",
    name: "我们家的照护本",
    inviteCode: "BABY17",
    members: [
      member,
      { id: "member-mom", name: "妈妈", role: "妈妈" },
      { id: "member-yuesao", name: "月嫂", role: "月嫂" }
    ]
  },
  activeMemberId: member.id,
  events: []
};

export function loadState(): AppState {
  if (typeof window === "undefined") return defaultState;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return seedState();

  try {
    return JSON.parse(stored) as AppState;
  } catch {
    return seedState();
  }
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function activeMember(state: AppState): FamilyMember {
  return state.family.members.find((item) => item.id === state.activeMemberId) ?? state.family.members[0];
}

function seedState(): AppState {
  const state = structuredClone(defaultState);
  const base = new Date();
  const add = (event: CareEvent) => state.events.push(event);

  const mk = (hoursAgo: number) => {
    const date = new Date(base);
    date.setHours(base.getHours() - hoursAgo);
    return date.toISOString();
  };

  add({
    id: createId("event"),
    familyId: state.family.id,
    babyId: state.baby.id,
    type: "feeding",
    happenedAt: mk(2),
    createdBy: "妈妈",
    role: "妈妈",
    details: { kind: "母乳亲喂", side: "双侧", startedSide: "左侧", leftMinutes: 12, rightMinutes: 9, totalMinutes: 21 }
  });
  add({
    id: createId("event"),
    familyId: state.family.id,
    babyId: state.baby.id,
    type: "diaper",
    happenedAt: mk(1),
    createdBy: "月嫂",
    role: "月嫂",
    details: { kind: "尿尿+便便", stoolColor: "黄色", stoolState: ["奶瓣"] }
  });
  add({
    id: createId("event"),
    familyId: state.family.id,
    babyId: state.baby.id,
    type: "sleep",
    happenedAt: mk(4),
    endedAt: mk(3),
    createdBy: "爸爸",
    role: "爸爸",
    details: { startAt: mk(4), endAt: mk(3), durationMinutes: 60 }
  });
  saveState(state);
  return state;
}

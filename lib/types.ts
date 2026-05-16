export type MemberRole = "爸爸" | "妈妈" | "月嫂" | "奶奶" | "外婆" | "其他";

export type EventType = "feeding" | "diaper" | "sleep" | "burp" | "cry";

export type FeedingKind = "母乳亲喂" | "瓶喂母乳" | "配方奶" | "吸奶";
export type BreastSide = "左侧" | "右侧" | "双侧";

export type DiaperKind = "尿尿" | "便便" | "尿尿+便便" | "干爽";
export type StoolColor = "黄色" | "绿色" | "黑色" | "棕色" | "其他";
export type StoolState = "正常" | "稀" | "水样" | "奶瓣" | "偏干" | "粘液" | "血丝";

export type BurpResult = "拍嗝成功" | "未拍嗝" | "吐奶少量" | "吐奶中等" | "吐奶较多";
export type CryReason = "饿了" | "困了" | "胀气" | "尿布" | "求抱" | "热/冷" | "原因不明";
export type SoothingMethod = "抱睡" | "拍嗝" | "飞机抱" | "白噪音" | "奶嘴" | "喂奶" | "换尿布" | "其他";

export interface BabyProfile {
  id: string;
  nickname: string;
  birthAt: string;
  gender: "男宝" | "女宝" | "暂不设置";
  avatar?: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: MemberRole;
}

export interface FamilySpace {
  id: string;
  name: string;
  inviteCode: string;
  members: FamilyMember[];
}

export interface CareEvent {
  id: string;
  familyId: string;
  babyId: string;
  type: EventType;
  happenedAt: string;
  endedAt?: string;
  createdBy: string;
  role: MemberRole;
  note?: string;
  deletedAt?: string;
  details:
    | FeedingDetails
    | DiaperDetails
    | SleepDetails
    | BurpDetails
    | CryDetails;
}

export interface FeedingDetails {
  kind: FeedingKind;
  side?: BreastSide;
  startedSide?: "左侧" | "右侧";
  leftMinutes?: number;
  rightMinutes?: number;
  totalMinutes?: number;
  amountMl?: number;
}

export interface DiaperDetails {
  kind: DiaperKind;
  stoolColor?: StoolColor;
  stoolState?: StoolState[];
}

export interface SleepDetails {
  startAt: string;
  endAt?: string;
  durationMinutes?: number;
}

export interface BurpDetails {
  result: BurpResult;
}

export interface CryDetails {
  reason: CryReason;
  soothing: SoothingMethod[];
}

export interface AppState {
  baby: BabyProfile;
  family: FamilySpace;
  activeMemberId: string;
  events: CareEvent[];
  activeSleepId?: string;
}

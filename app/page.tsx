"use client";

import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import {
  AppState,
  BreastSide,
  BurpResult,
  CareEvent,
  DiaperDetails,
  CryReason,
  DiaperKind,
  FeedingDetails,
  FeedingKind,
  MemberRole,
  SleepDetails,
  SoothingMethod,
  StoolColor,
  StoolState
} from "@/lib/types";
import { activeMember, createId, loadState, saveState } from "@/lib/store";
import {
  completeCloudSleepEvent,
  createCloudFamily,
  hasSupabaseConfig,
  insertCloudEvent,
  joinCloudFamily,
  loadCloudState,
  softDeleteCloudEvent,
  updateCloudBaby
} from "@/lib/cloud-store";
import { supabase } from "@/lib/supabase";
import {
  babyDay,
  datetimeLocalValue,
  formatClock,
  formatDate,
  fromDatetimeLocal,
  minutesText,
  sameLocalDay,
  sinceText
} from "@/lib/time";

type Modal = "feeding" | "diaper" | "sleep" | "burp" | "cry" | "profile" | null;
type Tab = "home" | "timeline" | "summary" | "family";

const feedingKinds: FeedingKind[] = ["母乳亲喂", "瓶喂母乳", "配方奶", "吸奶"];
const sides: BreastSide[] = ["左侧", "右侧", "双侧"];
const diaperKinds: DiaperKind[] = ["尿尿", "便便", "尿尿+便便", "干爽"];
const stoolColors: StoolColor[] = ["黄色", "绿色", "黑色", "棕色", "其他"];
const stoolStates: StoolState[] = ["正常", "稀", "水样", "奶瓣", "偏干", "粘液", "血丝"];
const burpResults: BurpResult[] = ["拍嗝成功", "未拍嗝", "吐奶少量", "吐奶中等", "吐奶较多"];
const cryReasons: CryReason[] = ["饿了", "困了", "胀气", "尿布", "求抱", "热/冷", "原因不明"];
const soothingMethods: SoothingMethod[] = ["抱睡", "拍嗝", "飞机抱", "白噪音", "奶嘴", "喂奶", "换尿布", "其他"];
const roles: MemberRole[] = ["爸爸", "妈妈", "月嫂", "奶奶", "外婆", "其他"];

export default function Page() {
  const [state, setState] = useState<AppState | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        if (hasSupabaseConfig() && supabase) {
          const { data } = await withTimeout(supabase.auth.getSession(), 15000);
          const sessionUser = data.session?.user ?? null;
          if (!alive) return;
          setUser(sessionUser);
          if (sessionUser) {
            setState(await withTimeout(loadCloudState(sessionUser), 15000));
            setError("");
          }
        } else {
          setState(loadState());
        }
      } catch (err) {
        setError(messageFromError(err));
      } finally {
        if (alive) setLoading(false);
      }
    }
    boot();
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => registration.unregister());
        }).catch(() => undefined);
      } else {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
    }
    const authSubscription = supabase?.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (!sessionUser) {
        setState(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      window.setTimeout(async () => {
        try {
          setState(await withTimeout(loadCloudState(sessionUser), 15000));
          setError("");
        } catch (err) {
          setError(messageFromError(err));
        } finally {
          setLoading(false);
        }
      }, 0);
    });
    return () => {
      alive = false;
      authSubscription?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function commit(next: AppState) {
    setState(next);
    if (!hasSupabaseConfig()) saveState(next);
  }

  async function refreshCloud() {
    if (!user) return;
    setState(await loadCloudState(user));
  }

  if (!hasSupabaseConfig()) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-4 py-8 text-ink dark:text-stone-50">
        <section className="panel p-5">
          <h1 className="text-2xl font-bold">需要先配置 Supabase</h1>
          <p className="mt-3 text-sm text-stone-700 dark:text-stone-200">
            云端同步需要 Supabase 项目地址和公开 key。请确认 .env.local 已填写，并重启 dev server。
          </p>
          <pre className="mt-4 overflow-auto rounded-[8px] bg-ink p-4 text-xs text-white">
{`NEXT_PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...`}
          </pre>
        </section>
      </main>
    );
  }

  if (loading) {
    return <main className="min-h-screen px-5 py-8 text-ink dark:text-stone-50">正在打开照护本...</main>;
  }

  if (!user) {
    return <AuthScreen onError={setError} error={error} />;
  }

  if (!state) {
    return (
      <OnboardingScreen
        user={user}
        onReady={async () => {
          setLoading(true);
          setError("");
          try {
            await refreshCloud();
          } catch (err) {
            setError(messageFromError(err));
          } finally {
            setLoading(false);
          }
        }}
        onError={setError}
        onState={(nextState) => {
          setState(nextState);
          setLoading(false);
          setError("");
        }}
        error={error}
      />
    );
  }

  const appState = state;
  const member = activeMember(appState);
  const events = appState.events.filter((event) => !event.deletedAt).sort((a, b) => +new Date(b.happenedAt) - +new Date(a.happenedAt));
  const today = events.filter((event) => sameLocalDay(event.happenedAt));
  const stats = getStats(events, today);
  const activeSleep = appState.activeSleepId ? events.find((event) => event.id === appState.activeSleepId) : undefined;

  async function addEvent(event: Omit<CareEvent, "id" | "familyId" | "babyId" | "createdBy" | "role">) {
    const current = activeMember(appState);
    const nextEvent: CareEvent = {
      id: createId("event"),
      familyId: appState.family.id,
      babyId: appState.baby.id,
      createdBy: current.name,
      role: current.role,
      ...event
    };
    commit({
      ...appState,
      events: [nextEvent, ...appState.events]
    });
    setModal(null);
    if (user) {
      setSyncing(true);
      try {
        const cloudId = await insertCloudEvent({ ...nextEvent, createdBy: user.id });
        commit({
          ...appState,
          events: [{ ...nextEvent, id: cloudId }, ...appState.events]
        });
      } catch (err) {
        setError(messageFromError(err));
      } finally {
        setSyncing(false);
      }
    }
  }

  async function softDelete(id: string) {
    commit({
      ...appState,
      events: appState.events.map((event) => (event.id === id ? { ...event, deletedAt: new Date().toISOString() } : event))
    });
    if (user) {
      try {
        await softDeleteCloudEvent(id);
      } catch (err) {
        setError(messageFromError(err));
      }
    }
  }

  async function startSleep() {
    const current = activeMember(appState);
    const startedAt = new Date().toISOString();
    const event: CareEvent = {
      id: createId("event"),
      familyId: appState.family.id,
      babyId: appState.baby.id,
      type: "sleep",
      happenedAt: startedAt,
      createdBy: current.name,
      role: current.role,
      details: { startAt: startedAt }
    };
    commit({ ...appState, activeSleepId: event.id, events: [event, ...appState.events] });
    setModal(null);
    if (user) {
      try {
        const cloudId = await insertCloudEvent({ ...event, createdBy: user.id });
        commit({ ...appState, activeSleepId: cloudId, events: [{ ...event, id: cloudId }, ...appState.events] });
      } catch (err) {
        setError(messageFromError(err));
      }
    }
  }

  async function endSleep() {
    if (!activeSleep) return;
    const endedAt = new Date().toISOString();
    const startedAt = activeSleep.happenedAt;
    const durationMinutes = Math.max(1, Math.round((+new Date(endedAt) - +new Date(startedAt)) / 60000));
    commit({
      ...appState,
      activeSleepId: undefined,
      events: appState.events.map((event) =>
        event.id === activeSleep.id
          ? { ...event, endedAt, details: { startAt: startedAt, endAt: endedAt, durationMinutes } }
          : event
      )
    });
    if (user) {
      try {
        await completeCloudSleepEvent({
          eventId: activeSleep.id,
          endedAt,
          startAt: startedAt,
          durationMinutes
        });
      } catch (err) {
        setError(messageFromError(err));
      }
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-4 text-ink dark:text-stone-50">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-stone-200/70 bg-cream/88 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-[#17201d]/88">
        <div className="flex items-center justify-between gap-3">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setModal("profile")}>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[8px] bg-mint text-2xl dark:bg-sage/40">
              {state.baby.avatar || "宝"}
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-bold">{state.baby.nickname}</div>
              <div className="text-sm text-stone-600 dark:text-stone-300">出生第 {babyDay(state.baby.birthAt)} 天 · {member.role}</div>
            </div>
          </button>
          <button className="tap bg-white text-sm dark:bg-white/10" onClick={() => setDark((value) => !value)}>
            {dark ? "日间" : "夜间"}
          </button>
        </div>
      </header>

      {(error || syncing) && (
        <div className={`mb-4 rounded-[8px] px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-100" : "bg-mint text-ink dark:bg-sage/40 dark:text-white"}`}>
          {error || "正在同步到云端..."}
        </div>
      )}

      {tab === "home" && (
        <section className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-stone-600 dark:text-stone-300">照护驾驶舱</p>
                <h1 className="text-2xl font-bold">现在最需要知道的事</h1>
              </div>
              <span className="rounded-full bg-mint px-3 py-1 text-sm font-semibold text-ink dark:bg-sage/40 dark:text-white">邀请码 {state.family.inviteCode}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="上次喂奶" value={sinceText(stats.lastFeed?.happenedAt)} />
              <Metric label="上次换尿布" value={sinceText(stats.lastDiaper?.happenedAt)} />
              <Metric label="上次便便" value={sinceText(stats.lastStool?.happenedAt)} />
              <Metric label="上次睡醒" value={sinceText(stats.lastWake?.endedAt)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TodayStat label="今日喂奶" value={`${stats.feedCount} 次`} />
            <TodayStat label="今日尿布" value={`${stats.diaperCount} 次`} />
            <TodayStat label="今日便便" value={`${stats.stoolCount} 次`} />
            <TodayStat label="今日睡眠" value={minutesText(stats.sleepMinutes)} />
          </div>

          {activeSleep && (
            <div className="panel border-sage/50 bg-mint/70 p-4 dark:bg-sage/25">
              <p className="text-sm font-semibold">宝宝正在睡觉</p>
              <p className="mt-1 text-sm text-stone-700 dark:text-stone-200">从 {formatClock(activeSleep.happenedAt)} 开始，醒来时点结束即可。</p>
              <button className="tap mt-3 w-full bg-ink text-white dark:bg-mint dark:text-ink" onClick={endSleep}>醒来了</button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <ActionButton title="喂奶" sub={suggestStartSide(events)} onClick={() => setModal("feeding")} />
            <ActionButton title="换尿布" sub="尿尿 / 便便 / 干爽" onClick={() => setModal("diaper")} />
            <ActionButton title="睡觉" sub={activeSleep ? "睡眠进行中" : "开始或补录"} onClick={() => setModal("sleep")} />
            <ActionButton title="拍嗝/吐奶" sub="轻轻记录就好" onClick={() => setModal("burp")} />
            <button className="tap col-span-2 bg-clay text-left text-white shadow-soft" onClick={() => setModal("cry")}>
              <span className="block text-xl font-bold">哭闹/备注</span>
              <span className="mt-1 block text-sm opacity-90">原因、安抚方式和特殊情况</span>
            </button>
          </div>
        </section>
      )}

      {tab === "timeline" && <Timeline events={events} onDelete={softDelete} />}
      {tab === "summary" && <Summary stats={stats} today={today} />}
      {tab === "family" && (
        <Family
          state={state}
          commit={commit}
          onSignOut={async () => {
            await supabase?.auth.signOut();
            setState(null);
            setUser(null);
            setTab("home");
          }}
        />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/80 bg-white/92 px-3 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur dark:border-white/10 dark:bg-[#17201d]/92">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
          <NavButton active={tab === "home"} label="首页" onClick={() => setTab("home")} />
          <NavButton active={tab === "timeline"} label="时间线" onClick={() => setTab("timeline")} />
          <NavButton active={tab === "summary"} label="交接" onClick={() => setTab("summary")} />
          <NavButton active={tab === "family"} label="家庭" onClick={() => setTab("family")} />
        </div>
      </nav>

      {modal === "feeding" && <FeedingModal events={events} onClose={() => setModal(null)} onSave={addEvent} />}
      {modal === "diaper" && <DiaperModal onClose={() => setModal(null)} onSave={addEvent} />}
      {modal === "sleep" && <SleepModal active={!!activeSleep} onStart={startSleep} onClose={() => setModal(null)} onSave={addEvent} />}
      {modal === "burp" && <BurpModal onClose={() => setModal(null)} onSave={addEvent} />}
      {modal === "cry" && <CryModal onClose={() => setModal(null)} onSave={addEvent} />}
      {modal === "profile" && (
        <ProfileModal
          state={state}
          commit={async (next) => {
            commit(next);
            try {
              await updateCloudBaby(next.baby);
            } catch (err) {
              setError(messageFromError(err));
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}

function MissingConfig() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-8 text-ink dark:text-stone-50">
      <section className="panel p-5">
        <h1 className="text-2xl font-bold">需要先配置 Supabase</h1>
        <p className="mt-3 text-sm text-stone-700 dark:text-stone-200">
          云端同步需要 Supabase 项目地址和 anon key。复制 .env.example 为 .env.local，填入下面两个变量后重启 dev server。
        </p>
        <pre className="mt-4 overflow-auto rounded-[8px] bg-ink p-4 text-xs text-white">
{`NEXT_PUBLIC_SUPABASE_URL=你的 Supabase Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase anon public key`}
        </pre>
        <p className="mt-4 text-sm text-stone-700 dark:text-stone-200">
          同时在 Supabase SQL Editor 执行 supabase/schema.sql。之后刷新页面，就会出现登录和家庭空间初始化界面。
        </p>
      </section>
    </main>
  );
}

function AuthScreen({ error, onError }: { error: string; onError: (message: string) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!supabase) return;
    setBusy(true);
    onError("");
    try {
      const result =
        mode === "signup"
          ? await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } })
          : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (result.data.user) {
        // Profile upsert also runs after the session is available; this helps when email confirmation is disabled.
        try {
          await updateProfileAfterAuth(result.data.user, displayName);
        } catch {
          // RLS may reject this until a confirmed session exists.
        }
      }
      if (!result.data.session) {
        onError("已发送确认邮件。请先完成邮箱确认，再回到这里登录。");
      }
    } catch (err) {
      onError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-8 text-ink dark:text-stone-50">
      <section className="panel space-y-4 p-5">
        <div>
          <p className="text-sm text-stone-600 dark:text-stone-300">宝宝照护本</p>
          <h1 className="text-2xl font-bold">登录后全家同步记录</h1>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className={`tap ${mode === "signup" ? "bg-mint dark:bg-sage/50" : "bg-white dark:bg-white/10"}`} onClick={() => setMode("signup")}>注册</button>
          <button className={`tap ${mode === "login" ? "bg-mint dark:bg-sage/50" : "bg-white dark:bg-white/10"}`} onClick={() => setMode("login")}>登录</button>
        </div>
        {mode === "signup" && (
          <Label text="你的称呼">
            <input className="tap w-full bg-white dark:bg-white/10" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如 爸爸" />
          </Label>
        )}
        <Label text="邮箱">
          <input className="tap w-full bg-white dark:bg-white/10" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        </Label>
        <Label text="密码">
          <input className="tap w-full bg-white dark:bg-white/10" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" />
        </Label>
        {error && <p className="rounded-[8px] bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-100">{error}</p>}
        <button className="tap w-full bg-ink text-white dark:bg-mint dark:text-ink" disabled={busy || !email || !password} onClick={submit}>
          {busy ? "处理中..." : mode === "signup" ? "注册并继续" : "登录"}
        </button>
      </section>
    </main>
  );
}

function OnboardingScreen({ user, error, onReady, onError, onState }: { user: User; error: string; onReady: () => Promise<void>; onError: (message: string) => void; onState: (state: AppState) => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [displayName, setDisplayName] = useState(user.user_metadata?.display_name ?? "");
  const [role, setRole] = useState<MemberRole>("爸爸");
  const [familyName, setFamilyName] = useState("我们家的照护本");
  const [babyNickname, setBabyNickname] = useState("小宝");
  const [babyBirthAt, setBabyBirthAt] = useState(datetimeLocalValue());
  const [babyGender, setBabyGender] = useState<"男宝" | "女宝" | "暂不设置">("暂不设置");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    onError("");
    try {
      if (mode === "create") {
        const nextState = await createCloudFamily({
          user,
          displayName,
          role,
          familyName,
          babyNickname,
          babyBirthAt: fromDatetimeLocal(babyBirthAt),
          babyGender
        });
        onState(nextState);
        return;
      } else {
        await joinCloudFamily({ user, displayName, role, inviteCode });
      }
      await onReady();
    } catch (err) {
      onError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-8 text-ink dark:text-stone-50">
      <section className="panel space-y-4 p-5">
        <div>
          <p className="text-sm text-stone-600 dark:text-stone-300">家庭空间</p>
          <h1 className="text-2xl font-bold">创建或加入照护本</h1>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className={`tap ${mode === "create" ? "bg-mint dark:bg-sage/50" : "bg-white dark:bg-white/10"}`} onClick={() => setMode("create")}>创建家庭</button>
          <button className={`tap ${mode === "join" ? "bg-mint dark:bg-sage/50" : "bg-white dark:bg-white/10"}`} onClick={() => setMode("join")}>输入邀请码</button>
        </div>
        <Label text="你的称呼">
          <input className="tap w-full bg-white dark:bg-white/10" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如 妈妈" />
        </Label>
        <Segmented options={roles} value={role} onChange={setRole} />
        {mode === "create" ? (
          <>
            <Label text="家庭空间名称">
              <input className="tap w-full bg-white dark:bg-white/10" value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
            </Label>
            <Label text="宝宝昵称">
              <input className="tap w-full bg-white dark:bg-white/10" value={babyNickname} onChange={(event) => setBabyNickname(event.target.value)} />
            </Label>
            <DateField label="出生日期和时间" value={babyBirthAt} onChange={setBabyBirthAt} />
            <Segmented options={["男宝", "女宝", "暂不设置"]} value={babyGender} onChange={setBabyGender} />
          </>
        ) : (
          <Label text="邀请码">
            <input className="tap w-full bg-white uppercase tracking-normal dark:bg-white/10" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="例如 BABY17" />
          </Label>
        )}
        {error && <p className="rounded-[8px] bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-100">{error}</p>}
        <button className="tap w-full bg-ink text-white dark:bg-mint dark:text-ink" disabled={busy || !displayName || (mode === "join" && !inviteCode)} onClick={submit}>
          {busy ? "处理中..." : mode === "create" ? "创建并进入" : "加入家庭"}
        </button>
      </section>
    </main>
  );
}

async function updateProfileAfterAuth(user: User, displayName: string) {
  const { ensureUserProfile } = await import("@/lib/cloud-store");
  await ensureUserProfile(user, displayName);
}

function messageFromError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") return err.message;
  return "操作失败，请稍后重试。";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("连接云端超时，请刷新或稍后重试。")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getStats(events: CareEvent[], today: CareEvent[]) {
  const lastFeed = events.find((event) => event.type === "feeding");
  const lastDiaper = events.find((event) => event.type === "diaper");
  const lastStool = events.find((event) => event.type === "diaper" && isDiaper(event) && ["便便", "尿尿+便便"].includes(event.details.kind));
  const lastWake = events.find((event) => event.type === "sleep" && event.endedAt);
  const feedCount = today.filter((event) => event.type === "feeding").length;
  const diaperCount = today.filter((event) => event.type === "diaper").length;
  const stoolCount = today.filter((event) => event.type === "diaper" && isDiaper(event) && ["便便", "尿尿+便便"].includes(event.details.kind)).length;
  const sleepMinutes = today
    .filter(isSleep)
    .reduce((sum, event) => sum + (event.details.durationMinutes ?? 0), 0);
  const milkMl = today.filter(isFeeding).reduce((sum, event) => sum + (event.details.amountMl ?? 0), 0);
  const spitCount = today.filter((event) => event.type === "burp" && "result" in event.details && event.details.result.startsWith("吐奶")).length;
  const cryCount = today.filter((event) => event.type === "cry").length;
  return { lastFeed, lastDiaper, lastStool, lastWake, feedCount, diaperCount, stoolCount, sleepMinutes, milkMl, spitCount, cryCount };
}

function isFeeding(event: CareEvent): event is CareEvent & { details: FeedingDetails } {
  return event.type === "feeding";
}

function isDiaper(event: CareEvent): event is CareEvent & { details: DiaperDetails } {
  return event.type === "diaper";
}

function isSleep(event: CareEvent): event is CareEvent & { details: SleepDetails } {
  return event.type === "sleep";
}

function suggestStartSide(events: CareEvent[]) {
  const last = events.find((event) => event.type === "feeding" && "startedSide" in event.details && event.details.startedSide);
  if (!last || !("startedSide" in last.details)) return "建议记录起始侧";
  return `建议先从${last.details.startedSide === "左侧" ? "右侧" : "左侧"}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
        <div className="rounded-[8px] bg-linen p-3 dark:bg-white/10">
      <div className="text-xs text-stone-600 dark:text-stone-300">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function TodayStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <div className="text-sm text-stone-600 dark:text-stone-300">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function ActionButton({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button className="tap min-h-28 bg-white text-left shadow-soft dark:bg-white/10" onClick={onClick}>
      <span className="block text-xl font-bold">{title}</span>
      <span className="mt-2 block text-sm text-stone-600 dark:text-stone-300">{sub}</span>
    </button>
  );
}

function NavButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`tap px-2 py-2 text-sm ${active ? "bg-mint text-ink dark:bg-sage/50 dark:text-white" : "bg-transparent text-stone-600 dark:text-stone-300"}`} onClick={onClick}>
      {label}
    </button>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/30 px-3 pb-3">
      <section className="mx-auto max-h-[88vh] w-full max-w-md overflow-auto rounded-t-[8px] bg-cream p-4 shadow-soft dark:bg-[#202823]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="tap bg-white dark:bg-white/10" onClick={onClose}>关闭</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button key={option} className={`chip ${value === option ? "chip-active" : ""}`} onClick={() => onChange(option)} type="button">
          {option}
        </button>
      ))}
    </div>
  );
}

function FeedingModal({ events, onClose, onSave }: { events: CareEvent[]; onClose: () => void; onSave: (event: Omit<CareEvent, "id" | "familyId" | "babyId" | "createdBy" | "role">) => void }) {
  const [kind, setKind] = useState<FeedingKind>("母乳亲喂");
  const [side, setSide] = useState<BreastSide>("双侧");
  const [startedSide, setStartedSide] = useState<"左侧" | "右侧">("左侧");
  const [left, setLeft] = useState(10);
  const [right, setRight] = useState(10);
  const [amount, setAmount] = useState(60);
  const [time, setTime] = useState(datetimeLocalValue());
  const [note, setNote] = useState("");
  const [timerSide, setTimerSide] = useState<"左侧" | "右侧">("左侧");
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState({ left: 0, right: 0 });

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSeconds((value) => ({ ...value, [timerSide === "左侧" ? "left" : "right"]: value[timerSide === "左侧" ? "left" : "right"] + 1 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, timerSide]);

  const timedLeft = Math.max(left, Math.round(seconds.left / 60));
  const timedRight = Math.max(right, Math.round(seconds.right / 60));

  return (
    <Sheet title="喂奶记录" onClose={onClose}>
      <div className="space-y-4">
        <Segmented options={feedingKinds} value={kind} onChange={setKind} />
        <p className="rounded-[8px] bg-mint/70 p-3 text-sm dark:bg-sage/25">{suggestStartSide(events)}。只是温和提示，不需要严格执行。</p>
        {kind === "母乳亲喂" ? (
          <>
            <Segmented options={sides} value={side} onChange={setSide} />
            <Segmented options={["左侧", "右侧"]} value={startedSide} onChange={setStartedSide} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="左侧分钟" value={timedLeft} onChange={setLeft} />
              <NumberField label="右侧分钟" value={timedRight} onChange={setRight} />
            </div>
            <div className="panel p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold">计时 {timerSide}</span>
                <span>{Math.floor((seconds.left + seconds.right) / 60)}:{String((seconds.left + seconds.right) % 60).padStart(2, "0")}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button className="tap bg-mint text-ink dark:bg-sage/50 dark:text-white" onClick={() => setRunning((value) => !value)}>{running ? "暂停" : "开始"}</button>
                <button className="tap bg-white dark:bg-white/10" onClick={() => setTimerSide(timerSide === "左侧" ? "右侧" : "左侧")}>切换</button>
                <button className="tap bg-ink text-white dark:bg-mint dark:text-ink" onClick={() => setRunning(false)}>结束</button>
              </div>
            </div>
          </>
        ) : (
          <NumberField label="奶量 ml" value={amount} onChange={setAmount} />
        )}
        <DateField label="记录时间" value={time} onChange={setTime} />
        <TextArea value={note} onChange={setNote} />
        <button
          className="tap w-full bg-ink text-white dark:bg-mint dark:text-ink"
          onClick={() =>
            onSave({
              type: "feeding",
              happenedAt: fromDatetimeLocal(time),
              note,
              details:
                kind === "母乳亲喂"
                  ? { kind, side, startedSide, leftMinutes: timedLeft, rightMinutes: timedRight, totalMinutes: timedLeft + timedRight }
                  : { kind, amountMl: amount }
            })
          }
        >
          保存喂奶
        </button>
      </div>
    </Sheet>
  );
}

function DiaperModal({ onClose, onSave }: { onClose: () => void; onSave: (event: Omit<CareEvent, "id" | "familyId" | "babyId" | "createdBy" | "role">) => void }) {
  const [kind, setKind] = useState<DiaperKind>("尿尿");
  const [color, setColor] = useState<StoolColor>("黄色");
  const [states, setStates] = useState<StoolState[]>(["正常"]);
  const [time, setTime] = useState(datetimeLocalValue());
  const [note, setNote] = useState("");
  const hasStool = kind === "便便" || kind === "尿尿+便便";
  return (
    <Sheet title="尿布记录" onClose={onClose}>
      <div className="space-y-4">
        <Segmented options={diaperKinds} value={kind} onChange={setKind} />
        {hasStool && (
          <>
            <Segmented options={stoolColors} value={color} onChange={setColor} />
            <MultiSelect options={stoolStates} values={states} onChange={setStates} />
          </>
        )}
        <DateField label="记录时间" value={time} onChange={setTime} />
        <TextArea value={note} onChange={setNote} />
        <button className="tap w-full bg-ink text-white dark:bg-mint dark:text-ink" onClick={() => onSave({ type: "diaper", happenedAt: fromDatetimeLocal(time), note, details: { kind, stoolColor: hasStool ? color : undefined, stoolState: hasStool ? states : undefined } })}>
          保存尿布
        </button>
      </div>
    </Sheet>
  );
}

function SleepModal({ active, onStart, onClose, onSave }: { active: boolean; onStart: () => void; onClose: () => void; onSave: (event: Omit<CareEvent, "id" | "familyId" | "babyId" | "createdBy" | "role">) => void }) {
  const [start, setStart] = useState(datetimeLocalValue());
  const [end, setEnd] = useState(datetimeLocalValue());
  const [note, setNote] = useState("");
  const duration = Math.max(1, Math.round((+new Date(fromDatetimeLocal(end)) - +new Date(fromDatetimeLocal(start))) / 60000));
  return (
    <Sheet title="睡眠记录" onClose={onClose}>
      <div className="space-y-4">
        <button className="tap w-full bg-sage text-white" disabled={active} onClick={onStart}>{active ? "睡眠已在记录中" : "一键开始睡觉"}</button>
        <DateField label="补录开始时间" value={start} onChange={setStart} />
        <DateField label="补录醒来时间" value={end} onChange={setEnd} />
        <div className="rounded-[8px] bg-linen p-3 dark:bg-white/10">本次约 {minutesText(duration)}</div>
        <TextArea value={note} onChange={setNote} />
        <button className="tap w-full bg-ink text-white dark:bg-mint dark:text-ink" onClick={() => onSave({ type: "sleep", happenedAt: fromDatetimeLocal(start), endedAt: fromDatetimeLocal(end), note, details: { startAt: fromDatetimeLocal(start), endAt: fromDatetimeLocal(end), durationMinutes: duration } })}>
          保存睡眠
        </button>
      </div>
    </Sheet>
  );
}

function BurpModal({ onClose, onSave }: { onClose: () => void; onSave: (event: Omit<CareEvent, "id" | "familyId" | "babyId" | "createdBy" | "role">) => void }) {
  const [result, setResult] = useState<BurpResult>("拍嗝成功");
  const [note, setNote] = useState("");
  return (
    <Sheet title="拍嗝/吐奶" onClose={onClose}>
      <div className="space-y-4">
        <Segmented options={burpResults} value={result} onChange={setResult} />
        <TextArea value={note} onChange={setNote} />
        <button className="tap w-full bg-ink text-white dark:bg-mint dark:text-ink" onClick={() => onSave({ type: "burp", happenedAt: new Date().toISOString(), note, details: { result } })}>保存</button>
      </div>
    </Sheet>
  );
}

function CryModal({ onClose, onSave }: { onClose: () => void; onSave: (event: Omit<CareEvent, "id" | "familyId" | "babyId" | "createdBy" | "role">) => void }) {
  const [reason, setReason] = useState<CryReason>("原因不明");
  const [soothing, setSoothing] = useState<SoothingMethod[]>(["抱睡"]);
  const [note, setNote] = useState("");
  return (
    <Sheet title="哭闹/备注" onClose={onClose}>
      <div className="space-y-4">
        <Segmented options={cryReasons} value={reason} onChange={setReason} />
        <MultiSelect options={soothingMethods} values={soothing} onChange={setSoothing} />
        <TextArea value={note} onChange={setNote} />
        <button className="tap w-full bg-ink text-white dark:bg-mint dark:text-ink" onClick={() => onSave({ type: "cry", happenedAt: new Date().toISOString(), note, details: { reason, soothing } })}>保存备注</button>
      </div>
    </Sheet>
  );
}

function ProfileModal({ state, commit, onClose }: { state: AppState; commit: (state: AppState) => void | Promise<void>; onClose: () => void }) {
  const [nickname, setNickname] = useState(state.baby.nickname);
  const [birthAt, setBirthAt] = useState(datetimeLocalValue(state.baby.birthAt));
  const [gender, setGender] = useState(state.baby.gender);
  return (
    <Sheet title="宝宝档案" onClose={onClose}>
      <div className="space-y-4">
        <Label text="宝宝昵称"><input className="tap w-full bg-white dark:bg-white/10" value={nickname} onChange={(event) => setNickname(event.target.value)} /></Label>
        <DateField label="出生日期和时间" value={birthAt} onChange={setBirthAt} />
        <Segmented options={["男宝", "女宝", "暂不设置"]} value={gender} onChange={setGender} />
        <button className="tap w-full bg-ink text-white dark:bg-mint dark:text-ink" onClick={async () => { await commit({ ...state, baby: { ...state.baby, nickname, birthAt: fromDatetimeLocal(birthAt), gender } }); onClose(); }}>保存档案</button>
      </div>
    </Sheet>
  );
}

function Timeline({ events, onDelete }: { events: CareEvent[]; onDelete: (id: string) => void }) {
  const grouped = events.reduce<Record<string, CareEvent[]>>((acc, event) => {
    const key = new Date(event.happenedAt).toDateString();
    acc[key] = acc[key] ? [...acc[key], event] : [event];
    return acc;
  }, {});
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">时间线</h1>
      {Object.entries(grouped).map(([day, items]) => (
        <div key={day} className="space-y-2">
          <h2 className="text-sm font-semibold text-stone-600 dark:text-stone-300">{formatDate(items[0].happenedAt)}</h2>
          {items.map((event) => (
            <div key={event.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{eventTitle(event)} · {formatClock(event.happenedAt)}</div>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{eventSummary(event)}</p>
                  <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{event.createdBy} · {event.role}</p>
                </div>
                <button className="chip" onClick={() => onDelete(event.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      ))}
      {!events.length && <div className="panel p-6 text-center text-stone-600 dark:text-stone-300">还没有记录。</div>}
    </section>
  );
}

function Summary({ stats, today }: { stats: ReturnType<typeof getStats>; today: CareEvent[] }) {
  const notes = today.filter((event) => event.note).map((event) => event.note);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">今日交接总结</h1>
      <div className="panel p-4">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="喂奶次数" value={`${stats.feedCount} 次`} />
          <Metric label="今日奶量" value={`${stats.milkMl} ml`} />
          <Metric label="尿布次数" value={`${stats.diaperCount} 次`} />
          <Metric label="便便次数" value={`${stats.stoolCount} 次`} />
          <Metric label="睡眠总时长" value={minutesText(stats.sleepMinutes)} />
          <Metric label="吐奶次数" value={`${stats.spitCount} 次`} />
          <Metric label="哭闹次数" value={`${stats.cryCount} 次`} />
          <Metric label="记录总数" value={`${today.length} 条`} />
        </div>
      </div>
      <div className="panel p-4">
        <h2 className="font-bold">特殊备注</h2>
        <div className="mt-3 space-y-2 text-sm text-stone-700 dark:text-stone-200">
          {notes.length ? notes.map((note, index) => <p key={`${note}-${index}`}>· {note}</p>) : <p>今天没有特别备注，照护节奏保持即可。</p>}
        </div>
      </div>
      <div className="panel p-4">
        <h2 className="font-bold">月嫂经验备注</h2>
        <p className="mt-2 text-sm text-stone-700 dark:text-stone-200">可以把今天的拍嗝方式、便便观察、睡眠规律写在哭闹/备注里，交接时这里会自动汇总。</p>
      </div>
    </section>
  );
}

function Family({ state, commit, onSignOut }: { state: AppState; commit: (state: AppState) => void; onSignOut: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("其他");
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">家庭空间</h1>
      <div className="panel p-4">
        <p className="text-sm text-stone-600 dark:text-stone-300">{state.family.name}</p>
        <div className="mt-2 text-3xl font-bold tracking-normal">{state.family.inviteCode}</div>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">把邀请码发给家人，后续接入 Supabase Auth 后即可加入同一家庭。</p>
      </div>
      <div className="space-y-2">
        {state.family.members.map((member) => (
          <button key={member.id} className={`tap w-full text-left ${state.activeMemberId === member.id ? "bg-mint dark:bg-sage/50" : "bg-white dark:bg-white/10"}`} onClick={() => commit({ ...state, activeMemberId: member.id })}>
            {member.name} · {member.role}
          </button>
        ))}
      </div>
      <div className="panel space-y-3 p-4">
        <Label text="新增成员"><input className="tap w-full bg-white dark:bg-white/10" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 奶奶" /></Label>
        <Segmented options={roles} value={role} onChange={setRole} />
        <button className="tap w-full bg-ink text-white dark:bg-mint dark:text-ink" onClick={() => { if (!name.trim()) return; commit({ ...state, family: { ...state.family, members: [...state.family.members, { id: createId("member"), name: name.trim(), role }] } }); setName(""); }}>
          添加成员
        </button>
      </div>
      <button className="tap w-full border border-stone-200 bg-white text-stone-700 dark:border-white/10 dark:bg-white/10 dark:text-stone-100" onClick={onSignOut}>
        退出登录
      </button>
    </section>
  );
}

function eventTitle(event: CareEvent) {
  return { feeding: "喂奶", diaper: "尿布", sleep: "睡眠", burp: "拍嗝/吐奶", cry: "哭闹/备注" }[event.type];
}

function eventSummary(event: CareEvent) {
  if (isFeeding(event)) {
    const detail = event.details;
    if (detail.kind === "母乳亲喂") return `${detail.kind} ${detail.side ?? ""}，共 ${detail.totalMinutes ?? 0} 分钟`;
    return `${detail.kind} ${detail.amountMl ?? 0} ml`;
  }
  if (isDiaper(event)) {
    const detail = event.details;
    return `${detail.kind}${detail.stoolColor ? ` · ${detail.stoolColor}` : ""}${detail.stoolState?.length ? ` · ${detail.stoolState.join("、")}` : ""}`;
  }
  if (isSleep(event)) {
    const detail = event.details;
    return detail.durationMinutes ? `${formatClock(detail.startAt)} - ${formatClock(detail.endAt)}，${minutesText(detail.durationMinutes)}` : `从 ${formatClock(detail.startAt)} 开始`;
  }
  const detail = event.details;
  if (event.type === "burp" && "result" in detail) return detail.result;
  if (event.type === "cry" && "reason" in detail) return `${detail.reason} · ${detail.soothing.join("、")}`;
  return event.note || "";
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Label text={label}>
      <input className="tap w-full bg-white dark:bg-white/10" type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </Label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Label text={label}>
      <input className="tap w-full bg-white dark:bg-white/10" type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} />
    </Label>
  );
}

function TextArea({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Label text="备注">
      <textarea className="min-h-24 w-full rounded-[8px] border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-white/10" value={value} onChange={(event) => onChange(event.target.value)} placeholder="有特别情况再写，没写也没关系。" />
    </Label>
  );
}

function MultiSelect<T extends string>({ options, values, onChange }: { options: T[]; values: T[]; onChange: (value: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = values.includes(option);
        return (
          <button key={option} className={`chip ${active ? "chip-active" : ""}`} type="button" onClick={() => onChange(active ? values.filter((item) => item !== option) : [...values, option])}>
            {option}
          </button>
        );
      })}
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-stone-700 dark:text-stone-200">{text}</span>
      {children}
    </label>
  );
}

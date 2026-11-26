/**
 * 全局状态（无第三方状态库）：一个极小的可观察 store + React 18/19 的 useSyncExternalStore。
 *
 * 设计原因：
 * - 会话数据只在本机（IndexedDB），流式 token 高频更新，不能每个 delta 都落盘；
 * - 流式消息对象就地修改 + streamRev 计数触发重渲染，落盘只在「结束 / 中断 / 定时」时发生；
 * - 设置页与所有敏感配置均受站长管理员身份（SSR `getAdminSession()` + `/api/auth/session`）硬门控。
 */
import { useSyncExternalStore } from 'react';
import {
  describeSiteAdminError,
  SiteAdminApiError,
  siteAdminRequest,
} from '@/lib/site-admin-request';
import { kvGet, kvSet } from '../lib/idb';
import {
  DEFAULT_SETTINGS,
  type Attachment,
  type Conversation,
  type Settings,
} from '../api/types';
import { uid } from '../lib/uid';
import { themeHost } from '../lib/themeHost';
import type { AgentNote, AgentTask, Memory } from '../agent/types';
import { executeTool } from '../agent/tools';
import { nextOccurrence } from '../agent/recurrence';
import { BUILTIN_SKILLS, type Skill } from '../agent/skills';
import { setSkillRegistry } from '../agent/skillRegistry';
import { createTts } from './tts';
import { createSend } from './send';
import { createArchive } from './archive';
import { AGENT_KEYS, createAgentStore, type SkillInput, type TaskPatch } from './agentStore';
import {
  INDEX_KEY,
  convKey,
  createConversations,
  newConversation,
  type ConversationIndexItem,
} from './conversations';
import {
  abortPrevious,
  nextRunId,
  runStream as turnRunStream,
  type StreamRunOptions,
  type TurnDeps,
} from './turn';

const SETTINGS_KEY = 'settings';

export type View = 'chat' | 'settings';

/** 会话列表项的定义在 conversations.ts，这里转出保持旧引用可用。 */
export type { ConversationIndexItem } from './conversations';

export interface AssistantAuthSnapshot {
  isAdmin: boolean;
  adminUsername: string | null;
  authLoaded: boolean;
}

export interface AssistantPublicConfig {
  displayName: string;
  welcomeMessage: string;
  model: string;
  thinking: boolean;
  effort: Settings['effort'];
  webSearch: boolean;
  readUrl: boolean;
  persona: Settings['persona'];
  replyStyle: Settings['replyStyle'];
  mockMode: boolean;
  configured: boolean;
  imageConfigured: boolean;
  updatedAt: string | null;
}

interface AdminSettingsResponse {
  displayName: string;
  welcomeMessage: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  thinking: boolean;
  effort: Settings['effort'];
  webSearch: boolean;
  readUrl: boolean;
  safety: Settings['safety'];
  autoTitle: boolean;
  autoMemory: boolean;
  persona: Settings['persona'];
  replyStyle: Settings['replyStyle'];
  addressName: string;
  addressTone: Settings['addressTone'];
  team: string[];
  voiceId: Settings['voiceId'];
  autoRead: boolean;
  mockMode: boolean;
  imageBaseUrl: string;
  imageModel: string;
  imageQuality: string;
  imageAspect: string;
  apiKeyConfigured: boolean;
  apiKeyMask: string;
  imageApiKeyConfigured: boolean;
  imageApiKeyMask: string;
  updatedAt: string | null;
}

export type SettingsSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const DEFAULT_PUBLIC_CONFIG: AssistantPublicConfig = {
  displayName: DEFAULT_SETTINGS.displayName,
  welcomeMessage: DEFAULT_SETTINGS.welcomeMessage,
  model: DEFAULT_SETTINGS.model,
  thinking: DEFAULT_SETTINGS.thinking,
  effort: DEFAULT_SETTINGS.effort,
  webSearch: DEFAULT_SETTINGS.webSearch,
  readUrl: DEFAULT_SETTINGS.readUrl,
  persona: DEFAULT_SETTINGS.persona,
  replyStyle: DEFAULT_SETTINGS.replyStyle,
  mockMode: DEFAULT_SETTINGS.mockMode,
  configured: false,
  imageConfigured: false,
  updatedAt: null,
};

export interface ToastItem {
  id: string;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface TtsState {
  messageId: string | null;
  phase: 'loading' | 'playing' | null;
}

/** 到点触发的任务提醒（应用内横幅） */
export interface ActiveReminder {
  taskId: string;
  title: string;
  at: number;
  notes?: string;
}

export interface AppState {
  ready: boolean;
  /** 站长管理员身份（SSR + /api/auth/session 双重同步） */
  isAdmin: boolean;
  adminUsername: string | null;
  authLoaded: boolean;
  /** 公开只读安全元数据（绝不含任何密钥） */
  publicConfig: AssistantPublicConfig;
  apiKeyConfigured: boolean;
  imageApiKeyConfigured: boolean;
  apiKeyMask: string;
  imageApiKeyMask: string;
  settingsSaveStatus: SettingsSaveStatus;
  settingsSaveError: string | null;
  settingsLastSavedAt: string | null;
  settings: Settings;
  index: ConversationIndexItem[];
  conversation: Conversation | null;
  view: View;
  drawerOpen: boolean;
  /** 个人 Agent 面板（任务 / 记忆 / 笔记） */
  agentOpen: boolean;
  /** 需要高亮的任务（从通知点进来时） */
  agentFocusTaskId: string | null;
  memories: Memory[];
  tasks: AgentTask[];
  notes: AgentNote[];
  skills: Skill[];
  /** 当前弹出的任务提醒 */
  reminder: ActiveReminder | null;
  toasts: ToastItem[];
  streaming: boolean;
  streamingMessageId: string | null;
  /** 递增计数器：流式过程中触发重渲染 */
  streamRev: number;
  tts: TtsState;
}

function buildSafeVisitorSettings(publicConfig: AssistantPublicConfig): Settings {
  return {
    ...DEFAULT_SETTINGS,
    displayName: publicConfig.displayName || DEFAULT_SETTINGS.displayName,
    welcomeMessage: publicConfig.welcomeMessage ?? DEFAULT_SETTINGS.welcomeMessage,
    model: publicConfig.model || DEFAULT_SETTINGS.model,
    thinking: publicConfig.thinking,
    effort: publicConfig.effort,
    webSearch: publicConfig.webSearch,
    readUrl: publicConfig.readUrl,
    persona: publicConfig.persona,
    replyStyle: publicConfig.replyStyle,
    mockMode: publicConfig.mockMode,
    // 访客态严禁加载或残留任何密钥、内部端点覆盖或系统提示词
    apiKey: '',
    imageApiKey: '',
    systemPrompt: '',
  };
}

function publicConfigFromAdmin(view: AdminSettingsResponse): AssistantPublicConfig {
  return {
    displayName: view.displayName,
    welcomeMessage: view.welcomeMessage,
    model: view.model,
    thinking: view.thinking,
    effort: view.effort,
    webSearch: view.webSearch,
    readUrl: view.readUrl,
    persona: view.persona,
    replyStyle: view.replyStyle,
    mockMode: view.mockMode,
    configured: view.apiKeyConfigured || view.mockMode,
    imageConfigured: view.imageApiKeyConfigured,
    updatedAt: view.updatedAt,
  };
}

function mergeAdminSettings(
  serverView: AdminSettingsResponse | null,
  localSaved: Partial<Settings> | null,
): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS };
  if (!serverView) {
    return { ...base, ...(localSaved ?? {}) };
  }
  if (!serverView.updatedAt && localSaved) {
    // 服务端尚未保存过配置时，优先兼容站长本机已有配置
    return { ...base, ...localSaved };
  }
  return {
    ...base,
    theme: localSaved?.theme ?? base.theme,
    location: localSaved?.location ?? base.location,
    language: localSaved?.language ?? base.language,
    reminderEnabled: localSaved?.reminderEnabled ?? base.reminderEnabled,
    notifications: localSaved?.notifications ?? base.notifications,
    haptics: localSaved?.haptics ?? base.haptics,
    displayName: serverView.displayName,
    welcomeMessage: serverView.welcomeMessage,
    baseUrl: serverView.baseUrl,
    model: serverView.model,
    maxTokens: serverView.maxTokens,
    systemPrompt: serverView.systemPrompt,
    thinking: serverView.thinking,
    effort: serverView.effort,
    webSearch: serverView.webSearch,
    readUrl: serverView.readUrl,
    safety: serverView.safety,
    autoTitle: serverView.autoTitle,
    autoMemory: serverView.autoMemory,
    persona: serverView.persona,
    replyStyle: serverView.replyStyle,
    addressName: serverView.addressName,
    addressTone: serverView.addressTone,
    team: serverView.team.length > 0 ? serverView.team : base.team,
    voiceId: serverView.voiceId,
    autoRead: serverView.autoRead,
    mockMode: serverView.mockMode,
    imageBaseUrl: serverView.imageBaseUrl,
    imageModel: serverView.imageModel,
    imageQuality: serverView.imageQuality,
    imageAspect: serverView.imageAspect,
    // 密钥由服务端加密持久化并通过 /api/assistant/proxy 代理调用，输入框默认留空（仅在更换密钥时输入）
    apiKey: '',
    imageApiKey: '',
  };
}

function initialState(): AppState {
  return {
    ready: false,
    isAdmin: false,
    adminUsername: null,
    authLoaded: false,
    publicConfig: { ...DEFAULT_PUBLIC_CONFIG },
    apiKeyConfigured: false,
    imageApiKeyConfigured: false,
    apiKeyMask: '',
    imageApiKeyMask: '',
    settingsSaveStatus: 'idle',
    settingsSaveError: null,
    settingsLastSavedAt: null,
    settings: { ...DEFAULT_SETTINGS },
    index: [],
    conversation: null,
    view: 'chat',
    drawerOpen: false,
    agentOpen: false,
    agentFocusTaskId: null,
    memories: [],
    tasks: [],
    notes: [],
    skills: [],
    reminder: null,
    toasts: [],
    streaming: false,
    streamingMessageId: null,
    streamRev: 0,
    tts: { messageId: null, phase: null },
  };
}

let state: AppState = initialState();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  const merged: AppState = { ...state, ...next };
  // 硬性安全门控：非站长状态绝不允许进入或停留在设置页
  if (!merged.isAdmin && merged.view === 'settings') {
    merged.view = 'chat';
  }
  state = merged;
  emit();
}

/* ---------------- 自动落盘（去抖） ---------------- */

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistPending = false;

/**
 * 任何消息/会话变化后调用：400ms 合并成一次写入。
 * 不再依赖「流式结束」这个单点，App 被系统杀掉前也会尽量落盘。
 */
function schedulePersist(): void {
  persistPending = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersist();
  }, 400);
}

async function flushPersist(): Promise<void> {
  if (!persistPending) return;
  persistPending = false;
  try {
    await persistConversation(state.conversation);
    agent.persist();
  } catch {
    /* 存储失败不打断对话 */
  }
}

/** 立即落盘（页面隐藏 / 退出 / 手动重要操作后） */
export async function flushNow(): Promise<void> {
  persistPending = true;
  await flushPersist();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function getState(): AppState {
  return state;
}

/* ------------------------------------------------------------------ */
/* Toast                                                              */
/* ------------------------------------------------------------------ */

export function toast(text: string, kind: ToastItem['kind'] = 'info'): void {
  const item: ToastItem = { id: uid('toast'), text, kind };
  setState((s) => ({ toasts: [...s.toasts, item].slice(-3) }));
  setTimeout(() => {
    setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== item.id) }));
  }, kind === 'error' ? 5200 : 3000);
}

export function dismissToast(id: string): void {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/* ------------------------------------------------------------------ */
/* 权限与服务端配置同步                                                */
/* ------------------------------------------------------------------ */

async function fetchAuthSession(): Promise<AssistantAuthSnapshot | null> {
  try {
    const res = await fetch('/api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { isAdmin?: unknown; username?: unknown };
    const isAdmin = Boolean(data?.isAdmin);
    const adminUsername = isAdmin && typeof data?.username === 'string' ? data.username : null;
    return { isAdmin, adminUsername, authLoaded: true };
  } catch {
    return null;
  }
}

async function fetchPublicConfig(): Promise<AssistantPublicConfig | null> {
  try {
    const res = await fetch('/api/assistant/config', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<AssistantPublicConfig>;
    return { ...DEFAULT_PUBLIC_CONFIG, ...data };
  } catch {
    return null;
  }
}

async function fetchAdminSettings(): Promise<AdminSettingsResponse | null> {
  try {
    return await siteAdminRequest<AdminSettingsResponse>('/api/admin/assistant/settings');
  } catch {
    return null;
  }
}

/** 由 SSR / AssistantRuntime 注入初始登录态，避免首屏闪烁。 */
export function hydrateAuthSession(initial: Partial<AssistantAuthSnapshot>): void {
  const isAdmin = Boolean(initial.isAdmin);
  const adminUsername = isAdmin ? (initial.adminUsername ?? null) : null;
  const authLoaded = initial.authLoaded ?? true;
  setState((prev) => ({
    isAdmin,
    adminUsername,
    authLoaded,
    view: isAdmin ? prev.view : 'chat',
    settings: isAdmin ? prev.settings : buildSafeVisitorSettings(prev.publicConfig),
    apiKeyMask: isAdmin ? prev.apiKeyMask : '',
    imageApiKeyMask: isAdmin ? prev.imageApiKeyMask : '',
  }));
}

/** 由 SSR / AssistantRuntime 注入公开安全元数据。 */
export function hydratePublicConfig(config: Partial<AssistantPublicConfig>): void {
  const merged: AssistantPublicConfig = { ...DEFAULT_PUBLIC_CONFIG, ...config };
  setState((prev) => ({
    publicConfig: merged,
    apiKeyConfigured: prev.isAdmin ? prev.apiKeyConfigured || merged.configured : merged.configured,
    imageApiKeyConfigured: prev.isAdmin
      ? prev.imageApiKeyConfigured || merged.imageConfigured
      : merged.imageConfigured,
    settings: prev.isAdmin ? prev.settings : buildSafeVisitorSettings(merged),
  }));
}

/** 主动向 `/api/auth/session` 核验最新登录态，并按权限加载或清空敏感配置。 */
export async function refreshAuthSession(): Promise<AssistantAuthSnapshot> {
  const live = await fetchAuthSession();
  const snapshot: AssistantAuthSnapshot = live ?? {
    isAdmin: state.isAdmin,
    adminUsername: state.adminUsername,
    authLoaded: true,
  };

  if (!snapshot.isAdmin) {
    const publicConfig = (await fetchPublicConfig()) ?? state.publicConfig;
    setState({
      ...snapshot,
      publicConfig,
      view: 'chat',
      settings: buildSafeVisitorSettings(publicConfig),
      apiKeyConfigured: publicConfig.configured,
      imageApiKeyConfigured: publicConfig.imageConfigured,
      apiKeyMask: '',
      imageApiKeyMask: '',
      settingsSaveStatus: 'idle',
      settingsSaveError: null,
    });
    return snapshot;
  }

  const [adminView, localSaved] = await Promise.all([
    fetchAdminSettings(),
    kvGet<Partial<Settings>>(SETTINGS_KEY),
  ]);
  const settings = mergeAdminSettings(adminView, localSaved ?? null);
  const publicConfig = adminView ? publicConfigFromAdmin(adminView) : state.publicConfig;
  setState({
    ...snapshot,
    publicConfig,
    settings,
    apiKeyConfigured: Boolean(adminView?.apiKeyConfigured || settings.apiKey.trim()),
    imageApiKeyConfigured: Boolean(adminView?.imageApiKeyConfigured || settings.imageApiKey.trim()),
    apiKeyMask: adminView?.apiKeyMask ?? '',
    imageApiKeyMask: adminView?.imageApiKeyMask ?? '',
    settingsLastSavedAt: adminView?.updatedAt ?? state.settingsLastSavedAt,
  });
  return snapshot;
}

/* ------------------------------------------------------------------ */
/* 持久化                                                             */
/* ------------------------------------------------------------------ */

function saveSettingsSoon(): void {
  if (!state.isAdmin) return;
  const { apiKey: _ignoreApiKey, imageApiKey: _ignoreImageKey, ...safe } = state.settings;
  void kvSet(SETTINGS_KEY, safe);
}

/* ------------------------------------------------------------------ */
/* 初始化                                                             */
/* ------------------------------------------------------------------ */

let listenersBound = false;
let initPromise: Promise<void> | null = null;

export async function initStore(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = runInitStore().finally(() => {
    initPromise = null;
  });
  return initPromise;
}

async function runInitStore(): Promise<void> {
  const [liveAuth, livePublic, savedIndex, savedMemories, savedTasks, savedNotes, savedSkills] =
    await Promise.all([
      fetchAuthSession(),
      fetchPublicConfig(),
      kvGet<ConversationIndexItem[]>(INDEX_KEY),
      kvGet<Memory[]>(AGENT_KEYS.memories),
      kvGet<AgentTask[]>(AGENT_KEYS.tasks),
      kvGet<AgentNote[]>(AGENT_KEYS.notes),
      kvGet<Skill[]>(AGENT_KEYS.skills),
    ]);

  const isAdmin = liveAuth ? liveAuth.isAdmin : state.isAdmin;
  const adminUsername = liveAuth ? liveAuth.adminUsername : state.adminUsername;
  const publicConfig: AssistantPublicConfig = livePublic ?? state.publicConfig;

  let settings: Settings;
  let apiKeyConfigured = publicConfig.configured;
  let imageApiKeyConfigured = publicConfig.imageConfigured;
  let apiKeyMask = '';
  let imageApiKeyMask = '';
  let settingsLastSavedAt = publicConfig.updatedAt;
  let effectivePublic = publicConfig;

  if (isAdmin) {
    const [adminView, localSaved] = await Promise.all([
      fetchAdminSettings(),
      kvGet<Partial<Settings>>(SETTINGS_KEY),
    ]);
    settings = mergeAdminSettings(adminView, localSaved ?? null);
    if (adminView) {
      effectivePublic = publicConfigFromAdmin(adminView);
      apiKeyConfigured = adminView.apiKeyConfigured || Boolean(settings.apiKey.trim());
      imageApiKeyConfigured =
        adminView.imageApiKeyConfigured || Boolean(settings.imageApiKey.trim());
      apiKeyMask = adminView.apiKeyMask;
      imageApiKeyMask = adminView.imageApiKeyMask;
      settingsLastSavedAt = adminView.updatedAt;
    } else {
      apiKeyConfigured = Boolean(settings.apiKey.trim()) || publicConfig.configured;
      imageApiKeyConfigured = Boolean(settings.imageApiKey.trim()) || publicConfig.imageConfigured;
    }
  } else {
    settings = buildSafeVisitorSettings(publicConfig);
  }

  // 分享/调试参数：仅站长态允许 ?demo=1 覆盖演示模式，非站长不可篡改配置
  const params = new URLSearchParams(window.location.search);
  if (isAdmin && params.get('demo') === '1') {
    settings = { ...settings, mockMode: true };
  }

  const index = (savedIndex ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt);

  let conversation: Conversation | null = null;
  if (index.length > 0) {
    conversation = (await kvGet<Conversation>(convKey(index[0].id))) ?? null;
  }
  if (!conversation) conversation = newConversation();

  const skills = savedSkills && savedSkills.length > 0 ? savedSkills : BUILTIN_SKILLS;
  let memories = savedMemories ?? [];
  let tasks = savedTasks ?? [];
  const notes = savedNotes ?? [];
  if (settings.mockMode && memories.length === 0 && tasks.length === 0) {
    memories = DEMO_MEMORIES();
  }
  const remindIn = Number(params.get('remind'));
  if (isAdmin && settings.mockMode && Number.isFinite(remindIn) && remindIn > 0) {
    const now = Date.now();
    tasks = [
      {
        id: uid('task'),
        title: '喝口水，站起来走两分钟',
        status: 'todo',
        notes: '演示提醒：这是 6 秒前安排的一个提醒',
        reminderAt: now + remindIn * 1000,
        createdAt: now,
        updatedAt: now,
      },
      ...tasks,
    ];
  }

  setState({
    ready: true,
    isAdmin,
    adminUsername,
    authLoaded: true,
    publicConfig: effectivePublic,
    apiKeyConfigured,
    imageApiKeyConfigured,
    apiKeyMask,
    imageApiKeyMask,
    settingsLastSavedAt,
    settings,
    index,
    conversation,
    memories,
    tasks,
    notes,
    skills,
    view: isAdmin ? state.view : 'chat',
  });
  setSkillRegistry(skills);
  applyTheme(settings.theme);

  if (!listenersBound) {
    listenersBound = true;
    window.addEventListener('beforeunload', () => {
      void flushNow();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushNow();
    });
    window
      .matchMedia?.('(prefers-color-scheme: dark)')
      .addEventListener?.('change', () => {
        if (state.settings.theme === 'auto') applyTheme('auto');
      });
  }

  void conversations.pruneOrphans().catch(() => {});
}

export function applyTheme(theme: Settings['theme']): void {
  const rootTheme =
    typeof document !== 'undefined'
      ? document.documentElement.dataset.theme ??
        (document.documentElement.classList.contains('dark') ? 'dark' : 'light')
      : null;
  const prefersDark =
    rootTheme === 'dark'
      ? true
      : rootTheme === 'light'
        ? false
        : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  const dark = theme === 'dark' || (theme === 'auto' && prefersDark);
  themeHost()?.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0d12' : '#f6f7fb');
}

/** 安全门控后的打开设置入口：仅站长可用。 */
export function openSettings(): boolean {
  if (!state.isAdmin) {
    setState({ view: 'chat', drawerOpen: false });
    toast('设置仅限站长使用，请先登录站长账号', 'info');
    return false;
  }
  setState({ view: 'settings', drawerOpen: false });
  return true;
}

export function closeSettings(): void {
  setState({ view: 'chat', drawerOpen: false });
}

export function setView(view: View): void {
  if (view === 'settings') {
    openSettings();
    return;
  }
  setState({ view: 'chat', drawerOpen: false });
}

export function setDrawer(open: boolean): void {
  setState({ drawerOpen: open });
}

export function updateSettings(patch: Partial<Settings>): void {
  if (!state.isAdmin) {
    toast('仅站长可修改助理设置', 'error');
    return;
  }
  const settings = { ...state.settings, ...patch };
  const nextPublicConfig: AssistantPublicConfig = {
    ...state.publicConfig,
    displayName: settings.displayName.trim() || DEFAULT_SETTINGS.displayName,
    welcomeMessage: settings.welcomeMessage,
    model: settings.model,
    thinking: settings.thinking,
    effort: settings.effort,
    webSearch: settings.webSearch,
    readUrl: settings.readUrl,
    persona: settings.persona,
    replyStyle: settings.replyStyle,
    mockMode: settings.mockMode,
    configured: state.apiKeyConfigured || Boolean(settings.apiKey.trim()) || settings.mockMode,
    imageConfigured: state.imageApiKeyConfigured || Boolean(settings.imageApiKey.trim()),
  };
  setState({
    settings,
    publicConfig: nextPublicConfig,
    settingsSaveStatus: state.settingsSaveStatus === 'saving' ? 'saving' : 'idle',
    settingsSaveError: null,
  });
  saveSettingsSoon();
  if (patch.theme) applyTheme(settings.theme);
}

/** 将当前站长配置持久化到服务端 `/api/admin/assistant/settings`。 */
export async function saveAdminSettings(options: {
  clearApiKey?: boolean;
  clearImageApiKey?: boolean;
} = {}): Promise<boolean> {
  if (!state.isAdmin) {
    toast('仅站长可保存助理设置', 'error');
    return false;
  }

  setState({ settingsSaveStatus: 'saving', settingsSaveError: null });
  const s = state.settings;
  const payload = {
    displayName: s.displayName,
    welcomeMessage: s.welcomeMessage,
    baseUrl: s.baseUrl,
    model: s.model,
    maxTokens: s.maxTokens,
    systemPrompt: s.systemPrompt,
    thinking: s.thinking,
    effort: s.effort,
    webSearch: s.webSearch,
    readUrl: s.readUrl,
    safety: s.safety,
    autoTitle: s.autoTitle,
    autoMemory: s.autoMemory,
    persona: s.persona,
    replyStyle: s.replyStyle,
    addressName: s.addressName,
    addressTone: s.addressTone,
    team: s.team,
    voiceId: s.voiceId,
    autoRead: s.autoRead,
    mockMode: s.mockMode,
    imageBaseUrl: s.imageBaseUrl,
    imageModel: s.imageModel,
    imageQuality: s.imageQuality,
    imageAspect: s.imageAspect,
    apiKey: options.clearApiKey ? undefined : s.apiKey.trim() || undefined,
    clearApiKey: Boolean(options.clearApiKey),
    imageApiKey: options.clearImageApiKey ? undefined : s.imageApiKey.trim() || undefined,
    clearImageApiKey: Boolean(options.clearImageApiKey),
  };

  try {
    const saved = await siteAdminRequest<AdminSettingsResponse>('/api/admin/assistant/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const nextSettings: Settings = {
      ...state.settings,
      displayName: saved.displayName,
      welcomeMessage: saved.welcomeMessage,
      baseUrl: saved.baseUrl,
      model: saved.model,
      maxTokens: saved.maxTokens,
      systemPrompt: saved.systemPrompt,
      thinking: saved.thinking,
      effort: saved.effort,
      webSearch: saved.webSearch,
      readUrl: saved.readUrl,
      safety: saved.safety,
      autoTitle: saved.autoTitle,
      autoMemory: saved.autoMemory,
      persona: saved.persona,
      replyStyle: saved.replyStyle,
      addressName: saved.addressName,
      addressTone: saved.addressTone,
      team: saved.team,
      voiceId: saved.voiceId,
      autoRead: saved.autoRead,
      mockMode: saved.mockMode,
      imageBaseUrl: saved.imageBaseUrl,
      imageModel: saved.imageModel,
      imageQuality: saved.imageQuality,
      imageAspect: saved.imageAspect,
      // 保存成功后清空输入框中的明文密钥，后续统一走服务端加密密钥代理
      apiKey: '',
      imageApiKey: '',
    };
    const nextPublicConfig = publicConfigFromAdmin(saved);
    setState({
      settings: nextSettings,
      publicConfig: nextPublicConfig,
      apiKeyConfigured: saved.apiKeyConfigured,
      apiKeyMask: saved.apiKeyMask,
      imageApiKeyConfigured: saved.imageApiKeyConfigured,
      imageApiKeyMask: saved.imageApiKeyMask,
      settingsSaveStatus: 'saved',
      settingsSaveError: null,
      settingsLastSavedAt: saved.updatedAt,
    });
    const { apiKey: _a, imageApiKey: _b, ...safeSettings } = nextSettings;
    void kvSet(SETTINGS_KEY, safeSettings);
    toast(
      options.clearApiKey
        ? '已清除 DeepSeek API Key'
        : options.clearImageApiKey
          ? '已清除生图 API Key'
          : '助理设置已保存',
      'success',
    );
    return true;
  } catch (error) {
    const message = describeSiteAdminError(error);
    if (error instanceof SiteAdminApiError && error.status === 401) {
      setState({
        isAdmin: false,
        adminUsername: null,
        authLoaded: true,
        view: 'chat',
        settings: buildSafeVisitorSettings(state.publicConfig),
        apiKeyMask: '',
        imageApiKeyMask: '',
        settingsSaveStatus: 'error',
        settingsSaveError: message,
      });
    } else {
      setState({ settingsSaveStatus: 'error', settingsSaveError: message });
    }
    toast(message, 'error');
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 会话管理                                                           */
/* ------------------------------------------------------------------ */

let streamAbort: AbortController | null = null;
/** 递增的流标识：只有最新一次 runStream 能写入消息，避免并发流把同一段文本写两遍。 */
let streamRunId = 0;

export function isStreaming(): boolean {
  return state.streaming;
}

/* ------------------------------------------------------------------ */
/* 会话管理 —— 实现见 conversations.ts，这里只做接线                     */
/* ------------------------------------------------------------------ */

const conversations = createConversations({
  getState: () => state,
  setState,
  toast,
  stopStreaming,
});

/** 薄封装：turn.ts 与去抖落盘都走这里，签名保持不变。 */
function persistConversation(conv?: Conversation | null): Promise<void> {
  return conversations.persistConversation(conv);
}

export async function startNewConversation(): Promise<void> {
  await conversations.startNewConversation();
}

export async function openConversation(id: string): Promise<void> {
  await conversations.openConversation(id);
}

export async function removeConversation(id: string): Promise<void> {
  await conversations.removeConversation(id);
}

export function renameConversation(title: string): void {
  conversations.renameConversation(title);
}

/* ------------------------------------------------------------------ */
/* 发送与流式                                                          */
/* ------------------------------------------------------------------ */

function ensureReady(): boolean {
  if (state.streaming) {
    toast('正在生成回答，请先停止', 'info');
    return false;
  }
  const hasKey =
    Boolean(state.settings.apiKey.trim()) ||
    state.apiKeyConfigured ||
    state.publicConfig.configured;
  if (!hasKey && !state.settings.mockMode) {
    if (state.isAdmin) {
      toast('请先在设置里填写并保存 DeepSeek API Key（或开启演示模式）', 'error');
      openSettings();
    } else {
      toast('AI 助理服务暂未由站长开放或尚未完成配置', 'info');
    }
    return false;
  }
  return true;
}

let flushQueued = false;

function flushSoon(): void {
  if (flushQueued) return;
  flushQueued = true;
  requestAnimationFrame(() => {
    flushQueued = false;
    setState((s) => ({ streamRev: s.streamRev + 1 }));
    schedulePersist();
  });
}

/* ------------------------------------------------------------------ */
/* runStream 接线：turn.ts 只吃这套函数，不反向 import store              */
/* ------------------------------------------------------------------ */

const turnDeps: TurnDeps = {
  getState: () => state,
  setState,
  flushSoon,
  schedulePersist,
  nextRunId: () => (streamRunId = nextRunId(streamRunId)),
  isCurrent: (runId) => runId === streamRunId,
  abortPrev: () => {
    streamAbort = abortPrevious(streamAbort);
    return streamAbort;
  },
  clearStream: (controller) => {
    if (streamAbort === controller) streamAbort = null;
  },
  executeTool: (name, input, ctx) => executeTool(name, input, ctx),
  toolContext,
  speakMessage,
  extractMemories,
  persistConversation,
  toast,
};

/** 薄封装：对外签名不变，逻辑全部在 turn.ts（可在 Node 里注入假 deps 单测）。 */
function runStream(conv: Conversation, options: StreamRunOptions): Promise<void> {
  return turnRunStream(conv, options, turnDeps);
}

/* ------------------------------------------------------------------ */
/* 发送入口 —— 实现见 send.ts，这里只做接线                            */
/* ------------------------------------------------------------------ */

const send = createSend({
  getState: () => state,
  setState,
  toast,
  ensureReady,
  runStream,
});

export function sendMessage(text: string, attachments: Attachment[] = []): Promise<boolean> {
  return send.sendMessage(text, attachments);
}

export function regenerate(): Promise<void> {
  return send.regenerate();
}

export function continueGeneration(): Promise<void> {
  return send.continueGeneration();
}

export function editUserMessage(messageId: string, text: string): Promise<void> {
  return send.editUserMessage(messageId, text);
}

export function stopStreaming(): void {
  if (streamAbort) {
    streamAbort.abort();
    streamAbort = null;
  }
}

/* ------------------------------------------------------------------ */
/* 朗读（TTS）—— 实现在 tts.ts，这里只做接线                          */
/* ------------------------------------------------------------------ */

const ttsApi = createTts({ getState: () => state, setState, toast });

/** 朗读这条消息；正在朗读同一条时则停止（签名保持不变，UI 不用改）。 */
function speakMessage(messageId: string): Promise<void> {
  return ttsApi.speakMessage(messageId);
}

/** 立刻停掉当前朗读。 */
function stopSpeaking(): void {
  ttsApi.stopSpeaking();
}

export { speakMessage, stopSpeaking };

/* ------------------------------------------------------------------ */
/* 导入导出 —— 实现见 archive.ts，这里只做接线（站长专属门控）           */
/* ------------------------------------------------------------------ */

const archive = createArchive({ getState: () => state, setState, updateSettings });

export type { ExportBundle } from './archive';

export async function exportAll() {
  if (!state.isAdmin) {
    toast('仅站长可导出助理配置与数据', 'error');
    throw new Error('仅站长可导出助理配置与数据');
  }
  return archive.exportAll();
}

export async function importAll(raw: string) {
  if (!state.isAdmin) {
    toast('仅站长可导入助理配置与数据', 'error');
    throw new Error('仅站长可导入助理配置与数据');
  }
  return archive.importAll(raw);
}

export async function clearAllData(): Promise<void> {
  if (!state.isAdmin) {
    toast('仅站长可清空助理数据', 'error');
    return;
  }
  await archive.clearAllData();
  toast('本机对话数据已清空', 'success');
}

/* ------------------------------------------------------------------ */
/* 个人 Agent：实现见 agentStore.ts，这里只做接线                       */
/* ------------------------------------------------------------------ */

const agent = createAgentStore({ getState: () => state, setState, toast });

/** 从通知点进来：打开面板并高亮对应任务。 */
export function setAgentOpen(open: boolean): void {
  agent.setAgentOpen(open);
}

/** 清掉高亮（面板关闭或用户手动切换时）。 */
export function clearTaskFocus(): void {
  agent.clearTaskFocus();
}

/** 面板里手动添加一条记忆。 */
export function addMemory(text: string, tags: string[] = []) {
  return agent.addMemory(text, tags);
}

export function deleteMemory(id: string): void {
  agent.deleteMemory(id);
}

export function updateTask(id: string, patch: TaskPatch) {
  return agent.updateTask(id, patch);
}

export function toggleSkill(id: string): void {
  if (!state.isAdmin) {
    toast('仅站长可修改技能库配置', 'error');
    return;
  }
  agent.toggleSkill(id);
}

export function deleteSkill(id: string): void {
  if (!state.isAdmin) {
    toast('仅站长可删除技能', 'error');
    return;
  }
  agent.deleteSkill(id);
}

export function installSkills(ids: string[]): number {
  if (!state.isAdmin) {
    toast('仅站长可安装技能', 'error');
    return 0;
  }
  return agent.installSkills(ids);
}

export function addSkill(input: SkillInput) {
  if (!state.isAdmin) {
    toast('仅站长可新增技能', 'error');
    return null;
  }
  return agent.addSkill(input);
}

export function addNote(input: { title?: string; text: string }) {
  return agent.addNote(input);
}

export function deleteNote(id: string): void {
  agent.deleteNote(id);
}

/* turn.ts 只认这两个能力，函数声明保证在 turnDeps 初始化前已可引用。 */
function toolContext() {
  return agent.toolContext();
}

function extractMemories(conv: Conversation) {
  return agent.extractMemories(conv);
}

/* ------------------------------------------------------------------ */
/* 演示模式样例数据                                                     */
/* ------------------------------------------------------------------ */

function DEMO_MEMORIES(): Memory[] {
  const now = Date.now();
  return [
    {
      id: uid('mem'),
      text: '用户习惯用 VS Code 写 Go，接口文档偏好 OpenAPI。',
      tags: ['工作方式'],
      source: 'auto',
      createdAt: now - 86400000 * 2,
      updatedAt: now - 86400000 * 2,
      hits: 3,
    },
    {
      id: uid('mem'),
      text: '用户偏好先给结论再给理由，不喜欢客套话。',
      tags: ['偏好'],
      source: 'user',
      createdAt: now - 86400000,
      updatedAt: now - 86400000,
      hits: 5,
    },
    {
      id: uid('mem'),
      text: '用户正在把私人 AI 助理做成手机 App，想上线给朋友用。',
      tags: ['项目'],
      source: 'auto',
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
      hits: 1,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 主动性：到点提醒                                                     */
/* ------------------------------------------------------------------ */

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

/** 用户点「开启系统通知」时申请权限；失败也不影响应用内横幅。 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

export function dismissReminder(): void {
  const active = state.reminder;
  if (active) {
    const task = state.tasks.find((t) => t.id === active.taskId);
    if (task?.recurrence) {
      updateTask(task.id, {
        reminderAt: nextOccurrence(task.recurrence, Date.now()),
        notified: false,
      });
    } else if (task?.snoozeMinutes) {
      updateTask(task.id, {
        reminderAt: Date.now() + task.snoozeMinutes * 60_000,
        notified: false,
      });
    }
  }
  setState({ reminder: null });
}

export function completeReminder(): void {
  const active = state.reminder;
  if (!active) return;
  const task = state.tasks.find((t) => t.id === active.taskId);
  if (task) {
    const message = agent.completeTaskOnce(task);
    toast(message, 'success');
  }
  setState({ reminder: null });
}

export function snoozeReminder(minutes = 10): void {
  const active = state.reminder;
  if (!active) return;
  updateTask(active.taskId, { reminderAt: Date.now() + minutes * 60_000, notified: false });
  setState({ reminder: null });
  toast(`${minutes} 分钟后再说`, 'info');
}

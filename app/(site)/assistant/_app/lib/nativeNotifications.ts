/**
 * 原生本地通知（Capacitor）。
 *
 * 目的：网页/PWA 只有在页面活着时才能检查提醒；包成原生 App 后，
 * 把提醒交给系统闹钟（@capacitor/local-notifications），App 关掉也能按时弹。
 *
 * 设计：
 * - 所有调用都先看 `Capacitor.isNativePlatform()`，网页环境下直接 no-op，
 *   不改变现有的「应用内横幅 + Web Notification」行为；
 * - 同步策略是「全量覆盖」：取消所有待触发通知，再按当前任务重新排，
 *   避免任务被改时间/删除后留下幽灵提醒；
 * - 通知 id 由任务 id 哈希成稳定的 32 位整数（Capacitor 只接受 number id）。
 */
import type { AgentTask } from '../agent/types';

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  platform?: string;
}

interface LocalNotificationsPlugin {
  requestPermissions(): Promise<{ display?: string }>;
  checkPermissions(): Promise<{ display?: string }>;
  registerActionTypes?(options: {
    types: Array<{
      id: string;
      actions: Array<{ id: string; title: string }>;
    }>;
  }): Promise<void>;
  schedule(options: {
    notifications: Array<{
      id: number;
      title: string;
      body: string;
      actionTypeId?: string;
      schedule: { at: Date; allowWhileIdle?: boolean };
    }>;
  }): Promise<void>;
  cancel(options: { notifications: Array<{ id: number }> }): Promise<void>;
  getPending(): Promise<{ notifications: Array<{ id: number }> }>;
  addListener?(
    eventName: 'localNotificationActionPerformed',
    listener: (event: {
      actionId?: string;
      notification?: { id?: number };
    }) => void,
  ): Promise<{ remove?: () => void }>;
}

/** 通知上的操作按钮（Android 会渲染成通知里的按钮） */
export const REMINDER_ACTION_TYPE = 'AGENT_REMINDER';
export const ACTION_COMPLETE = 'complete';
export const ACTION_SNOOZE = 'snooze';

export function isNativeApp(): boolean {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function nativePlatform(): string {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.platform ?? 'web';
}

/** 任务 id → 稳定的正整数通知 id。 */
export function nativeNotificationId(taskId: string): number {
  let hash = 5381;
  for (let i = 0; i < taskId.length; i += 1) {
    hash = ((hash << 5) + hash + taskId.charCodeAt(i)) >>> 0;
  }
  return (hash % 2_000_000_000) + 1;
}

async function loadPlugin(): Promise<LocalNotificationsPlugin | null> {
  if (!isNativeApp()) return null;
  try {
    const mod = (await import('@capacitor/local-notifications')) as unknown as {
      LocalNotifications?: LocalNotificationsPlugin;
    };
    return mod.LocalNotifications ?? null;
  } catch {
    return null;
  }
}

async function ensurePermission(plugin: LocalNotificationsPlugin): Promise<boolean> {
  try {
    const current = await plugin.checkPermissions();
    if (current?.display === 'granted') return true;
    const asked = await plugin.requestPermissions();
    return asked?.display === 'granted';
  } catch {
    return false;
  }
}

async function ensureActionTypes(plugin: LocalNotificationsPlugin): Promise<void> {
  if (!plugin.registerActionTypes) return;
  try {
    await plugin.registerActionTypes({
      types: [
        {
          id: REMINDER_ACTION_TYPE,
          actions: [
            { id: ACTION_COMPLETE, title: '完成' },
            { id: ACTION_SNOOZE, title: '10 分钟后' },
          ],
        },
      ],
    });
  } catch {
    // 注册失败时通知仍可点击，只是没有按钮
  }
}

/**
 * 把「当前所有任务的提醒」同步给系统闹钟。
 * 网页环境 / 未装插件 / 权限被拒时静默返回 false。
 */
export async function syncNativeReminders(tasks: AgentTask[], now = Date.now()): Promise<boolean> {
  const plugin = await loadPlugin();
  if (!plugin) return false;
  if (!(await ensurePermission(plugin))) return false;
  await ensureActionTypes(plugin);

  try {
    const pending = await plugin.getPending();
    if (pending.notifications.length > 0) {
      await plugin.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }

    const upcoming = tasks
      .filter((task) => task.status !== 'done' && task.reminderAt && task.reminderAt > now)
      .sort((a, b) => (a.reminderAt ?? 0) - (b.reminderAt ?? 0))
      .slice(0, 40);

    if (upcoming.length === 0) return true;

    await plugin.schedule({
      notifications: upcoming.map((task) => ({
        id: nativeNotificationId(task.id),
        title: `提醒：${task.title}`,
        body: task.notes?.trim() || '来自你的个人 Agent',
        actionTypeId: REMINDER_ACTION_TYPE,
        schedule: {
          at: new Date(task.reminderAt as number),
          // Android：允许在低电耗模式下触发
          allowWhileIdle: true,
        },
      })),
    });
    return true;
  } catch {
    return false;
  }
}

/** 预览用：返回将要被系统排程的任务（不接触插件）。 */
export function upcomingNativeReminders(tasks: AgentTask[], now = Date.now()): AgentTask[] {
  return tasks
    .filter((task) => task.status !== 'done' && task.reminderAt && task.reminderAt > now)
    .sort((a, b) => (a.reminderAt ?? 0) - (b.reminderAt ?? 0));
}

/**
 * 用户点系统通知时回调通知 id（= nativeNotificationId(taskId)）。
 * 返回取消订阅的函数；网页环境或没有插件时返回空函数。
 */
export async function onNativeNotificationTap(
  handler: (notificationId: number, actionId: string | null) => void,
): Promise<() => void> {
  const plugin = await loadPlugin();
  if (!plugin?.addListener) return () => {};
  try {
    const handle = await plugin.addListener('localNotificationActionPerformed', (event) => {
      const id = event?.notification?.id;
      if (typeof id === 'number') handler(id, event?.actionId ?? null);
    });
    return () => {
      try {
        handle?.remove?.();
      } catch {
        // 忽略卸载异常
      }
    };
  } catch {
    return () => {};
  }
}

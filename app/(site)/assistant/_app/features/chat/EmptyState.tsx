import { useMemo, useState } from 'react';
import { openSettings, sendMessage, setAgentOpen, useApp } from '../../state/store';
import {
  BookIcon,
  BrainIcon,
  CodeIcon,
  GlobeIcon,
  LightbulbIcon,
  LockIcon,
  LogInIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
  SparkIcon,
  WandIcon,
} from '../../ui/Icons';

type ScenarioCategory = 'all' | 'writing' | 'coding' | 'summary' | 'brainstorm';

interface ScenarioItem {
  id: string;
  category: Exclude<ScenarioCategory, 'all'>;
  categoryLabel: string;
  icon: typeof SparkIcon;
  title: string;
  desc: string;
  prompt: string;
  featured?: boolean;
}

const CATEGORIES: Array<{ key: ScenarioCategory; label: string }> = [
  { key: 'all', label: '精选场景' },
  { key: 'writing', label: '写作润色' },
  { key: 'coding', label: '代码排查' },
  { key: 'summary', label: '知识总结' },
  { key: 'brainstorm', label: '灵感头脑风暴' },
];

const SCENARIOS: ScenarioItem[] = [
  {
    id: 'writing-polish',
    category: 'writing',
    categoryLabel: '写作润色',
    icon: WandIcon,
    title: '润色技术博客与个人简介',
    desc: '优化表达层次与语气，专业清晰但不油腻',
    prompt: '请帮我润色下面这段文字，让逻辑更紧凑、语气自然克制，并保留核心技术要点：\n\n',
    featured: true,
  },
  {
    id: 'writing-weekly',
    category: 'writing',
    categoryLabel: '写作润色',
    icon: WandIcon,
    title: '把零散记录整理成结构化周报',
    desc: '提炼本周产出、风险阻塞与下周计划',
    prompt: '请根据以下零散工作记录，整理成一份简洁清晰的结构化周报（含核心进展、问题与下周重点）：\n\n',
  },
  {
    id: 'coding-debug',
    category: 'coding',
    categoryLabel: '代码排查',
    icon: CodeIcon,
    title: '定位 TypeScript / Next.js 报错',
    desc: '结合堆栈分析根因并给出最小修改方案',
    prompt: '请帮我排查下面这段报错日志，先给最可能的根因排序，再给出最小化的修复代码：\n\n```\n\n```',
    featured: true,
  },
  {
    id: 'coding-review',
    category: 'coding',
    categoryLabel: '代码排查',
    icon: CodeIcon,
    title: '评审代码边界条件与性能',
    desc: '检查状态同步、并发竞态与可维护性',
    prompt: '请帮我做一次代码审查，重点关注边界条件、潜在内存/性能问题和可读性改进：\n\n```\n\n```',
  },
  {
    id: 'summary-news',
    category: 'summary',
    categoryLabel: '知识总结',
    icon: BookIcon,
    title: '联网速览前沿技术动态',
    desc: '检索最新资讯、按重要性归类并附出处',
    prompt: '今天 AI 与前端技术圈有哪些值得关注的新动态？请按重要性排序并给出来源链接。',
    featured: true,
  },
  {
    id: 'summary-link',
    category: 'summary',
    categoryLabel: '知识总结',
    icon: GlobeIcon,
    title: '提炼长文或文档链接核心要点',
    desc: '快速梳理背景、关键结论与行动建议',
    prompt: '请帮我阅读并总结这篇资料的核心观点、适用场景与 3 条可执行建议：',
  },
  {
    id: 'brainstorm-arch',
    category: 'brainstorm',
    categoryLabel: '灵感头脑风暴',
    icon: LightbulbIcon,
    title: '多维度对比产品与技术方案',
    desc: '列出收益、成本、风险与分阶段落地路径',
    prompt: '帮我对比两个实现方案的取舍：请从开发成本、用户体验、维护复杂度三个维度给建议，场景是：',
    featured: true,
  },
  {
    id: 'brainstorm-ideas',
    category: 'brainstorm',
    categoryLabel: '灵感头脑风暴',
    icon: BrainIcon,
    title: '为个人网站发散选题与交互灵感',
    desc: '提供差异化视角与可落地的微交互创意',
    prompt: '我想给个人网站新增一个有趣又实用的专栏或互动小工具，请帮我发散 5 个有辨识度的方向，并说明亮点。',
  },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

export default function EmptyState({
  onFillPrompt,
}: {
  onFillPrompt?: (prompt: string) => void;
}) {
  const {
    settings,
    memories,
    isAdmin,
    adminUsername,
    publicConfig,
    apiKeyConfigured,
  } = useApp();
  const [category, setCategory] = useState<ScenarioCategory>('all');

  const displayName = publicConfig?.displayName?.trim() || '私人 AI 助理';
  const isMock = Boolean(settings.mockMode || publicConfig?.mockMode);
  const isConfigured = Boolean(
    settings.apiKey.trim() || apiKeyConfigured || publicConfig?.configured,
  );
  const needsKey = !isConfigured && !isMock;
  const activeModel = isAdmin ? settings.model : publicConfig?.model || settings.model;
  const thinkingOn = isAdmin ? settings.thinking : Boolean(publicConfig?.thinking ?? settings.thinking);
  const webSearchOn = isAdmin ? settings.webSearch : Boolean(publicConfig?.webSearch ?? settings.webSearch);

  const visibleScenarios = useMemo(() => {
    if (category === 'all') return SCENARIOS.filter((item) => item.featured);
    return SCENARIOS.filter((item) => item.category === category);
  }, [category]);

  const handleCardPick = (prompt: string) => {
    if (!isAdmin) return;
    if (onFillPrompt) onFillPrompt(prompt);
    else void sendMessage(prompt);
  };

  return (
    <div className="empty">
      <div className="empty-hero">
        <div className="empty-mark" aria-hidden="true">
          <SparkIcon size={28} />
        </div>
        <div className="empty-badge">
          <span className="today-date">{todayLabel()}</span>
          <span className="empty-badge-sep" aria-hidden="true">·</span>
          <span>{displayName}</span>
        </div>
        <h1 className="empty-title">{greeting()}，随时开始对话</h1>
        <p className="empty-sub">
          {!isAdmin
            ? '私人 AI 助理仅对站长本人开放，请先登录后台账号后使用。'
            : publicConfig?.welcomeMessage?.trim()
              ? publicConfig.welcomeMessage.trim()
              : needsKey
                ? '完成 API Key 配置后即可体验联网检索、深度思考、文档阅读与语音输入。'
                : '支持联网检索、深度推理、代码高亮、多图附件与个人长期记忆，点击下方场景即可开始。'}
        </p>

        <div className="empty-status-pill" role="status">
          <span
            className={`status-dot ${isMock ? 'is-demo' : isConfigured ? 'is-ready' : 'is-unconfigured'}`}
            aria-hidden="true"
          />
          <span className="empty-status-model">
            {isMock ? '演示模式' : activeModel}
          </span>
          {!isMock && thinkingOn ? <span className="empty-status-tag">深度思考</span> : null}
          {!isMock && webSearchOn ? <span className="empty-status-tag">联网检索</span> : null}
          <span className={`empty-status-role ${isAdmin ? 'is-admin' : ''}`}>
            {isAdmin ? (
              <>
                <ShieldIcon size={12} />
                {adminUsername || '站长'}
              </>
            ) : (
              '访客视图'
            )}
          </span>
        </div>
      </div>

      {isAdmin && needsKey ? (
        <button type="button" className="empty-cta" onClick={() => openSettings()}>
          <SettingsIcon size={16} />
          打开设置配置 API Key
        </button>
      ) : null}

      {!isAdmin ? (
        <div className="empty-readonly-notice">
          <LockIcon size={15} />
          <span>私人 AI 助理仅限站长本人登录使用，访客不可发起对话。</span>
          <a href="/admin/login?next=/assistant" className="empty-login-link">
            <LogInIcon size={13} />
            站长登录
          </a>
        </div>
      ) : null}

      <div className="empty-cats" role="tablist" aria-label="快捷场景分类">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            role="tab"
            aria-selected={category === cat.key}
            className={`empty-cat-btn${category === cat.key ? ' is-active' : ''}`}
            onClick={() => setCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="suggestions">
        {visibleScenarios.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="suggestion suggestion-card">
              <button
                type="button"
                className="suggestion-main-btn"
                onClick={() => handleCardPick(item.prompt)}
                title="点击填入输入框"
              >
                <span className="suggestion-ico">
                  <Icon size={17} />
                </span>
                <span className="suggestion-main">
                  <span className="suggestion-top-row">
                    <span className="suggestion-tag">{item.categoryLabel}</span>
                  </span>
                  <span className="suggestion-title">{item.title}</span>
                  <span className="suggestion-desc">{item.desc}</span>
                </span>
              </button>
              <button
                type="button"
                className="suggestion-send"
                onClick={() => void sendMessage(item.prompt)}
                aria-label={`直接发送：${item.title}`}
                title="直接发送"
              >
                <SendIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="agent-hint">
        <span className="agent-hint-main">
          说「记住…」可沉淀长期记忆；点击卡片可先填入输入框微调，或点右侧箭头直接发送。
        </span>
        <button type="button" className="agent-hint-btn" onClick={() => setAgentOpen(true)}>
          <BrainIcon size={15} />
          个人 Agent
          <span className="agent-hint-count">记忆 {memories.length}</span>
        </button>
      </div>

      <p className="empty-foot">
        {isAdmin
          ? '站长已登录 · 服务端安全配置已就绪 · 对话历史保存在本机浏览器'
          : '对话记录仅保存在当前浏览器 · 模型与密钥设置由站长受保护管理'}
      </p>
    </div>
  );
}

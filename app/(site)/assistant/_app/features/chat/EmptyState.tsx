import { setAgentOpen, setView, sendMessage, useApp } from '../../state/store';
import {
  BookIcon,
  BrainIcon,
  GlobeIcon,
  SparkIcon,
} from '../../ui/Icons';

const SUGGESTIONS = [
  {
    icon: GlobeIcon,
    title: '今天科技圈有什么新闻？',
    desc: '联网搜索并给出引用来源',
    prompt: '今天科技圈有什么新闻？请联网搜索后按重要性排序，并给出来源。',
  },
  {
    icon: BookIcon,
    title: '帮我读这个链接',
    desc: '贴一个 URL，我自己打开读',
    prompt: '帮我读一下这个链接并总结要点：https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot',
  },
  {
    icon: BrainIcon,
    title: '深度思考 + 多步检索',
    desc: '比较两个方案的取舍',
    prompt: '深度思考一下：私人 AI 助理该用 PWA 还是原生 App？请多步检索后给出取舍建议。',
  },
  {
    icon: SparkIcon,
    title: '写点东西',
    desc: '文案、代码、周报都行',
    prompt: '帮我写一段 100 字以内的自我介绍，语气专业但不油腻。',
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

export default function EmptyState() {
  const { settings, memories } = useApp();
  const needsKey = !settings.apiKey.trim() && !settings.mockMode;

  return (
    <div className="empty">
      <div className="empty-mark">
        <SparkIcon size={26} />
      </div>
      <p className="today-date">{todayLabel()}</p>
      <h1 className="empty-title">{greeting()}，我是你的私人助理</h1>
      <p className="empty-sub">
        {needsKey
          ? '填好 DeepSeek API Key 就能开始。搜索、深度思考、读链接、看文件、语音输入都已接好。'
          : `已连接 ${settings.model}${settings.thinking ? ' · 深度思考' : ''}${settings.webSearch ? ' · 联网' : ''}`}
      </p>

      {needsKey ? (
        <button type="button" className="empty-cta" onClick={() => setView('settings')}>
          去填写 API Key
        </button>
      ) : null}

      <div className="agent-hint">
        <span className="agent-hint-main">
          说「记住…」会写进长期记忆；技能库里的技能会在命中场景时自动生效。
        </span>
        <button type="button" className="agent-hint-btn" onClick={() => setAgentOpen(true)}>
          <BrainIcon size={15} />
          个人 Agent
          <span className="agent-hint-count">记忆 {memories.length}</span>
        </button>
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              className="suggestion"
              onClick={() => void sendMessage(item.prompt)}
            >
              <span className="suggestion-ico">
                <Icon size={17} />
              </span>
              <span className="suggestion-main">
                <span className="suggestion-title">{item.title}</span>
                <span className="suggestion-desc">{item.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="empty-foot">
        API Key 与会话只保存在本机 · 支持「添加到主屏幕」当 App 用
      </p>
    </div>
  );
}

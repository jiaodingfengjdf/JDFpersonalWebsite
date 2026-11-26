import { useState } from 'react';
import type { Settings } from '../../api/types';
import { AGENT_TEAM, REPLY_STYLES, type ReplyStyleId } from '../../api/types';
import { downloadJson, pickFile } from '../../lib/download';
import {
  addSkill,
  clearAllData,
  closeSettings,
  deleteSkill,
  exportAll,
  importAll,
  saveAdminSettings,
  toast,
  toggleSkill,
  updateSettings,
  useApp,
} from '../../state/store';
import {
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  LockIcon,
  LogInIcon,
  ShieldIcon,
  TrashIcon,
  UploadIcon,
} from '../../ui/Icons';
import SettingsNav from './SettingsNav';
import SettingsRail from './SettingsRail';

/* ---------------- 基础控件 ---------------- */

function Section(props: {
  id: string;
  title: string;
  badge?: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={props.id} className="set-sec">
      <div className="settings-sec-head">
        <h2 className="set-sec-title">{props.title}</h2>
        {props.badge ? <span className="settings-sec-badge">{props.badge}</span> : null}
      </div>
      {props.desc ? <p className="set-sec-desc">{props.desc}</p> : null}
      <div className="set-card">{props.children}</div>
    </section>
  );
}

function Row(props: { label: string; hint?: string; stacked?: boolean; children: React.ReactNode }) {
  return (
    <div className={`set-row${props.stacked ? ' is-stacked' : ''}`}>
      <div className="set-row-main">
        <span className="set-label">{props.label}</span>
        {props.hint ? <span className="set-hint">{props.hint}</span> : null}
      </div>
      <div className="set-control">{props.children}</div>
    </div>
  );
}

function Toggle(props: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      className={`set-switch${props.checked ? ' is-on' : ''}`}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className="set-knob" />
    </button>
  );
}

function Seg<T extends string>(props: {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg">
      {props.options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`seg-item${props.value === value ? ' is-on' : ''}`}
          onClick={() => props.onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function formatSavedTime(iso: string | null): string {
  if (!iso) return '尚未同步到服务端';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '已同步';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export default function SettingsScreen() {
  const {
    isAdmin,
    adminUsername,
    authLoaded,
    settings,
    skills,
    apiKeyConfigured,
    apiKeyMask,
    imageApiKeyConfigured,
    imageApiKeyMask,
    settingsSaveStatus,
    settingsSaveError,
    settingsLastSavedAt,
  } = useApp();
  const [skillName, setSkillName] = useState('');
  const [skillWhen, setSkillWhen] = useState('');
  const [skillSteps, setSkillSteps] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // 兜底权限防线：即使组件被直接挂载，非站长绝不渲染任何配置表单或敏感信息
  if (!authLoaded || !isAdmin) {
    return (
      <div className="settings-screen">
        <header className="topbar settings-topbar">
          <button
            type="button"
            className="settings-back-btn"
            onClick={() => closeSettings()}
            aria-label="返回聊天"
          >
            <ArrowLeftIcon size={18} />
            <span>返回聊天</span>
          </button>
          <div className="topbar-mid">
            <span className="title-text">访问受限</span>
            <span className="title-sub">仅限站长管理 AI 助理设置</span>
          </div>
          <span className="icon-btn ghost" />
        </header>

        <div className="settings-locked">
          <div className="settings-locked-card" role="alert">
            <div className="settings-locked-icon">
              <LockIcon size={26} />
            </div>
            <h2 className="settings-locked-title">设置仅对站长开放</h2>
            <p className="settings-locked-desc">
              {authLoaded
                ? '模型连接、API 密钥、系统提示词与数据管理属于站长专属配置，当前访客会话为只读状态。'
                : '正在核验站长会话权限…'}
            </p>
            <div className="settings-locked-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => closeSettings()}
              >
                <ArrowLeftIcon size={15} />
                返回对话
              </button>
              <a className="settings-login-link" href="/admin/login?next=/assistant">
                <LogInIcon size={15} />
                站长登录
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    updateSettings({ [key]: value } as Partial<Settings>);

  const doExport = async () => {
    try {
      const data = await exportAll();
      downloadJson(`pocket-assistant-${new Date().toISOString().slice(0, 10)}.json`, data);
      toast('已导出', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '导出失败', 'error');
    }
  };

  const doImport = async () => {
    const file = await pickFile('application/json');
    if (!file) return;
    try {
      await importAll(await file.text());
      toast('已导入', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    }
  };

  const saveLabel =
    settingsSaveStatus === 'saving'
      ? '正在保存…'
      : settingsSaveStatus === 'saved'
        ? '已同步服务端'
        : settingsSaveStatus === 'error'
          ? '保存失败'
          : '待同步';

  const serviceReady = apiKeyConfigured || Boolean(settings.apiKey.trim()) || settings.mockMode;

  return (
    <div className="settings-screen">
      <header className="topbar settings-topbar">
        <button
          type="button"
          className="settings-back-btn"
          onClick={() => closeSettings()}
          aria-label="返回聊天"
        >
          <ArrowLeftIcon size={18} />
          <span>返回聊天</span>
        </button>

        <div className="topbar-mid">
          <div className="settings-topbar-title">
            <span className="title-text">助理设置</span>
            <span className="settings-admin-badge">
              <ShieldIcon size={13} />
              站长 · {adminUsername ?? 'admin'}
            </span>
          </div>
          <span className="title-sub">
            {settingsSaveError ?? `服务端安全存储 · 上次同步：${formatSavedTime(settingsLastSavedAt)}`}
          </span>
        </div>

        <div className="topbar-right">
          <span className={`settings-save-pill is-${settingsSaveStatus}`} role="status">
            {settingsSaveStatus === 'saved' ? <CheckIcon size={13} /> : null}
            {saveLabel}
          </span>
          <button
            type="button"
            className="settings-save-btn"
            disabled={settingsSaveStatus === 'saving'}
            onClick={() => void saveAdminSettings()}
          >
            {settingsSaveStatus === 'saving' ? '保存中…' : '保存设置'}
          </button>
        </div>
      </header>

      <div className="settings-shell">
        <SettingsRail />
        <div className="settings-pane" data-settings-root>
          <SettingsNav />

          <div className="settings-banner">
            <div className="settings-banner-item">
              <span className={`settings-status-dot ${serviceReady ? 'is-ready' : 'is-unconfigured'}`} />
              <span>
                {settings.mockMode
                  ? '演示模式已开启'
                  : serviceReady
                    ? '连接已就绪'
                    : '尚未配置 API Key'}
              </span>
            </div>
            <div className="settings-banner-item">
              <span>当前模型：{settings.model}</span>
            </div>
            <div className="settings-banner-item">
              <span>
                DeepSeek 密钥：
                {apiKeyMask || (settings.apiKey.trim() ? '本机已填写（待保存）' : '未配置')}
              </span>
            </div>
          </div>

          <Section
            id="set-sec-public"
            title="展示与公开信息"
            badge="访客可见"
            desc="仅这部分安全元数据会展示给访客，严禁在此填写任何密钥或私密信息。"
          >
            <Row label="助理名称" stacked hint="显示在页面标题与欢迎区">
              <input
                className="text-input"
                value={settings.displayName}
                onChange={(e) => set('displayName', e.target.value)}
                placeholder="私人 AI 助理"
                maxLength={60}
              />
            </Row>
            <Row label="欢迎语" stacked hint="访客与站长进入空白对话时看到的副标题">
              <textarea
                className="text-input resize-none"
                rows={2}
                value={settings.welcomeMessage}
                onChange={(e) => set('welcomeMessage', e.target.value)}
                placeholder="有什么可以帮你的？支持深度思考、联网检索与文档解析。"
                maxLength={240}
              />
            </Row>
            <Row label="演示模式" hint="开启后无需真实 API Key 即可体验模拟对话">
              <Toggle
                checked={settings.mockMode}
                onChange={(v) => set('mockMode', v)}
                label="演示模式"
              />
            </Row>
          </Section>

          <Section
            id="set-sec-connection"
            title="模型与密钥连接"
            badge="仅站长"
            desc="密钥经服务端加密存储且永不向访客返回；点击右上角「保存设置」同步到服务端。"
          >
            <Row label="DeepSeek API Key" stacked hint="留空保存将保留服务端已加密存储的密钥">
              <input
                className="text-input"
                type="password"
                value={settings.apiKey}
                onChange={(e) => set('apiKey', e.target.value)}
                placeholder={apiKeyConfigured ? `已配置（${apiKeyMask || '已加密'}），输入新密钥可覆盖` : 'sk-...'}
                autoComplete="off"
              />
              {apiKeyConfigured ? (
                <div className="settings-secret-meta">
                  <span className="settings-secret-mask">
                    已加密保存：{apiKeyMask || '已配置'}
                  </span>
                  <button
                    type="button"
                    className="settings-secret-clear"
                    disabled={settingsSaveStatus === 'saving'}
                    onClick={() => void saveAdminSettings({ clearApiKey: true })}
                  >
                    清除密钥
                  </button>
                </div>
              ) : null}
            </Row>
            <Row label="Base URL" stacked>
              <input
                className="text-input"
                value={settings.baseUrl}
                onChange={(e) => set('baseUrl', e.target.value)}
                autoComplete="off"
              />
            </Row>
            <Row label="模型" stacked hint="全家桶能力请用 deepseek-flash">
              <select
                className="text-input"
                value={settings.model}
                onChange={(e) => set('model', e.target.value)}
              >
                <option value="deepseek-flash">deepseek-flash</option>
                <option value="deepseek-v4-pro">deepseek-v4-pro</option>
              </select>
            </Row>
            <Row label="最大输出" hint="max_tokens">
              <input
                className="text-input"
                type="number"
                min={256}
                max={65536}
                value={settings.maxTokens}
                onChange={(e) => set('maxTokens', Number(e.target.value) || 4096)}
              />
            </Row>
            <Row label="生图 Base URL" stacked hint="第三方 GPT Image 网关">
              <input
                className="text-input"
                value={settings.imageBaseUrl}
                onChange={(e) => set('imageBaseUrl', e.target.value)}
              />
            </Row>
            <Row label="生图 API Key" stacked hint="与 DeepSeek Key 分开加密保存">
              <input
                className="text-input"
                type="password"
                value={settings.imageApiKey}
                onChange={(e) => set('imageApiKey', e.target.value)}
                placeholder={
                  imageApiKeyConfigured
                    ? `已配置（${imageApiKeyMask || '已加密'}），输入新密钥可覆盖`
                    : 'sk-...'
                }
              />
              {imageApiKeyConfigured ? (
                <div className="settings-secret-meta">
                  <span className="settings-secret-mask">
                    已加密保存：{imageApiKeyMask || '已配置'}
                  </span>
                  <button
                    type="button"
                    className="settings-secret-clear"
                    disabled={settingsSaveStatus === 'saving'}
                    onClick={() => void saveAdminSettings({ clearImageApiKey: true })}
                  >
                    清除密钥
                  </button>
                </div>
              ) : null}
            </Row>
            <Row label="生图模型" stacked>
              <select
                className="text-input"
                value={settings.imageModel}
                onChange={(e) => set('imageModel', e.target.value)}
              >
                {[
                  'gpt-image-2.6',
                  'gpt-image-2.6-flare',
                  'gpt-image-2.6-sunburst',
                  'gpt-image-2.5-sunburst',
                  'gpt-image-2.5-flare',
                  'gpt-image-vip',
                  'gpt-image-2',
                ].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="生图质量 / 比例" stacked>
              <div className="field-row">
                <select
                  className="text-input"
                  value={settings.imageQuality}
                  onChange={(e) => set('imageQuality', e.target.value)}
                >
                  {['auto', 'low', 'medium', 'high', 'xhigh', 'max'].map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
                <select
                  className="text-input"
                  value={settings.imageAspect}
                  onChange={(e) => set('imageAspect', e.target.value)}
                >
                  {[
                    'auto',
                    '1:1',
                    '16:9',
                    '9:16',
                    '4:3',
                    '3:4',
                    '1024x1024',
                    '1024x1536',
                    '1536x1024',
                  ].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </Row>
          </Section>

          <Section
            id="set-sec-behavior"
            title="对话行为与工具"
            badge="推理"
            desc="决定模型每一轮如何思考、是否启用联网搜索与长期记忆。"
          >
            <Row label="深度思考">
              <Toggle checked={settings.thinking} onChange={(v) => set('thinking', v)} label="深度思考" />
            </Row>
            <Row label="思考强度" stacked>
              <Seg
                value={settings.effort}
                options={[
                  ['', '默认'],
                  ['low', '低'],
                  ['medium', '中'],
                  ['high', '高'],
                ]}
                onChange={(v) => set('effort', v)}
              />
            </Row>
            <Row label="联网搜索">
              <Toggle checked={settings.webSearch} onChange={(v) => set('webSearch', v)} label="联网搜索" />
            </Row>
            <Row label="阅读链接">
              <Toggle checked={settings.readUrl} onChange={(v) => set('readUrl', v)} label="阅读链接" />
            </Row>
            <Row label="内容安全">
              <Toggle
                checked={settings.safety === 'high'}
                onChange={(v) => set('safety', v ? 'high' : 'low')}
                label="内容安全"
              />
            </Row>
            <Row label="自动会话标题">
              <Toggle checked={settings.autoTitle} onChange={(v) => set('autoTitle', v)} label="自动会话标题" />
            </Row>
            <Row label="自动记忆">
              <Toggle checked={settings.autoMemory} onChange={(v) => set('autoMemory', v)} label="自动记忆" />
            </Row>
            <Row label="助理人设" stacked>
              <Seg
                value={settings.persona}
                options={[
                  ['assistant', '助理'],
                  ['coach', '教练'],
                  ['tutor', '学习'],
                  ['writer', '写作'],
                ]}
                onChange={(v) => set('persona', v)}
              />
            </Row>
          </Section>

          <Section
            id="set-sec-style"
            title="交流风格与提示词"
            badge="提示词"
            desc="影响每轮回答的语气与详略，系统提示词仅站长可见可改。"
          >
            <Row label="回复风格" stacked>
              <select
                className="text-input"
                value={settings.replyStyle}
                onChange={(e) => set('replyStyle', e.target.value as ReplyStyleId)}
              >
                {REPLY_STYLES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.desc}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="称呼" hint="留空用「你」，可写 老板 / 老王 / 博士">
              <input
                className="text-input"
                value={settings.addressName}
                onChange={(e) => set('addressName', e.target.value)}
                placeholder="留空 = 你"
              />
            </Row>
            <Row label="称呼语气" stacked>
              <Seg
                value={settings.addressTone}
                options={[
                  ['casual', '你'],
                  ['polite', '您'],
                ]}
                onChange={(v) => set('addressTone', v)}
              />
            </Row>
            <Row label="额外指令" stacked hint="每次对话都会追加在系统提示词末尾">
              <textarea
                className="text-input resize-none"
                rows={3}
                value={settings.systemPrompt}
                onChange={(e) => set('systemPrompt', e.target.value)}
                placeholder="例如：回答尽量简短，先给结论再给理由"
              />
            </Row>
          </Section>

          <Section
            id="set-sec-team"
            title="智能体团队"
            badge={`${settings.team.length} 成员`}
            desc="勾选的成员写进系统提示词，第一个为主责人。"
          >
            <div className="team-grid">
              {AGENT_TEAM.map((member) => {
                const on = settings.team.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    className={`team-card${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const next = on
                        ? settings.team.filter((id) => id !== member.id)
                        : [...settings.team, member.id];
                      set('team', next.length > 0 ? next : ['chief']);
                    }}
                  >
                    <span className="team-head">
                      <span className="team-emoji">{member.emoji}</span>
                      <span className="team-name">{member.name}</span>
                      {settings.team[0] === member.id ? <span className="team-badge">主责</span> : null}
                    </span>
                    <span className="team-role">{member.role}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            id="set-sec-skills"
            title="技能库"
            badge={`${skills.length} 项`}
            desc="启用的技能按「何时用」自动匹配；内置可停用，自建可删除。"
          >
            <div className="skill-grid">
              {skills.map((skill) => (
                <div key={skill.id} className={`skill-card${skill.enabled ? ' is-on' : ''}`}>
                  <div className="skill-head">
                    <span className="skill-emoji">{skill.emoji}</span>
                    <span className="skill-name">{skill.name}</span>
                    {skill.builtin ? <span className="skill-tag">内置</span> : null}
                  </div>
                  <p className="skill-when">{skill.when}</p>
                  <div className="skill-actions">
                    <button type="button" className="secondary-btn" onClick={() => toggleSkill(skill.id)}>
                      {skill.enabled ? '停用' : '启用'}
                    </button>
                    {skill.builtin ? null : (
                      <button type="button" className="skill-del" onClick={() => deleteSkill(skill.id)}>
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="skill-form">
              <input
                className="text-input"
                placeholder="技能名，例如 投研速读"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
              />
              <input
                className="text-input"
                placeholder="何时用：用户贴出长文要我速读时"
                value={skillWhen}
                onChange={(e) => setSkillWhen(e.target.value)}
              />
              <textarea
                className="text-input resize-none"
                rows={3}
                placeholder="具体步骤：1) … 2) …"
                value={skillSteps}
                onChange={(e) => setSkillSteps(e.target.value)}
              />
              <button
                type="button"
                className="secondary-btn"
                disabled={!skillName.trim() || !skillWhen.trim() || !skillSteps.trim()}
                onClick={() => {
                  const created = addSkill({ name: skillName, when: skillWhen, steps: skillSteps });
                  if (created) {
                    setSkillName('');
                    setSkillWhen('');
                    setSkillSteps('');
                    toast('技能已安装', 'success');
                  }
                }}
              >
                安装技能
              </button>
            </div>
          </Section>

          <Section
            id="set-sec-voice"
            title="语音设置"
            badge="TTS / ASR"
            desc="朗读走 /v1/tools/tts，语音输入走 /v1/tools/asr。"
          >
            <Row label="音色" stacked>
              <Seg
                value={settings.voiceId === 'tide' ? 'male' : 'female'}
                options={[
                  ['female', '海星 · 女声'],
                  ['male', '暗潮 · 男声'],
                ]}
                onChange={(v) => set('voiceId', v === 'male' ? 'tide' : 'stella')}
              />
            </Row>
            <Row label="自动朗读">
              <Toggle checked={settings.autoRead} onChange={(v) => set('autoRead', v)} label="自动朗读" />
            </Row>
          </Section>

          <Section
            id="set-sec-data"
            title="数据管理"
            badge="本机"
            desc="会话、记忆、笔记、技能保存在本机浏览器；导出文件永不含 API Key。"
          >
            <Row label="导出 / 导入">
              <div className="field-row">
                <button type="button" className="secondary-btn" onClick={() => void doExport()}>
                  <DownloadIcon size={15} /> 导出
                </button>
                <button type="button" className="secondary-btn" onClick={() => void doImport()}>
                  <UploadIcon size={15} /> 导入
                </button>
              </div>
            </Row>
            <Row label="清空本机数据" hint="不可恢复，仅站长可执行">
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    toast('再点一次确认清空', 'info');
                    return;
                  }
                  setConfirmClear(false);
                  void clearAllData();
                }}
              >
                <TrashIcon size={15} /> {confirmClear ? '确认清空' : '清空'}
              </button>
            </Row>
          </Section>

          <p className="settings-foot">
            <ShieldIcon size={13} /> 站长专属配置已受登录态与同源校验保护，访客仅可读取脱敏公开信息。
          </p>
        </div>
      </div>
    </div>
  );
}

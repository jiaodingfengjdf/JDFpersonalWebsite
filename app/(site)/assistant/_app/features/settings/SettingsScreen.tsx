import { useState } from 'react';
import type { Settings } from '../../api/types';
import { AGENT_TEAM, REPLY_STYLES, type ReplyStyleId } from '../../api/types';
import { downloadJson, pickFile } from '../../lib/download';
import {
  addSkill,
  clearAllData,
  deleteSkill,
  exportAll,
  importAll,
  setView,
  toast,
  toggleSkill,
  updateSettings,
  useApp,
} from '../../state/store';
import {
  ArrowLeftIcon,
  DownloadIcon,
  ShieldIcon,
  TrashIcon,
  UploadIcon,
} from '../../ui/Icons';
import SettingsRail from './SettingsRail';

/* ---------------- 基础控件 ---------------- */

function Section(props: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="set-sec">
      <h2 className="set-sec-title">{props.title}</h2>
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

export default function SettingsScreen() {
  const { settings, skills } = useApp();
  const [skillName, setSkillName] = useState('');
  const [skillWhen, setSkillWhen] = useState('');
  const [skillSteps, setSkillSteps] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    updateSettings({ [key]: value } as Partial<Settings>);



  const doExport = async () => {
    const data = await exportAll();
    downloadJson(`pocket-assistant-${new Date().toISOString().slice(0, 10)}.json`, data);
    toast('已导出', 'success');
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

  return (
    <div className="settings-screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => setView('chat')} aria-label="返回">
          <ArrowLeftIcon size={21} />
        </button>
        <div className="topbar-mid">
          <span className="title-text">设置</span>
          <span className="title-sub">本机存储 · 直连 DeepSeek API</span>
        </div>
        <span className="icon-btn ghost" />
      </header>

      <div className="settings-shell">
        <SettingsRail />
        <div className="settings-pane" data-settings-root>

        <Section title="连接" desc="API Key 只保存在这台设备，请求直连 api.deepseek.com">
          <Row label="API Key" stacked>
            <input
              className="text-input"
              type="password"
              value={settings.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
            />
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
          <Row label="生图 API Key" stacked hint="与 DeepSeek Key 分开，只存本机">
            <input
              className="text-input"
              type="password"
              value={settings.imageApiKey}
              onChange={(e) => set('imageApiKey', e.target.value)}
              placeholder="sk-..."
            />
          </Row>
          <Row label="生图模型" stacked>
            <select
              className="text-input"
              value={settings.imageModel}
              onChange={(e) => set('imageModel', e.target.value)}
            >
              {['gpt-image-2.6', 'gpt-image-2.6-flare', 'gpt-image-2.6-sunburst', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-vip', 'gpt-image-2'].map((m) => (
                <option key={m} value={m}>{m}</option>
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
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              <select
                className="text-input"
                value={settings.imageAspect}
                onChange={(e) => set('imageAspect', e.target.value)}
              >
                {['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '1024x1024', '1024x1536', '1536x1024'].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </Row>
        </Section>

        <Section title="对话行为" desc="决定模型每一轮怎么思考、要不要联网。">
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
            <Toggle checked={settings.safety === 'high'} onChange={(v) => set('safety', v ? 'high' : 'low')} label="内容安全" />
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

        <Section title="交流风格" desc="影响每轮回答的语气与详略，立即生效。">
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

        <Section title="智能体团队" desc="勾选的成员写进系统提示词，第一个为主责人。">
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

        <Section title="技能库" desc="启用的技能按「何时用」自动匹配；内置可停用，自建可删除。">
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
            <input className="text-input" placeholder="技能名，例如 投研速读" value={skillName} onChange={(e) => setSkillName(e.target.value)} />
            <input className="text-input" placeholder="何时用：用户贴出长文要我速读时" value={skillWhen} onChange={(e) => setSkillWhen(e.target.value)} />
            <textarea className="text-input resize-none" rows={3} placeholder="具体步骤：1) … 2) …" value={skillSteps} onChange={(e) => setSkillSteps(e.target.value)} />
            <button
              type="button"
              className="secondary-btn"
              disabled={!skillName.trim() || !skillWhen.trim() || !skillSteps.trim()}
              onClick={() => {
                addSkill({ name: skillName, when: skillWhen, steps: skillSteps });
                setSkillName('');
                setSkillWhen('');
                setSkillSteps('');
                toast('技能已安装', 'success');
              }}
            >
              安装技能
            </button>
          </div>
        </Section>

        <Section title="语音" desc="朗读走 /v1/tools/tts，语音输入走 /v1/tools/asr。">
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

        <Section title="数据" desc="会话、记忆、任务、技能都存在本机；导出不含 API Key。">
          <Row label="导出 / 导入">
            <div className="field-row">
              <button type="button" className="secondary-btn" onClick={doExport}>
                <DownloadIcon size={15} /> 导出
              </button>
              <button type="button" className="secondary-btn" onClick={() => void doImport()}>
                <UploadIcon size={15} /> 导入
              </button>
            </div>
          </Row>
          <Row label="清空本机数据" hint="不可恢复">
            <button
              type="button"
              className="danger-btn"
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  toast('再点一次确认清空', 'info');
                  return;
                }
                void clearAllData();
              }}
            >
              <TrashIcon size={15} /> {confirmClear ? '确认清空' : '清空'}
            </button>
          </Row>
        </Section>

        <p className="settings-foot">
          <ShieldIcon size={13} /> 会话内容与 API Key 只存在本机，请求经 HTTPS 直连服务方。
        </p>
        </div>
      </div>
    </div>
  );
}

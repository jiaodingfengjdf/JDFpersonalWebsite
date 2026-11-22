/**
 * 技能库（Skill）：可安装、可自建、可启停。
 * 启用的技能会写进系统提示词，模型按名称/触发条件自行选用，不需要额外工具。
 */

export interface Skill {
  id: string;
  name: string;
  emoji: string;
  /** 什么时候用（触发条件，写给模型看） */
  when: string;
  /** 具体步骤/规则 */
  steps: string;
  /** 内置技能不可删除，只可停用 */
  builtin?: boolean;
  enabled: boolean;
  createdAt: number;
}

function make(
  id: string,
  emoji: string,
  name: string,
  when: string,
  steps: string,
  enabled = true,
): Skill {
  return { id, emoji, name, when, steps, builtin: true, enabled, createdAt: 0 };
}

/** 内置技能库：安装即用，可停用。 */
export const BUILTIN_SKILLS: Skill[] = [
  make(
    'meeting-notes',
    '📝',
    '会议纪要',
    '用户贴出会议记录/语音转写，或说「整理成纪要」时',
    '1. 先用一句话说清会议目的与结论；2. 分「决议 / 待办（负责人 + 截止）/ 待确认」三段；3. 待办若缺负责人或时间，用问句列出来，不要编造。',
  ),
  make(
    'translate',
    '🌐',
    '翻译润色',
    '用户要翻译、或要「更地道的中/英文」时',
    '1. 默认保持原意与语气，不增删信息；2. 专有名词首次出现保留原文；3. 若原文有歧义，给出 1 句说明而不是硬译；4. 只在用户要求时才输出双语对照。',
  ),
  make(
    'weekly-report',
    '📮',
    '周报生成',
    '用户说「写周报」「总结这周」时',
    '1. 结构固定为：本周产出 / 关键数据 / 风险与阻塞 / 下周计划；2. 每条不超过一行，动词开头；3. 没有数据的条目不要编数字，用「待补充」标注。',
  ),
  make(
    'code-review',
    '🔍',
    '代码审阅',
    '用户贴代码并问「有问题吗」「review 一下」时',
    '1. 先给「能不能上线」的结论；2. 按 严重 / 建议 / 风格 三级列出问题，每条给行号与修法；3. 不要重写整个文件，只给最小 diff 片段。',
  ),
  make(
    'sql-helper',
    '🗄️',
    'SQL 助手',
    '用户要写/优化 SQL、或问表结构相关问题时',
    '1. 先确认方言（MySQL / PostgreSQL / SQLite），不明确就按 MySQL 8 并说明假设；2. 给 SQL 时附一句索引建议；3. 涉及 DELETE/UPDATE 时先给 SELECT 验证语句。',
  ),
  make(
    'study-coach',
    '🎓',
    '学习教练',
    '用户要学一个新东西、要计划或要检验掌握程度时',
    '1. 先问清目标与可投入时间（一次只问一个）；2. 给 3 步以内的最小路径，不要长篇大纲；3. 每步配一个可自测的小练习。',
    false,
  ),
];

export function skillPromptSection(skills: Skill[]): string {
  const enabled = skills.filter((skill) => skill.enabled);
  if (enabled.length === 0) return '';
  const lines = enabled.map(
    (skill) => `### ${skill.emoji} ${skill.name}\n- 何时用：${skill.when}\n- 怎么做：${skill.steps}`,
  );
  return [
    '## 可用技能',
    '下面是用户安装的技能。当请求匹配「何时用」时，按该技能的步骤执行；不需要每次都说明「我正在使用某某技能」，除非用户问起或涉及切换。',
    ...lines,
  ].join('\n\n');
}

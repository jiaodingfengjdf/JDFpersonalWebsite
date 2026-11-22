/**
 * 演示模式：不联网、不消耗 Token，按真实 SSE 事件的形状回放一段回答。
 * 用途：没填 API Key 也能体验完整 UI（思考、搜索卡片、引用角标、Markdown、Mermaid），
 * 以及自动化冒烟测试。真实请求走 client.ts。
 */
import type { ApiMessage, AssistantBlock, Citation } from './types';
import type { ChatCallbacks, ChatResult } from './client';

export interface MockArgs {
  messages: ApiMessage[];
  callbacks?: ChatCallbacks;
  signal?: AbortSignal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

interface MockTextBlock {
  text: string;
  citations: Array<{ pos: number; citation: Citation }>;
}

function buildAnswer(userText: string): { blocks: AssistantBlock[]; textBlocks: MockTextBlock[]; title: string } {
  const wantsDiagram = /流程|架构|mermaid|图/.test(userText);
  const wantsCode = /代码|code|python|js|ts\b/i.test(userText);

  const searchResults = [
    {
      type: 'web_search_result' as const,
      title: 'DeepSeek 开放平台 · 构建 Chatbot 指南',
      url: 'https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot',
      encrypted_content: 'mock-encrypted-content',
      page_age: '2026-11-18T08:00:00+00:00',
      snippet:
        'DeepSeek API 提供与网页端一致的对话能力：联网搜索、深度思考搜索、文件输入、阅读链接，以及基础的模型内容安全风控。',
      site_name: 'DeepSeek Docs',
      site_icon: 'https://cdn.deepseek.com/site-icons/deepseek.com',
    },
    {
      type: 'web_search_result' as const,
      title: 'Messages API 参考（Anthropic 兼容）',
      url: 'https://api-docs.deepseek.com/zh-cn/api/create-message',
      encrypted_content: 'mock-encrypted-content',
      page_age: '2026-11-12T03:20:00+00:00',
      snippet:
        '流式响应以 message_start 开始，各内容块依次发送 content_block_start、content_block_delta 与 content_block_stop。',
      site_name: 'DeepSeek Docs',
      site_icon: 'https://cdn.deepseek.com/site-icons/deepseek.com',
    },
    {
      type: 'web_search_result' as const,
      title: 'chat-demo：官方演示客户端源码',
      url: 'https://github.com/deepseek-ai/chat-demo',
      encrypted_content: 'mock-encrypted-content',
      page_age: '2026-10-30T12:00:00+00:00',
      snippet: '展示如何用全家桶 API 构建 Chatbot：联网搜索、文件上传、语音朗读与语音输入。',
      site_name: 'GitHub',
      site_icon: null,
    },
  ];

  const bodyLines: string[] = [];
  bodyLines.push(
    `这是**演示模式**下的回答（没有调用真实模型，所以不消耗 Token）。你问的是：「${userText.slice(0, 60)}」`,
    '',
    '这种 App 的核心是把服务端下发的**内容块**按顺序渲染出来，再把它们原样回传：',
    '',
    '1. `thinking` → 可折叠的思考过程，流式时展开、结束后自动收起；',
    '2. `server_tool_use` + `web_search_tool_result` → 一次搜索的卡片（标题、站点、摘要）；',
    '3. 带 `citations` 的 `text` → 正文里的引用角标，点开就是来源网页；',
    '4. `stop_reason: "refusal"` → 用我方的拒答文案替换已展示的回答。',
    '',
  );

  if (wantsDiagram) {
    bodyLines.push(
      '```mermaid',
      'flowchart LR',
      '  U[用户输入] --> A{思考模式?}',
      '  A -- 开 --> S[深度思考搜索]',
      '  A -- 关 --> W[联网搜索]',
      '  S --> R[引用作答]',
      '  W --> R',
      '```',
      '',
    );
  }
  if (wantsCode) {
    bodyLines.push(
      '```ts',
      "const res = await fetch(`${base}/anthropic/v1/messages`, {",
      "  method: 'POST',",
      "  headers: { 'x-api-key': key, 'content-type': 'application/json' },",
      '  body: JSON.stringify({ model: \'deepseek-flash\', stream: true, messages }),',
      '});',
      '```',
      '',
    );
  }

  bodyLines.push(
    '| 能力 | 请求参数 | 说明 |',
    '| --- | --- | --- |',
    '| 联网搜索 | `tools: [deepseek_web_search]` | 关闭思考时由模型自主搜索 |',
    '| 深度思考搜索 | `thinking.enabled` + 同一工具 | 多步搜索、打开网页、页内查找 |',
    '| 阅读链接 | `tools: [deepseek_read_url]` | 抓取用户消息里的链接 |',
    '| 内容安全 | `safety_check.level = high` | 命中风险时以 `refusal` 结束 |',
    '',
  );

  const finalA = '结论先给：把**内容块**当唯一数据源，UI 只负责渲染，下一轮原样回传，就能得到和官方网页端一致的体验。';
  const finalB = '填好 API Key 后重新提问，就会切换到真实模型；设置里可以随时关掉演示模式。';

  const sentences = [finalA, finalB];
  const textBlocks: MockTextBlock[] = [
    { text: bodyLines.join('\n'), citations: [] },
    {
      text: sentences.join(''),
      citations: [
        {
          pos: finalA.length,
          citation: {
            type: 'web_search_result_location',
            url: searchResults[0].url,
            title: searchResults[0].title,
            encrypted_index: '',
            cited_text: finalA,
          },
        },
      ],
    },
  ];

  const blocks: AssistantBlock[] = [];
  blocks.push({
    type: 'thinking',
    thinking:
      '用户在问怎么用 DeepSeek 全家桶搭一个私人助理 App。\n先确认三件事：协议选 Messages（内容块最完整）、是否要联网、要不要保留思考。\n演示模式不联网，但为了让 UI 全部跑到，我模拟一次搜索和一次阅读链接。',
    signature: 'mock-signature-1',
  });
  blocks.push({
    type: 'server_tool_use',
    id: 'srvtoolu_ds_00_mocksearch',
    name: 'deepseek_web_search',
    input: { action: 'search', queries: ['DeepSeek 全家桶 API 构建 Chatbot', 'Messages API 内容块'] },
    caller: { type: 'direct' },
    kind: 'search',
  });
  blocks.push({
    type: 'web_search_tool_result',
    tool_use_id: 'srvtoolu_ds_00_mocksearch',
    content: searchResults,
    kind: 'search',
  });
  blocks.push({
    type: 'server_tool_use',
    id: 'srvtoolu_rl_01_mockread',
    name: 'deepseek_read_url',
    input: { action: 'read_link', url: searchResults[0].url },
    caller: { type: 'direct' },
    kind: 'read_link',
  });
  blocks.push({
    type: 'web_fetch_tool_result',
    tool_use_id: 'srvtoolu_rl_01_mockread',
    content: {
      type: 'web_fetch_result',
      url: searchResults[0].url,
      content: {
        type: 'document',
        source: { type: 'text', media_type: 'text/plain', data: '' },
        title: searchResults[0].title,
      },
      published_at: '2026-11-18',
    },
    kind: 'read_link',
    signature: 'mock-read-signature',
  });
  for (const tb of textBlocks) blocks.push({ type: 'text', text: tb.text, citations: [] });

  return { blocks, textBlocks, title: 'DeepSeek 私人助理怎么搭' };
}

interface MockAnalysis {
  hasToolResult: boolean;
  text: string;
  lastToolResult?: string;
}

/** 看最后一条用户消息是「正常提问」还是「工具结果回传」。 */
function analyzeMessages(messages: ApiMessage[]): MockAnalysis {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    if (typeof message.content === 'string') {
      return { hasToolResult: false, text: message.content };
    }
    const blocks = message.content as Array<{ type?: string; text?: string; content?: string }>;
    const toolResult = blocks.find((b) => b.type === 'tool_result');
    if (toolResult) {
      return {
        hasToolResult: true,
        text: '',
        lastToolResult: String(toolResult.content ?? ''),
      };
    }
    const textBlock = blocks.find((b) => b.type === 'text');
    if (textBlock?.text) return { hasToolResult: false, text: textBlock.text };
  }
  return { hasToolResult: false, text: '你好' };
}

/** 演示模式也能跑通「工具循环」：说「记住…」「提醒我…」会真的调用客户端工具。 */
function pickDemoTool(
  text: string,
): { name: string; input: Record<string, unknown>; thinking: string } | null {
  if (/每周|每天|工作日/.test(text)) {
    const weekly = /每周|周[一二三四五六日天]/.test(text);
    return {
      name: 'add_task',
      input: {
        title: text.trim().slice(0, 60),
        repeat: weekly ? 'weekly' : /工作日/.test(text) ? 'weekdays' : 'daily',
        time: '09:00',
        weekday: 1,
      },
      thinking:
        '这是周期性的事，不该自己算日期：用 add_task 的 repeat/time 建任务，之后每次完成后会自动排下一次。',
    };
  }
  if (/记住|记一下|记下|别忘了|我的偏好/.test(text)) {
    const fact = text.replace(/^.*?记住/, '').replace(/^[：:，,\s]+/, '').trim() || text.trim();
    return {
      name: 'remember',
      input: { text: fact.slice(0, 120), tags: ['演示'] },
      thinking:
        '用户希望我记住一件事。这属于长期偏好/事实，应该调用 remember 写进长期记忆，而不是只在这次回答里复述。',
    };
  }
  if (/提醒我|待办|任务|截止|安排/.test(text)) {
    return {
      name: 'add_task',
      input: { title: text.trim().slice(0, 60), notes: '演示模式自动创建' },
      thinking: '这是一个要做的事，用 add_task 落成任务，之后可以在 Agent 面板里看到。',
    };
  }
  return null;
}

/** 回放一次客户端工具调用（thinking + tool_use，stop_reason = tool_use）。 */
async function runMockToolCall(
  demo: { name: string; input: Record<string, unknown>; thinking: string },
  callbacks: ChatCallbacks | undefined,
  signal: AbortSignal | undefined,
): Promise<ChatResult> {
  const thinkingBlock: AssistantBlock = {
    type: 'thinking',
    thinking: demo.thinking,
    signature: 'mock-tool-signature',
  };
  const toolBlock: AssistantBlock = {
    type: 'tool_use',
    id: `toolu_demo_${Math.random().toString(36).slice(2, 8)}`,
    name: demo.name,
    input: demo.input,
  };
  const blocks = [thinkingBlock, toolBlock];

  callbacks?.onStart?.({ id: 'msg_mock_tool', model: 'deepseek-flash', usage: { input_tokens: 180 } });
  await sleep(180, signal);

  const thinkShell = { type: 'thinking', thinking: '', signature: '' } as AssistantBlock;
  callbacks?.onBlockStart?.(0, thinkShell);
  for (const piece of demo.thinking.match(/[\s\S]{1,6}/g) ?? []) {
    callbacks?.onDelta?.(0, { type: 'thinking_delta', thinking: piece });
    await sleep(16, signal);
  }
  callbacks?.onDelta?.(0, { type: 'signature_delta', signature: 'mock-tool-signature' });
  callbacks?.onBlockStop?.(0);

  await sleep(140, signal);
  callbacks?.onBlockStart?.(1, { ...toolBlock } as AssistantBlock);
  callbacks?.onBlockStop?.(1);
  callbacks?.onFinal?.({ stop_reason: 'tool_use' }, { input_tokens: 180, output_tokens: 40 });

  return {
    id: 'msg_mock_tool',
    model: 'deepseek-flash',
    blocks,
    stopReason: 'tool_use',
    usage: { input_tokens: 180, output_tokens: 40 },
    usedTools: false,
  };
}

/** 工具执行完之后的那一步回答。 */
async function runMockToolFollowUp(
  toolResult: string,
  callbacks: ChatCallbacks | undefined,
  signal: AbortSignal | undefined,
): Promise<ChatResult> {
  const rawLine = toolResult.split('\n').find((line) => line.trim()) ?? '已经处理好了。';
  // 工具的原始输出里带 id，给人看的时候要去掉
  const firstLine = rawLine.replace(/（id[:：][^）]*）/g, '').replace(/\(id[:：][^)]*\)/g, '').trim();
  const text = `已经处理好了：\n\n> ${firstLine}\n\n这件事我记在「个人 Agent」里了，随时可以改或删。还需要我做点别的吗？`;

  callbacks?.onStart?.({ id: 'msg_mock_follow', model: 'deepseek-flash' });
  await sleep(200, signal);
  callbacks?.onBlockStart?.(0, { type: 'text', text: '' });
  for (const chunk of text.match(/[\s\S]{1,6}/g) ?? []) {
    callbacks?.onDelta?.(0, { type: 'text_delta', text: chunk });
    await sleep(14, signal);
  }
  callbacks?.onBlockStop?.(0);
  callbacks?.onFinal?.({ stop_reason: 'end_turn' }, { input_tokens: 260, output_tokens: 64 });

  return {
    id: 'msg_mock_follow',
    model: 'deepseek-flash',
    blocks: [{ type: 'text', text }],
    stopReason: 'end_turn',
    usage: { input_tokens: 260, output_tokens: 64 },
    usedTools: false,
  };
}

/** 演示模式：今日简报（纯文本，不走工具循环）。 */
async function runMockBrief(
  callbacks: ChatCallbacks | undefined,
  signal: AbortSignal | undefined,
): Promise<ChatResult> {
  const text = [
    '**今天只做一件**：把「私人助理」部署到 Vercel，并在手机上装到主屏。',
    '',
    '理由：这是唯一会卡住后面所有事的一步，二十分钟能完事。',
    '',
    '**其余按优先级**',
    '1. 给「每周复盘」补一条固定任务（10 分钟）',
    '2. 把提醒接到系统通知，切到后台也能收到（可选）',
    '',
    '> 你偏好先给结论再给理由，所以今天别再纠结方案了 —— 先部署，再改。',
    '',
    '（演示模式：这段简报是固定文案，真实模式会先 list_tasks / search_memory 再生成。）',
  ].join('\n');

  callbacks?.onStart?.({ id: 'msg_mock_brief', model: 'deepseek-flash' });
  await sleep(200, signal);
  callbacks?.onBlockStart?.(0, { type: 'text', text: '' });
  for (const chunk of text.match(/[\s\S]{1,6}/g) ?? []) {
    callbacks?.onDelta?.(0, { type: 'text_delta', text: chunk });
    await sleep(12, signal);
  }
  callbacks?.onBlockStop?.(0);
  callbacks?.onFinal?.({ stop_reason: 'end_turn' }, { input_tokens: 320, output_tokens: 180 });

  return {
    id: 'msg_mock_brief',
    model: 'deepseek-flash',
    blocks: [{ type: 'text', text }],
    stopReason: 'end_turn',
    usage: { input_tokens: 320, output_tokens: 180 },
    usedTools: false,
  };
}

/** 回放一段演示回答（SSE 形状的事件序列）。 */
export async function runMockChat(args: MockArgs): Promise<ChatResult> {
  const { messages, callbacks, signal } = args;
  const analysis = analyzeMessages(messages);

  if (analysis.hasToolResult) {
    return runMockToolFollowUp(analysis.lastToolResult ?? '', callbacks, signal);
  }

  if (/简报|今天该做什么|今日计划/.test(analysis.text)) {
    return runMockBrief(callbacks, signal);
  }

  const demo = pickDemoTool(analysis.text);
  if (demo) {
    return runMockToolCall(demo, callbacks, signal);
  }

  const userText = analysis.text;
  const { blocks, textBlocks, title } = buildAnswer(userText);

  // 与真实流一致：message_start 的 content 为空
  callbacks?.onStart?.({ id: 'msg_mock', model: 'deepseek-flash', usage: { input_tokens: 0 } });
  await sleep(160, signal);

  const emitBlock = async (index: number, block: AssistantBlock) => {
    const shell = structuredClone(block) as AssistantBlock;
    if (shell.type === 'text') shell.text = '';
    if (shell.type === 'thinking') shell.thinking = '';
    callbacks?.onBlockStart?.(index, shell);
    return shell;
  };

  let index = 0;
  // 1) 思考
  {
    const block = blocks[index] as Extract<AssistantBlock, { type: 'thinking' }>;
    const shell = (await emitBlock(index, block)) as Extract<AssistantBlock, { type: 'thinking' }>;
    const pieces = block.thinking.match(/[\s\S]{1,6}/g) ?? [];
    for (const piece of pieces) {
      // 只发增量：调用方（store）会把它合并进自己持有的块
      callbacks?.onDelta?.(index, { type: 'thinking_delta', thinking: piece });
      await sleep(18, signal);
    }
    callbacks?.onDelta?.(index, { type: 'signature_delta', signature: block.signature ?? '' });
    callbacks?.onBlockStop?.(index);
    shell.signature = block.signature;
    index += 1;
  }

  await sleep(120, signal);

  // 2) 搜索调用 + 结果（一次性下发）
  {
    const call = blocks[index];
    await emitBlock(index, call);
    callbacks?.onBlockStop?.(index);
    index += 1;
    const result = blocks[index];
    await emitBlock(index, result);
    callbacks?.onBlockStop?.(index);
    index += 1;
  }

  await sleep(200, signal);

  // 3) 阅读链接
  {
    const call = blocks[index];
    await emitBlock(index, call);
    callbacks?.onBlockStop?.(index);
    index += 1;
    const result = blocks[index];
    await emitBlock(index, result);
    callbacks?.onBlockStop?.(index);
    index += 1;
  }

  // 4) 正文（带引用角标）
  for (const tb of textBlocks) {
    await emitBlock(index, blocks[index]);
    const markers = [...tb.citations].sort((a, b) => a.pos - b.pos);
    let cursor = 0;
    const chunks = tb.text.match(/[\s\S]{1,5}/g) ?? [];
    let consumed = 0;
    for (const chunk of chunks) {
      // 只发增量，避免调用方重复追加（块由调用方持有）
      consumed += chunk.length;
      callbacks?.onDelta?.(index, { type: 'text_delta', text: chunk });
      while (cursor < markers.length && markers[cursor].pos <= consumed) {
        callbacks?.onDelta?.(index, { type: 'citations_delta', citation: markers[cursor].citation });
        cursor += 1;
      }
      await sleep(14, signal);
    }
    callbacks?.onBlockStop?.(index);
    index += 1;
  }

  const usage = {
    input_tokens: 1280,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 4096,
    output_tokens: 642,
    output_tokens_details: { thinking_tokens: 218 },
    server_tool_use: { web_search_requests: 1, web_fetch_requests: 1, tool_search: 1, tool_fetch: 1 },
  };
  const delta = { stop_reason: 'end_turn' as const, title };
  callbacks?.onFinal?.(delta, usage);

  return {
    id: 'msg_mock',
    model: 'deepseek-flash',
    blocks: blocks.map((b) => structuredClone(b)),
    stopReason: 'end_turn',
    usage,
    title,
    usedTools: true,
  };
}

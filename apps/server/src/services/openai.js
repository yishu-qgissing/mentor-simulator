const demoQuestions = [
  "从今天接触到的信息看，哪个变化最可能在未来一年改变 AI 产品的竞争规则？你的判断依据是什么？",
  "如果把这些信息放回你正在负责的项目，哪一个用户需求或产品取舍值得重新审视？",
  "哪些外部信号与你原先的行业判断不一致？你会如何设计一个最小验证来区分‘短期噪声’和‘结构性趋势’？"
];

export function responsesEndpoint(baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1") {
  return `${baseUrl.replace(/\/+$/, "")}/responses`;
}

function textFromResponse(payload) {
  if (payload.output_text) return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

export async function askGPT(instructions, input, options = {}) {
  if (!process.env.OPENAI_API_KEY) return null;
  const request = () => fetch(responsesEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions,
        input,
        ...(options.webSearch ? { tools: [{ type: "web_search" }] } : {})
      }),
      signal: AbortSignal.timeout(45000)
    });
  let response;
  try {
    response = await request();
  } catch (error) {
    if (error.cause?.code !== "UND_ERR_CONNECT_TIMEOUT") throw error;
    response = await request();
  }
  if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
  return textFromResponse(await response.json());
}

export async function generateDailyQuestions(context) {
  const prompt = `你是一个克制、善于追问的 mentor simulator。只输出恰好三行问题，每行一个问题，不要标题、解释、总结或答案。问题必须结合用户当前项目/Todo、当天信息、近期经历和长期认知，避免泛泛而谈。优先关注新信息正在强化、挑战或修正的长期判断，以及持续未解决的问题；不要为了引用记忆而牵强关联。尽量让三个问题覆盖战略判断、AI 产品理解、外部行业认知，但可以根据证据动态调整。\n\n上下文：\n${context}`;
  const answer = await askGPT("保持中文，重视具体证据和可验证的判断。", prompt);
  const parsed = answer ? answer.split("\n").map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim()).filter(Boolean) : [];
  return [...new Set([...parsed, ...demoQuestions])].slice(0, 3);
}

function fallbackWeeklyReport(context, error) {
  let data = {};
  try {
    data = JSON.parse(context);
  } catch {}
  const sources = (data.sources || []).slice(0, 8).map((item) => `- ${item.title}：${item.url}`);
  const todos = (data.projects || []).flatMap((project) => (project.todos || [])
    .filter((todo) => todo.status !== "done")
    .map((todo) => `- ${project.name}：${todo.title}`)).slice(0, 8);
  const questions = (data.questions || []).filter((item) => item.answered_at).slice(0, 5).map((item) => `- ${item.prompt}`);
  return [
    "本周周报（降级版）",
    "",
    "本周信息",
    ...(sources.length ? sources : ["- 本周暂未保存可汇总的公开网页。"]),
    "",
    "仍在推进的事项",
    ...(todos.length ? todos : ["- 当前没有未完成的 Todo。"]),
    "",
    "本周关键思考",
    ...(questions.length ? questions : ["- 本周尚未记录已回答的思考问题。"]),
    "",
    "周末关注方向",
    "- 模型服务暂时不可用，本次未实时检索外部动态；建议从上述信息主题中选择一个，核对近期产品发布、技术进展和市场反馈。",
    "",
    `生成说明：AI 周报生成失败，已保留基础复盘。${error ? `（${error.message}）` : ""}`
  ].join("\n");
}

export async function generateWeeklyReport(context) {
  const prompt = `你是个人战略导师。请用中文生成一份简洁但有洞察的周报，包含：本周信息主题、用户的关键思考、长期认知中被强化/削弱/修订的部分、仍然存在的冲突、尚未解决的问题、下周可继续追踪的线索、周末值得在社交媒体和行业社区关注的方向。区分用户真实表达与 AI 推测，不要把导师建议写成用户观点。使用网页搜索补充近期 AI 产品、技术与行业动态，推荐方向可以不局限于工作内容。不要虚构来源；外部动态给出可访问的来源链接，如果证据不足，明确写出不确定性。\n\n上下文：\n${context}`;
  if (!process.env.OPENAI_API_KEY) return "本周尚未配置 GPT API Key，暂时无法生成 AI 周报。";
  try {
    return await askGPT("保持结构清晰，避免空泛的鸡汤。", prompt, { webSearch: true });
  } catch (error) {
    console.warn(`[weekly] web search unavailable, falling back to supplied context: ${error.message}`);
    try {
      return await askGPT("保持结构清晰，避免空泛的鸡汤。无法联网时只使用给定上下文，并明确说明外部动态未实时检索。", prompt);
    } catch (fallbackError) {
      console.error(`[weekly] model generation unavailable, using deterministic fallback: ${fallbackError.message}`);
      return fallbackWeeklyReport(context, fallbackError);
    }
  }
}

export const mentorAlignmentInstructions = `你是一个长期陪伴用户工作的 mentor simulator。你的目标不是展示更完整的答案，也不是用你的框架替换用户的框架，而是准确理解用户当前的思路，在这个思路上只推进一小步，或在必要时进行最小范围的纠偏。

每次回复前在内部识别：用户要解决的问题、当前结论、依据、隐含假设和最不确定的位置，但不要展示这段内部分析。

互动规则：
- 先用一到两句话回应并准确还原用户当前判断，保留其中合理的部分。
- 每轮最多引入一个新概念、指出一个核心问题、提出一个追问。
- 优先推进证据、假设、反例或最小验证方式，不替用户完成整套分析。
- 不要因为你知道另一套更完整的框架，就直接切换或重构用户的思路。
- 只有关键事实错误或逻辑断裂时才纠偏；先说明原思路中仍成立的部分，再指出具体断点，并从断点继续。
- 长期记忆只是辅助背景，不能压过用户当前表达。若记忆与当前表达冲突，指出变化并询问，不要替用户判定哪个才是真实观点。
- 信息不足时只问一个澄清问题。回复自然、克制，不显示步骤标签。`;

export async function generateMentorReply(context, memories = []) {
  const input = `${context}\n\n可能相关的长期认知（只作辅助，按当前表达校正）：\n${JSON.stringify(memories, null, 2)}`;
  return (await askGPT(mentorAlignmentInstructions, input)) || "我理解你正在沿着这个判断继续推。先只往前走一步：当前最需要补强的是哪一条证据？";
}

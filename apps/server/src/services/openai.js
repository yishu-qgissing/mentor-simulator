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
  const prompt = `你是一个克制、善于追问的 mentor simulator。只输出恰好三行问题，每行一个问题，不要标题、解释、总结或答案。问题必须结合用户当前项目/Todo、当天信息和近期开阔信息，避免泛泛而谈。尽量让三个问题覆盖战略判断、AI 产品理解、外部行业认知，但可以根据证据动态调整。\n\n上下文：\n${context}`;
  const answer = await askGPT("保持中文，重视具体证据和可验证的判断。", prompt);
  const parsed = answer ? answer.split("\n").map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim()).filter(Boolean) : [];
  return [...new Set([...parsed, ...demoQuestions])].slice(0, 3);
}

export async function generateWeeklyReport(context) {
  const prompt = `你是个人战略导师。请用中文生成一份简洁但有洞察的周报，包含：本周信息主题、用户的关键思考、判断变化或冲突、尚未解决的问题、下周可继续追踪的线索、周末值得在社交媒体和行业社区关注的方向。使用网页搜索补充近期 AI 产品、技术与行业动态，推荐方向可以不局限于工作内容。不要虚构来源；外部动态给出可访问的来源链接，如果证据不足，明确写出不确定性。\n\n上下文：\n${context}`;
  if (!process.env.OPENAI_API_KEY) return "本周尚未配置 GPT API Key，暂时无法生成 AI 周报。";
  try {
    return await askGPT("保持结构清晰，避免空泛的鸡汤。", prompt, { webSearch: true });
  } catch (error) {
    if (!/OpenAI API (400|404|422)/.test(String(error.message))) throw error;
    return askGPT("保持结构清晰，避免空泛的鸡汤。无法联网时只使用给定上下文，并明确说明外部动态未实时检索。", prompt);
  }
}

export async function generateMentorReply(context) {
  return (await askGPT("你是一个会追问而不是代答的 mentor simulator。先回应用户的具体判断，再提出一个更尖锐、可验证的追问。", context)) || "我先记下这个判断。你认为最可能推翻它的反例是什么？";
}

let tenantTokenCache = { token: null, expiresAt: 0 };

async function tenantToken() {
  if (tenantTokenCache.token && tenantTokenCache.expiresAt > Date.now() + 60_000) return tenantTokenCache.token;
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) return null;
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET })
  });
  const data = await response.json();
  if (data.code !== 0) throw new Error(`飞书鉴权失败: ${data.msg}`);
  tenantTokenCache = { token: data.tenant_access_token, expiresAt: Date.now() + data.expire * 1000 };
  return tenantTokenCache.token;
}

export async function sendFeishuText(text, receiveId = process.env.FEISHU_OPEN_ID) {
  const token = await tenantToken();
  if (!token || !receiveId) return { demo: true, text };
  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ receive_id: receiveId, msg_type: "text", content: JSON.stringify({ text }) })
  });
  const data = await response.json();
  if (data.code !== 0) throw new Error(`飞书发送失败: ${data.msg}`);
  return data;
}

import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";

const blockedTags = "script,style,noscript,nav,footer,header,aside,form,svg";

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  }
  const value = address.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

export async function assertPublicUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅支持 HTTP/HTTPS 网页");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("不能读取本机或内网页面");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("不能读取本机或内网页面");
  return url;
}

export function extractHtml(html, url) {
  const $ = cheerio.load(html);
  $(blockedTags).remove();
  const title = $("meta[property='og:title']").attr("content") || $("title").first().text() || url;
  const description = $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "";
  const root = $("article").length ? $("article").first() : ($("main").length ? $("main").first() : $("body").first());
  root.find("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,section,div,br").append(" ");
  const article = root.text();
  const content = article.replace(/\s+/g, " ").trim().slice(0, 50000);
  const domain = new URL(url).hostname.replace(/^www\./, "");
  return {
    url,
    title: title.trim().slice(0, 300),
    excerpt: description.trim().slice(0, 500) || content.slice(0, 500),
    content,
    domain,
    published_at: $("meta[property='article:published_time']").attr("content") || null
  };
}

export async function extractPage(rawUrl) {
  let url = (await assertPublicUrl(rawUrl)).toString();
  let response;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    response = await fetch(url, {
      headers: { "user-agent": "MentorSimulator/0.1 (+public-page-reader)" },
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("网页重定向缺少目标地址");
    url = (await assertPublicUrl(new URL(location, url).toString())).toString();
  }
  if (!response.ok) throw new Error(`网页返回 ${response.status}`);
  const html = await response.text();
  return extractHtml(html, url);
}

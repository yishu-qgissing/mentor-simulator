import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, Check, Circle, ExternalLink, Link2, Plus, Sparkles, Target, X } from "lucide-react";
import "./styles.css";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:4310"}/api`;

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { "content-type": "application/json", ...(import.meta.env.VITE_API_ACCESS_TOKEN ? { "x-access-token": import.meta.env.VITE_API_ACCESS_TOKEN } : {}) }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function App() {
  const [data, setData] = useState({ sources: [], projects: [], unassignedTodos: [], latestQuestion: null, latestReport: null });
  const [url, setUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [todo, setTodo] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function refresh() {
    setData(await request("/dashboard"));
  }
  useEffect(() => { refresh().catch((error) => setNotice(error.message)); }, []);

  async function addSource(event) {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy(true); setNotice("");
    try { await request("/sources", { method: "POST", body: JSON.stringify({ url }) }); setUrl(""); await refresh(); setNotice("已收进今日信息流"); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function addProject(event) {
    event.preventDefault();
    if (!projectName.trim()) return;
    const result = await request("/projects", { method: "POST", body: JSON.stringify({ name: projectName, context: projectContext }) });
    setSelectedProject(String(result.project.id)); setProjectName(""); setProjectContext(""); await refresh(); setNotice("项目已保存，新 Todo 将默认归到这里");
  }
  async function addTodo(event) {
    event.preventDefault();
    if (!todo.trim()) return;
    await request("/todos", { method: "POST", body: JSON.stringify({ title: todo, projectId: selectedProject ? Number(selectedProject) : null }) });
    setTodo(""); await refresh(); setNotice("Todo 已加入");
  }
  async function toggleTodo(item) {
    await request(`/todos/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...item, status: item.status === "done" ? "todo" : "done" }) });
    await refresh();
  }

  const todoCount = useMemo(() => data.projects.reduce((count, project) => count + project.todos.filter((item) => item.status !== "done").length, 0) + (data.unassignedTodos || []).filter((item) => item.status !== "done").length, [data.projects, data.unassignedTodos]);

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Sparkles size={15} /></div><div><strong>Mentor Simulator</strong><span>你的每日思考工作台</span></div></div>
      <div className="status-dot" title="本地服务已连接"><span />在线</div>
    </header>

    <section className="hero">
      <p className="eyebrow">TODAY · {new Date().toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}</p>
      <h1>把看到的，变成<br /><em>值得想的。</em></h1>
      <p className="hero-copy">随手收进信息，晚上让问题来找你。</p>
    </section>

    <section className="capture panel">
      <div className="section-label"><Link2 size={15} />快速收集</div>
      <form onSubmit={addSource} className="capture-form"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="粘贴文章或产品官网链接" type="url" /><button disabled={busy} aria-label="收集链接"><ArrowUpRight size={18} /></button></form>
      <p className="hint">公开网页会自动提取正文，重复链接不会重复收录</p>
    </section>

    <section className="overview-grid">
      <div className="metric"><span>本周收集</span><strong>{data.sources.length}</strong><small>条信息</small></div>
      <div className="metric"><span>进行中的 Todo</span><strong>{todoCount}</strong><small>个待推进</small></div>
      <div className="metric accent"><span>下一次提问</span><strong>20:00</strong><small>飞书推送</small></div>
    </section>

    <section className="panel project-panel">
      <div className="panel-heading"><div><div className="section-label"><Target size={15} />当前工作</div><h2>项目与 Todo</h2></div><span className="quiet">AI 会读取这里的上下文</span></div>
      <form onSubmit={addProject} className="project-form"><input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="新项目名称" /><input value={projectContext} onChange={(e) => setProjectContext(e.target.value)} placeholder="一句话说明目标或背景" /><button aria-label="添加项目"><Plus size={17} /></button></form>
      <form onSubmit={addTodo} className="todo-form"><select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}><option value="">不关联项目</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input value={todo} onChange={(e) => setTodo(e.target.value)} placeholder="添加一条待推进的事" /><button aria-label="添加 Todo"><Plus size={17} /></button></form>
      <div className="project-list">{data.projects.length === 0 && !(data.unassignedTodos || []).length ? <div className="empty">先写下一个你正在负责的项目</div> : <>{data.projects.map((project) => <div className="project" key={project.id}><div className="project-title"><strong>{project.name}</strong><span>{project.todos.filter((item) => item.status !== "done").length} 待办</span></div>{project.context && <p>{project.context}</p>}{project.todos.map((item) => <button className={`todo ${item.status === "done" ? "done" : ""}`} key={item.id} onClick={() => toggleTodo(item)}><span className="todo-check">{item.status === "done" ? <Check size={12} /> : <Circle size={12} />}</span>{item.title}</button>)}</div>)}{(data.unassignedTodos || []).length > 0 && <div className="project"><div className="project-title"><strong>未归类</strong><span>{data.unassignedTodos.filter((item) => item.status !== "done").length} 待办</span></div>{data.unassignedTodos.map((item) => <button className={`todo ${item.status === "done" ? "done" : ""}`} key={item.id} onClick={() => toggleTodo(item)}><span className="todo-check">{item.status === "done" ? <Check size={12} /> : <Circle size={12} />}</span>{item.title}</button>)}</div>}</>}</div>
    </section>

    <section className="panel feed-panel"><div className="panel-heading"><div><div className="section-label"><ExternalLink size={15} />最近输入</div><h2>信息流</h2></div><span className="quiet">{data.sources.length} 条</span></div><div className="source-list">{data.sources.length === 0 ? <div className="empty">把第一条链接放进来，今晚的问题从这里开始</div> : data.sources.slice(0, 6).map((source) => <a className="source" href={source.url} target="_blank" rel="noreferrer" key={source.id}><div><strong>{source.title}</strong><span>{source.domain} · {new Date(source.created_at).toLocaleDateString("zh-CN")}</span></div><ArrowUpRight size={15} /></a>)}</div></section>
    {notice && <div className="toast"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示"><X size={15} /></button></div>}
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);

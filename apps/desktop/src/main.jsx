import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  Circle,
  FileText,
  Link2,
  LoaderCircle,
  PanelRightClose,
  Plus,
  RefreshCw,
  Sparkles,
  X
} from "lucide-react";
import "./styles.css";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:4310"}/api`;
const emptyDashboard = { sources: [], projects: [], unassignedTodos: [], latestReport: null };

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(import.meta.env.VITE_API_ACCESS_TOKEN ? { "x-access-token": import.meta.env.VITE_API_ACCESS_TOKEN } : {}),
      ...options.headers
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "今天";
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function memoryLabel(memory) {
  if (memory.status === "contested") return "挑战";
  if (memory.supersedes_id) return "修订";
  if (memory.type === "open_question" || memory.type === "hypothesis") return "待验证";
  return "稳定";
}

function TodayView({ data, refresh, notify }) {
  const [url, setUrl] = useState("");
  const [todo, setTodo] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [busy, setBusy] = useState(false);

  const allTodos = useMemo(() => [
    ...data.projects.flatMap((project) => project.todos.map((item) => ({ ...item, projectName: project.name }))),
    ...(data.unassignedTodos || []).map((item) => ({ ...item, projectName: "未归类" }))
  ], [data.projects, data.unassignedTodos]);

  async function addSource(event) {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      const result = await request("/sources", { method: "POST", body: JSON.stringify({ url: url.trim() }) });
      setUrl("");
      await refresh();
      notify(result.duplicate ? "这条链接已经收过了" : "已收进今日信息流");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function addTodo(event) {
    event.preventDefault();
    if (!todo.trim()) return;
    try {
      await request("/todos", {
        method: "POST",
        body: JSON.stringify({ title: todo.trim(), projectId: selectedProject ? Number(selectedProject) : null })
      });
      setTodo("");
      await refresh();
      notify("事项已加入");
    } catch (error) {
      notify(error.message, true);
    }
  }

  async function addProject(event) {
    event.preventDefault();
    if (!projectName.trim()) return;
    try {
      const result = await request("/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName.trim(), context: projectContext.trim() })
      });
      setSelectedProject(String(result.project.id));
      setProjectName("");
      setProjectContext("");
      setShowProjectForm(false);
      await refresh();
      notify("项目已保存");
    } catch (error) {
      notify(error.message, true);
    }
  }

  async function toggleTodo(item) {
    try {
      await request(`/todos/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...item, status: item.status === "done" ? "todo" : "done" })
      });
      await refresh();
    } catch (error) {
      notify(error.message, true);
    }
  }

  return <div className="view today-view">
    <form className="capture" onSubmit={addSource}>
      <Link2 size={16} aria-hidden="true" />
      <input value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="粘贴文章或产品链接" aria-label="公开网页链接" />
      <button type="submit" className="primary-icon" disabled={busy || !url.trim()} aria-label="保存链接" title="保存链接">
        {busy ? <LoaderCircle className="spin" size={16} /> : <ArrowUp size={16} />}
      </button>
    </form>

    <section className="section">
      <div className="section-heading">
        <h2>当前事项</h2>
        <button type="button" className="text-action" onClick={() => setShowProjectForm((value) => !value)}>
          <Plus size={14} />项目
        </button>
      </div>

      {showProjectForm && <form className="project-form" onSubmit={addProject}>
        <div className="inline-field-row">
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="项目名称" aria-label="项目名称" />
          <button type="button" className="icon-button" onClick={() => setShowProjectForm(false)} aria-label="取消"><X size={15} /></button>
        </div>
        <textarea value={projectContext} onChange={(event) => setProjectContext(event.target.value)} placeholder="目标、背景或当前约束" aria-label="项目上下文" rows="3" />
        <button type="submit" className="secondary-button" disabled={!projectName.trim()}>保存项目</button>
      </form>}

      <form className="todo-form" onSubmit={addTodo}>
        <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)} aria-label="所属项目">
          <option value="">未归类</option>
          {data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <input value={todo} onChange={(event) => setTodo(event.target.value)} placeholder="添加一件要推进的事" aria-label="Todo 内容" />
        <button type="submit" className="icon-button" disabled={!todo.trim()} aria-label="添加 Todo" title="添加 Todo"><Plus size={16} /></button>
      </form>

      <div className="task-list">
        {allTodos.length === 0 && <p className="empty">把正在推进的事情写在这里。</p>}
        {allTodos.map((item) => <button type="button" className={`task ${item.status === "done" ? "is-done" : ""}`} key={item.id} onClick={() => toggleTodo(item)}>
          {item.status === "done" ? <Check size={14} /> : <Circle size={14} />}
          <span><strong>{item.title}</strong><small>{item.projectName}</small></span>
        </button>)}
      </div>
    </section>

    <section className="section sources-section">
      <div className="section-heading"><h2>最近收集</h2><span>{data.sources.length} 条</span></div>
      <div className="source-list">
        {data.sources.length === 0 && <p className="empty">第一条信息会从这里开始。</p>}
        {data.sources.slice(0, 8).map((source) => <a className="source" href={source.url} target="_blank" rel="noreferrer" key={source.id}>
          <span><strong>{source.title}</strong><small>{source.domain} · {formatDate(source.created_at)}</small></span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>)}
      </div>
    </section>
  </div>;
}

function MemoryView({ memories, loading, reload }) {
  return <div className="view">
    <section className="section first-section">
      <div className="section-heading">
        <div><h2>长期认知</h2><p>AI 从你明确表达或认可的判断中维护</p></div>
        <button type="button" className="icon-button" onClick={reload} aria-label="刷新长期认知" title="刷新"><RefreshCw size={15} /></button>
      </div>
      {loading && <div className="loading-row"><LoaderCircle className="spin" size={15} />正在读取</div>}
      {!loading && memories.length === 0 && <p className="empty spacious">和飞书导师持续交流后，稳定判断、假设和约束会出现在这里。</p>}
      <div className="memory-list">
        {memories.map((memory) => <article className="memory" key={memory.id}>
          <div className="memory-meta"><span className={`memory-state state-${memoryLabel(memory)}`}>{memoryLabel(memory)}</span><small>{memory.topic}</small></div>
          <p>{memory.content}</p>
          <footer><span>{memory.type.replace("_", " ")}</span><span>{formatDate(memory.last_seen_at)}</span></footer>
        </article>)}
      </div>
    </section>
  </div>;
}

function ReportView({ report }) {
  return <div className="view">
    <section className="section first-section">
      <div className="section-heading"><div><h2>最近周报</h2><p>新周报仍会在周六 14:00 发到飞书</p></div><FileText size={16} /></div>
      {report ? <article className="report"><div className="report-date">生成于 {new Date(report.created_at).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div><div className="report-content">{report.content}</div></article> : <p className="empty spacious">还没有可回看的周报。</p>}
    </section>
  </div>;
}

function App() {
  const [data, setData] = useState(emptyDashboard);
  const [memories, setMemories] = useState([]);
  const [activeView, setActiveView] = useState("today");
  const [connected, setConnected] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [drawerExpanded, setDrawerExpanded] = useState(true);

  async function refresh() {
    try {
      setData(await request("/dashboard"));
      setConnected(true);
    } catch (error) {
      setConnected(false);
      throw error;
    }
  }

  async function loadMemories() {
    setMemoryLoading(true);
    try {
      setMemories(await request("/memories"));
      setConnected(true);
    } catch (error) {
      setConnected(false);
      setNotice({ message: error.message, error: true });
    } finally {
      setMemoryLoading(false);
    }
  }

  function notify(message, error = false) {
    setNotice({ message, error });
    window.setTimeout(() => setNotice(null), 2600);
  }

  useEffect(() => {
    refresh().catch((error) => notify(error.message, true));
    const unsubscribe = window.mentorWindow?.onStateChange?.(({ expanded }) => setDrawerExpanded(expanded));
    const handleKeydown = (event) => {
      if (event.key === "Escape") window.mentorWindow?.collapse?.();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      unsubscribe?.();
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  useEffect(() => {
    if (activeView === "memory" && memories.length === 0) loadMemories();
  }, [activeView]);

  const openTodos = data.projects.reduce((count, project) => count + project.todos.filter((item) => item.status !== "done").length, 0)
    + (data.unassignedTodos || []).filter((item) => item.status !== "done").length;

  return <main
    className={`shell ${drawerExpanded ? "is-expanded" : "is-collapsed"}`}
    onPointerEnter={() => { window.mentorWindow?.cancelCollapse?.(); window.mentorWindow?.expand?.(); }}
    onPointerLeave={() => window.mentorWindow?.scheduleCollapse?.()}
  >
    <div className="edge-sensor" aria-hidden="true" />
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Sparkles size={14} /></span><strong>Mentor</strong><span className={`connection ${connected ? "is-online" : ""}`}><i />{connected ? "已连接" : "离线"}</span></div>
      <button type="button" className="icon-button collapse-button" onClick={() => window.mentorWindow?.collapse?.()} aria-label="收起到屏幕侧边" title="收起"><PanelRightClose size={17} /></button>
    </header>

    <nav className="tabs" aria-label="Mentor 内容视图">
      {[{ id: "today", label: "今天" }, { id: "memory", label: "认知" }, { id: "report", label: "周报" }].map((tab) => <button type="button" key={tab.id} className={activeView === tab.id ? "is-active" : ""} onClick={() => setActiveView(tab.id)}>{tab.label}</button>)}
    </nav>

    <div className="content">
      {activeView === "today" && <TodayView data={data} refresh={refresh} notify={notify} />}
      {activeView === "memory" && <MemoryView memories={memories} loading={memoryLoading} reload={loadMemories} />}
      {activeView === "report" && <ReportView report={data.latestReport} />}
    </div>

    <footer className="statusbar"><span>{data.sources.length} 条信息</span><i /> <span>{openTodos} 个待办</span><span className="push-note">问题与对话仅在飞书</span></footer>
    {notice && <div className={`toast ${notice.error ? "is-error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.message}<button type="button" onClick={() => setNotice(null)} aria-label="关闭提示"><X size={14} /></button></div>}
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);

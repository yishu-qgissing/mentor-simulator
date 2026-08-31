const { app, BrowserWindow, Tray, Menu, nativeImage, shell, screen, ipcMain } = require("electron");
const path = require("node:path");

const DRAWER_WIDTH = 372;
const EDGE_WIDTH = 4;
const MAX_DRAWER_HEIGHT = 820;
const VERTICAL_MARGIN = 12;
const SLIDE_DURATION = 180;
const COLLAPSE_DELAY = 650;

let mainWindow;
let tray;
let expanded = false;
let activeDisplayId;
let collapseTimer;
let animationTimer;
let isQuitting = false;

function displayForWindow() {
  const displays = screen.getAllDisplays();
  const remembered = displays.find((display) => display.id === activeDisplayId);
  if (remembered) return remembered;
  if (mainWindow && !mainWindow.isDestroyed()) return screen.getDisplayMatching(mainWindow.getBounds());
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function drawerBounds(display = displayForWindow(), isExpanded = expanded) {
  activeDisplayId = display.id;
  const { x, y, width, height } = display.workArea;
  const drawerHeight = Math.min(MAX_DRAWER_HEIGHT, Math.max(640, height - VERTICAL_MARGIN * 2));
  return {
    x: isExpanded ? x + width - DRAWER_WIDTH : x + width - EDGE_WIDTH,
    y: y + Math.round((height - drawerHeight) / 2),
    width: DRAWER_WIDTH,
    height: drawerHeight
  };
}

function stopAnimation() {
  if (animationTimer) clearInterval(animationTimer);
  animationTimer = null;
}

function moveWindow(targetBounds, animate = true) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  stopAnimation();
  const current = mainWindow.getBounds();
  mainWindow.setSize(targetBounds.width, targetBounds.height, false);
  mainWindow.setPosition(current.x, targetBounds.y, false);
  if (!animate || current.x === targetBounds.x) {
    mainWindow.setPosition(targetBounds.x, targetBounds.y, false);
    return;
  }

  const startedAt = Date.now();
  animationTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return stopAnimation();
    const progress = Math.min(1, (Date.now() - startedAt) / SLIDE_DURATION);
    const eased = 1 - Math.pow(1 - progress, 3);
    mainWindow.setPosition(Math.round(current.x + (targetBounds.x - current.x) * eased), targetBounds.y, false);
    if (progress >= 1) stopAnimation();
  }, 16);
}

function notifyState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("drawer:state", { expanded });
}

function setExpanded(nextExpanded, options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(collapseTimer);
  expanded = nextExpanded;
  const display = options.followCursor
    ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    : displayForWindow();
  moveWindow(drawerBounds(display, expanded), options.animate !== false);
  if (expanded) {
    mainWindow.show();
    mainWindow.focus();
  }
  notifyState();
}

function scheduleCollapse(delay = COLLAPSE_DELAY) {
  clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => setExpanded(false), delay);
}

function createWindow() {
  const initialBounds = drawerBounds(screen.getPrimaryDisplay(), false);
  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: DRAWER_WIDTH,
    maxWidth: DRAWER_WIDTH,
    minHeight: 640,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#f8f9f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  else mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5174");

  mainWindow.once("ready-to-show", () => {
    mainWindow.showInactive();
    moveWindow(drawerBounds(displayForWindow(), false), false);
    notifyState();
  });
  mainWindow.on("blur", () => {
    if (expanded) scheduleCollapse(140);
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    setExpanded(false);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  setExpanded(!expanded, { followCursor: !expanded });
}

function createTray() {
  const icon = process.platform === "darwin"
    ? nativeImage.createFromNamedImage("NSStatusAvailable")
    : nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAkElEQVR42mNgwA8YGBj+M8ABQxgYGP4zMDB8Z2Bg+M/AwPCfgYHhPwMDw38GBob/DAwM/xkYGP4zMDB8Z2Bg+M/AwPCfgYHhPwMDw38GBob/DAwM/xkYGP4zMDB8Z2Bg+M/AwPCfgYHhPwMDw38GBob/DAwM/xkYGP4zMDB8Z2Bg+M/AwPCfgYHhPwMDw38GBoY/APq8FQ8+uO8AAAAASUVORK5CYII=");
  icon.setTemplateImage(process.platform === "darwin");
  tray = new Tray(icon);
  tray.setToolTip("Mentor Simulator");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "展开 Mentor", click: () => setExpanded(true, { followCursor: true }) },
    { label: "收起", click: () => setExpanded(false) },
    { type: "separator" },
    { label: "退出", click: () => app.quit() }
  ]));
  tray.on("click", toggleWindow);
}

ipcMain.on("drawer:expand", () => setExpanded(true));
ipcMain.on("drawer:cancel-collapse", () => clearTimeout(collapseTimer));
ipcMain.on("drawer:schedule-collapse", () => scheduleCollapse());
ipcMain.on("drawer:collapse", () => setExpanded(false));

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock.hide();
  createWindow();
  createTray();
  screen.on("display-metrics-changed", () => moveWindow(drawerBounds(displayForWindow(), expanded), false));
  screen.on("display-removed", () => {
    activeDisplayId = screen.getPrimaryDisplay().id;
    moveWindow(drawerBounds(displayForWindow(), expanded), false);
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  clearTimeout(collapseTimer);
  stopAnimation();
});
app.on("window-all-closed", (event) => event.preventDefault());

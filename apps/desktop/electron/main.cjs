const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("node:path");

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 430,
    height: 780,
    minWidth: 390,
    minHeight: 640,
    show: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
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
  mainWindow.on("blur", () => mainWindow.hide());
}

function toggleWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow.isVisible()) mainWindow.hide();
  else {
    const bounds = tray.getBounds();
    const windowBounds = mainWindow.getBounds();
    const x = Math.round(bounds.x - windowBounds.width / 2 + bounds.width / 2);
    const y = process.platform === "darwin" ? bounds.y + bounds.height + 6 : bounds.y - windowBounds.height - 6;
    mainWindow.setPosition(Math.max(0, x), Math.max(0, y), false);
    mainWindow.show();
    mainWindow.focus();
  }
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock.hide();
  createWindow();
  const icon = process.platform === "darwin"
    ? nativeImage.createFromNamedImage("NSStatusAvailable")
    : nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Mentor Simulator");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 Mentor Simulator", click: toggleWindow },
    { type: "separator" },
    { label: "退出", click: () => app.quit() }
  ]));
  tray.on("click", toggleWindow);
});

app.on("window-all-closed", (event) => event.preventDefault());

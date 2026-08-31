const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mentorWindow", {
  expand: () => ipcRenderer.send("drawer:expand"),
  cancelCollapse: () => ipcRenderer.send("drawer:cancel-collapse"),
  scheduleCollapse: () => ipcRenderer.send("drawer:schedule-collapse"),
  collapse: () => ipcRenderer.send("drawer:collapse"),
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("drawer:state", listener);
    return () => ipcRenderer.removeListener("drawer:state", listener);
  }
});

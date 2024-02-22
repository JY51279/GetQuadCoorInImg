"use strict";
const electron = require("electron");
const path$1 = require("path");
const utils = require("@electron-toolkit/utils");
const icon = path$1.join(__dirname, "../../resources/icon.png");
const fs = require("fs");
const path = require("path");
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path$1.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path$1.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.webContents.openDevTools();
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.setMaxListeners(20);
  electron.ipcMain.on("open-json-file-dialog", (event) => {
    electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "JSON Files", extensions: ["json"] }]
    }).then((result) => {
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const fileName = path.basename(filePath);
        fs.readFile(filePath, "utf-8", (err, data) => {
          if (err) {
            console.log("Fail Open Json");
            event.reply("choose-json-file-response", { success: false, error: err.message });
            return;
          }
          console.log("Suc Open Json");
          const jsonInfo = { str: data, path: filePath, fileName };
          event.reply("choose-json-file-response", { success: true, jsonInfo });
        });
      }
    }).catch((err) => {
      console.error("Error while opening file dialog:", err);
    });
  });
  electron.ipcMain.on("save-json-file", (event, data) => {
    const filePath = data.path;
    const content = data.str;
    fs.writeFile(filePath, content, (err) => {
      if (err) {
        console.log("Fail Save Json");
        event.reply("save-json-file-response", { success: false, error: err.message });
      } else {
        console.log("Suc Save Json");
        event.reply("save-json-file-response", { success: true });
      }
    });
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0)
      createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});

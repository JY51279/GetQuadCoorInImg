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
    minWidth: 810,
    height: 1080,
    minHeight: 1080,
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
  if (!electron.app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}
const imageExtensions = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
  "tif",
  "webp",
  "svg",
  "svgz",
  "ico",
  "hdr",
  "exr",
  "pbm",
  "pgm",
  "ppm",
  "pcx",
  "tga",
  "wbmp",
  "xbm",
  "xpm"
];
function openPicFile(event, filePath) {
  const extname = path.extname(filePath).slice(1);
  const mimeType = `image/${extname}`;
  const imageDataURI = `data:${mimeType};base64,`;
  let base64 = imageDataURI;
  const stream = fs.createReadStream(filePath, { encoding: "base64" });
  stream.on("data", (chunk) => {
    base64 += chunk;
    if (base64.length > 1024 * 1024) {
      const picInfo = { str: base64, fileName: "" };
      event.reply("open-pic-file-response", { success: true, picInfo });
      base64 = "";
    }
  });
  stream.on("end", () => {
    try {
      console.log("Suc Open Pic");
      const fileName = path.basename(filePath);
      const picInfo = { str: base64, path: filePath, fileName };
      event.reply("open-pic-file-response", { success: true, picInfo });
    } catch (error) {
      event.reply("open-pic-file-response", { success: false, error: error.message });
    }
  });
  stream.on("error", (err) => {
    event.reply("open-pic-file-response", { success: false, error: err.message });
  });
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.setMaxListeners(20);
  electron.ipcMain.on("open-image-file-dialog", (event) => {
    electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Image Files", extensions: imageExtensions }]
    }).then((result) => {
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        openPicFile(event, filePath);
      }
    }).catch((err) => {
      console.error("Error while opening image file dialog:", err);
    });
  });
  electron.ipcMain.on("open-pic-file", (event, filePath) => {
    openPicFile(event, filePath);
  });
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
      console.error("Error while opening json file dialog:", err);
    });
  });
  electron.ipcMain.on("save-json-file", (event, data) => {
    const filePath = data.path;
    const content = data.str;
    try {
      fs.writeFile(filePath, content, (err) => {
        if (err) {
          console.log("Fail Save Json");
          event.reply("save-json-file-response", { success: false, error: err.message });
        } else {
          console.log("Suc Save Json");
          event.reply("save-json-file-response", { success: true });
        }
      });
    } catch (err) {
      console.log("Error:", err.message);
      event.reply("save-json-file-response", { success: false, error: err.message });
    }
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

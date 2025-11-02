// Windows Startup - Remove Auto-Start
// Run this to remove SQL Bridge from Windows Startup

const fs = require("fs");
const path = require("path");
const os = require("os");

const appName = "SQL Bridge";
const startupFolder = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Startup"
);

const shortcutPath = path.join(startupFolder, appName + ".lnk");

try {
  if (fs.existsSync(shortcutPath)) {
    fs.unlinkSync(shortcutPath);
    console.log("✅ Auto-start removed successfully!");
    console.log("");
    console.log("📁 Shortcut deleted from:");
    console.log(`   ${startupFolder}`);
    console.log("");
    console.log("ℹ️  SQL Bridge will no longer start automatically on boot.");
  } else {
    console.log("ℹ️  No auto-start shortcut found.");
    console.log("");
    console.log("📁 Checked location:");
    console.log(`   ${shortcutPath}`);
  }
} catch (error) {
  console.error("❌ Error removing startup shortcut:", error.message);
  console.log("");
  console.log("Manual removal:");
  console.log("1. Press Win + R");
  console.log("2. Type: shell:startup");
  console.log('3. Delete "SQL Bridge" shortcut');
}

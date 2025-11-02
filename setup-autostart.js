// Windows Startup - Auto-Start Setup
// Run this to add SQL Bridge to Windows Startup

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

// Path to the packaged executable
const exePath = path.join(__dirname, "release", "SQL Bridge.exe");

// Create shortcut using VBScript
const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${path.join(startupFolder, appName + ".lnk")}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${exePath}"
oLink.WorkingDirectory = "${path.dirname(exePath)}"
oLink.Description = "SQL Bridge - Auto Start"
oLink.Save
`;

const vbsPath = path.join(__dirname, "create-shortcut.vbs");

try {
  // Write VBS script
  fs.writeFileSync(vbsPath, vbsScript.trim());

  console.log("✅ Creating startup shortcut...");

  // Execute VBS script
  require("child_process").execSync(`cscript //nologo "${vbsPath}"`, {
    stdio: "inherit",
  });

  // Clean up VBS file
  fs.unlinkSync(vbsPath);

  console.log("");
  console.log("✅ Auto-start enabled successfully!");
  console.log("");
  console.log("📁 Shortcut created in:");
  console.log(`   ${startupFolder}`);
  console.log("");
  console.log("🚀 SQL Bridge will now start automatically when Windows boots!");
  console.log("");
  console.log("ℹ️  To disable auto-start:");
  console.log("   - Press Win + R");
  console.log("   - Type: shell:startup");
  console.log('   - Delete "SQL Bridge" shortcut');
  console.log("");
  console.log("💡 Or run: node remove-autostart.js");
} catch (error) {
  console.error("❌ Error creating startup shortcut:", error.message);
  console.log("");
  console.log("Manual setup:");
  console.log("1. Press Win + R");
  console.log("2. Type: shell:startup");
  console.log("3. Create shortcut to: " + exePath);
}

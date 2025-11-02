// Add SQL Bridge to Windows Startup
// Run: node setup-startup.js

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("🚀 SQL Bridge - Windows Startup Setup\n");

// Get the startup folder path
const startupFolder = path.join(
  process.env.APPDATA,
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Startup"
);

console.log("📁 Startup folder:", startupFolder);

// Get the exe path (portable exe in release folder)
// Try with version number first, then without
let exePath = path.join(__dirname, "release", "SQL Bridge 2.4.0.exe");

if (!fs.existsSync(exePath)) {
  exePath = path.join(__dirname, "release", "SQL Bridge.exe");
}

if (!fs.existsSync(exePath)) {
  console.error("❌ Error: SQL Bridge.exe not found!");
  console.error("   Expected location:", path.join(__dirname, "release"));
  console.error("\n💡 Please run: npm run package");
  process.exit(1);
}

console.log("✅ Found SQL Bridge.exe:", exePath);

// Create shortcut using PowerShell
const shortcutPath = path.join(startupFolder, "SQL Bridge.lnk");

const powershellScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, "\\\\")}")
$Shortcut.TargetPath = "${exePath.replace(/\\/g, "\\\\")}"
$Shortcut.WorkingDirectory = "${path.dirname(exePath).replace(/\\/g, "\\\\")}"
$Shortcut.Description = "SQL Bridge - Database Sync Application"
$Shortcut.Save()
`;

try {
  console.log("\n📝 Creating startup shortcut...");

  // Write PowerShell script to temp file
  const tempScript = path.join(__dirname, "temp-shortcut.ps1");
  fs.writeFileSync(tempScript, powershellScript);

  // Execute PowerShell script
  execSync(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, {
    stdio: "inherit",
  });

  // Clean up temp file
  fs.unlinkSync(tempScript);

  console.log("✅ Startup shortcut created successfully!");
  console.log("\n📊 Setup Complete!\n");
  console.log(
    "🎉 SQL Bridge will now start automatically when you login to Windows!\n"
  );
  console.log("📍 Shortcut location:");
  console.log("   " + shortcutPath);
  console.log("\n💡 Tips:");
  console.log("   - Application will minimize to system tray on startup");
  console.log("   - Look for the icon in bottom-right corner (system tray)");
  console.log("   - Right-click tray icon to quit");
  console.log("\n🗑️  To remove from startup:");
  console.log("   node remove-startup.js");
  console.log("   Or manually delete: " + shortcutPath);
} catch (error) {
  console.error("❌ Error creating shortcut:", error.message);
  console.error("\n💡 Manual Setup:");
  console.error("   1. Press Win + R");
  console.error("   2. Type: shell:startup");
  console.error("   3. Create shortcut to: " + exePath);
  process.exit(1);
}

// Remove SQL Bridge from Windows Startup
// Run: node remove-startup.js

const fs = require("fs");
const path = require("path");

console.log("🗑️  SQL Bridge - Remove from Windows Startup\n");

// Get the startup folder path
const startupFolder = path.join(
  process.env.APPDATA,
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Startup"
);

const shortcutPath = path.join(startupFolder, "SQL Bridge.lnk");

console.log("📁 Checking startup folder:", startupFolder);
console.log("🔍 Looking for shortcut:", shortcutPath);

// Check if shortcut exists
if (!fs.existsSync(shortcutPath)) {
  console.log("\n⚠️  SQL Bridge shortcut not found in startup folder.");
  console.log("   Either it was already removed or never added.");
  console.log("\n💡 Startup folder location:");
  console.log("   " + startupFolder);
  process.exit(0);
}

try {
  // Delete the shortcut
  fs.unlinkSync(shortcutPath);

  console.log("\n✅ Successfully removed SQL Bridge from Windows Startup!");
  console.log("\n📊 Details:");
  console.log("   - Shortcut deleted from startup folder");
  console.log("   - SQL Bridge will NOT start automatically on login");
  console.log("\n🚀 To add back to startup:");
  console.log("   node setup-startup.js");
} catch (error) {
  console.error("\n❌ Error removing shortcut:", error.message);
  console.error("\n💡 Manual removal:");
  console.error("   1. Press Win + R");
  console.error("   2. Type: shell:startup");
  console.error('   3. Delete "SQL Bridge.lnk"');
  process.exit(1);
}

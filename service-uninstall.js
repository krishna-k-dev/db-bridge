// Service Uninstallation Script for Windows
// Run as Administrator: node service-uninstall.js

const Service = require("node-windows").Service;
const path = require("path");

// Create a new service object (must match the install script)
const svc = new Service({
  name: "SQLBridgeApp",
  script: path.join(__dirname, "build", "main.js"),
});

// Listen for the "uninstall" event
svc.on("uninstall", function () {
  console.log("✅ Service uninstalled successfully!");
  console.log("🗑️  SQLBridgeApp has been removed from Windows Services");
  console.log("");
  console.log("To reinstall: node service-install.js");
});

// Listen for the "alreadyuninstalled" event
svc.on("alreadyuninstalled", function () {
  console.log("⚠️  Service is not installed!");
  console.log("Nothing to uninstall.");
});

// Listen for errors
svc.on("error", function (err) {
  console.error("❌ Error:", err);
});

console.log("🔧 SQL Bridge Service Uninstaller");
console.log("==================================");
console.log("");
console.log("⚠️  Make sure you are running this as Administrator!");
console.log("");
console.log("🗑️  Uninstalling service...");

// Uninstall the service
svc.uninstall();

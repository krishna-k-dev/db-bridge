// Service Installation Script for Windows
// Run as Administrator: node service-install.js

const Service = require("node-windows").Service;
const path = require("path");

// Create a new service object
const svc = new Service({
  name: "SQLBridgeApp",
  description:
    "SQL Bridge Background Service - Automated database sync and job scheduler",
  script: path.join(__dirname, "dist", "service-main.js"), // Compiled service entry point
  nodeOptions: ["--harmony", "--max_old_space_size=4096"],
  env: [
    {
      name: "NODE_ENV",
      value: "production",
    },
  ],
  // Service will restart automatically if it crashes
  maxRetries: 3,
  maxRestartSeconds: 60,
  // Grow delay between restarts
  grow: 0.5,
  // Wait 2 seconds before restarting
  wait: 2,
  // Service starts automatically on system boot
  startupType: "Automatic",
});

// Listen for the "install" event, which indicates the service is installed
svc.on("install", function () {
  console.log("✅ Service installed successfully!");
  console.log("📝 Service Name: SQLBridgeApp");
  console.log("🚀 Starting service...");
  svc.start();
});

// Listen for the "start" event
svc.on("start", function () {
  console.log("✅ Service started successfully!");
  console.log("🎉 SQL Bridge is now running in the background!");
  console.log("");
  console.log("📊 Service Details:");
  console.log("   - Name: SQLBridgeApp");
  console.log("   - Status: Running");
  console.log("   - Startup Type: Automatic (starts on system boot)");
  console.log("");
  console.log("🔧 Service Management:");
  console.log("   - Open Services: Win + R → services.msc");
  console.log("   - Or run: node service-uninstall.js (to remove)");
});

// Listen for the "alreadyinstalled" event
svc.on("alreadyinstalled", function () {
  console.log("⚠️  Service is already installed!");
  console.log("To reinstall:");
  console.log("  1. Run: node service-uninstall.js");
  console.log("  2. Then: node service-install.js");
});

// Listen for errors
svc.on("error", function (err) {
  console.error("❌ Service error:", err);
});

// Check if running as Administrator
console.log("🔧 SQL Bridge Service Installer");
console.log("================================");
console.log("");
console.log("⚠️  Make sure you are running this as Administrator!");
console.log("");
console.log("📦 Installing service...");

// Install the service
svc.install();

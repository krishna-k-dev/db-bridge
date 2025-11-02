// Service Installation Check Script
// Run this before installing service: node check-service-ready.js

const fs = require("fs");
const path = require("path");

console.log("🔍 SQL Bridge Service Pre-Installation Check\n");

let allChecks = true;

// Check 1: Compiled files
console.log("1️⃣ Checking compiled files...");
const serviceMain = path.join(__dirname, "dist", "service-main.js");
if (fs.existsSync(serviceMain)) {
  console.log("   ✅ dist/service-main.js found");
} else {
  console.log("   ❌ dist/service-main.js NOT found - Run: npm run build");
  allChecks = false;
}

// Check 2: Configuration files
console.log("\n2️⃣ Checking configuration files...");
const configPath = path.join(__dirname, "config", "config.json");
if (fs.existsSync(configPath)) {
  console.log("   ✅ config/config.json found");
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (config.whatsappApiUrl && config.whatsappToken) {
      console.log("   ✅ WhatsApp configuration present");
    } else {
      console.log("   ⚠️  WhatsApp configuration incomplete (optional)");
    }
  } catch (err) {
    console.log("   ❌ config/config.json is invalid JSON");
    allChecks = false;
  }
} else {
  console.log("   ❌ config/config.json NOT found");
  allChecks = false;
}

const jobsPath = path.join(__dirname, "config", "jobs.json");
if (fs.existsSync(jobsPath)) {
  console.log("   ✅ config/jobs.json found");
  try {
    const jobs = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
    if (Array.isArray(jobs) && jobs.length > 0) {
      console.log(`   ✅ ${jobs.length} job(s) configured`);
    } else {
      console.log("   ⚠️  No jobs configured yet");
    }
  } catch (err) {
    console.log("   ❌ config/jobs.json is invalid JSON");
    allChecks = false;
  }
} else {
  console.log("   ❌ config/jobs.json NOT found");
  allChecks = false;
}

// Check 3: Node modules
console.log("\n3️⃣ Checking dependencies...");
const nodeModulesPath = path.join(__dirname, "node_modules");
if (fs.existsSync(nodeModulesPath)) {
  console.log("   ✅ node_modules found");

  const nodeWindowsPath = path.join(nodeModulesPath, "node-windows");
  if (fs.existsSync(nodeWindowsPath)) {
    console.log("   ✅ node-windows package installed");
  } else {
    console.log("   ❌ node-windows NOT installed - Run: npm install");
    allChecks = false;
  }
} else {
  console.log("   ❌ node_modules NOT found - Run: npm install");
  allChecks = false;
}

// Check 4: Logs directory
console.log("\n4️⃣ Checking logs directory...");
const logsPath = path.join(__dirname, "logs");
if (fs.existsSync(logsPath)) {
  console.log("   ✅ logs/ directory exists");
} else {
  console.log(
    "   ⚠️  logs/ directory NOT found - Will be created automatically"
  );
}

// Check 5: Administrator privileges reminder
console.log("\n5️⃣ Administrator privileges check...");
console.log("   ⚠️  Service installation REQUIRES Administrator privileges");
console.log('   📝 To open Admin PowerShell: Win + X → "Terminal (Admin)"');

// Final summary
console.log("\n" + "=".repeat(60));
if (allChecks) {
  console.log("✅ All checks passed! Ready to install service.");
  console.log("\n📋 Next steps:");
  console.log("   1. Open PowerShell/CMD as Administrator");
  console.log("   2. Navigate to this directory");
  console.log("   3. Run: npm run service:install");
  console.log("\n💡 Or manually: node service-install.js");
} else {
  console.log("❌ Some checks failed. Please fix the issues above.");
  console.log("\n📋 Common fixes:");
  console.log("   - Missing compiled files: npm run build");
  console.log("   - Missing dependencies: npm install");
  console.log("   - Missing config: Copy from examples or configure manually");
}
console.log("=".repeat(60));

process.exit(allChecks ? 0 : 1);

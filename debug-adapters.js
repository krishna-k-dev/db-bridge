// Debug script to check if adapters have sendMultiConnection method
const { getAdapter } = require("./dist/adapters/index");

console.log("🔍 Checking Adapters...\n");

const adapterTypes = ["excel", "google_sheets", "custom_api", "webhook", "csv"];

adapterTypes.forEach((type) => {
  const adapter = getAdapter(type);

  if (adapter) {
    const hasSendMulti = typeof adapter.sendMultiConnection === "function";
    const hasSend = typeof adapter.send === "function";

    console.log(`📦 ${type}:`);
    console.log(`   - send() method: ${hasSend ? "✅" : "❌"}`);
    console.log(
      `   - sendMultiConnection() method: ${hasSendMulti ? "✅" : "❌"}`
    );
    console.log("");
  } else {
    console.log(`❌ ${type}: NOT FOUND\n`);
  }
});

console.log("✅ Debug check complete!");

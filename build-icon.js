const icongen = require("icon-gen");
const fs = require("fs");
const path = require("path");

async function buildIcon() {
  try {
    // Create build directory if it doesn't exist
    const buildDir = path.join(__dirname, "build");
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir);
    }

    const options = {
      input: path.join(__dirname, "src/icon/logo.png"),
      output: buildDir,
      ico: {
        name: "icon",
        sizes: [16, 24, 32, 48, 64, 128, 256],
      },
    };

    await icongen(options.input, options.output, options);
    console.log("✓ Icon converted successfully: build/icon.ico");
  } catch (e) {
    console.error("✗ Icon conversion failed:", e);
    process.exit(1);
  }
}

buildIcon();

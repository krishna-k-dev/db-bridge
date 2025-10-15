const { ipcRenderer } = require("electron");
const remote = require("@electron/remote");

let connections = [];
let jobs = [];
let currentEditConnection = null;
let currentEditJob = null;

// ===== TITLE BAR CONTROLS =====
document.getElementById("minimize-btn").addEventListener("click", () => {
  const window = remote.getCurrentWindow();
  window.minimize();
});

document.getElementById("maximize-btn").addEventListener("click", () => {
  const window = remote.getCurrentWindow();
  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

document.getElementById("close-btn").addEventListener("click", () => {
  const window = remote.getCurrentWindow();
  window.close();
});

// ===== NAVIGATION =====
document.querySelectorAll(".nav-item").forEach((nav) => {
  nav.addEventListener("click", () => {
    const pageName = nav.dataset.page;

    // Update active nav
    document
      .querySelectorAll(".nav-item")
      .forEach((n) => n.classList.remove("active"));
    nav.classList.add("active");

    // Update active page
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.remove("active"));
    document.getElementById(`${pageName}-page`).classList.add("active");

    // Load data
    if (pageName === "connections") {
      loadConnections();
    } else if (pageName === "jobs") {
      loadJobs();
    } else if (pageName === "logs") {
      loadLogs();
    }
  });
});

// ===== CONNECTIONS =====
async function loadConnections() {
  connections = await ipcRenderer.invoke("get-connections");

  document.getElementById("connections-count").textContent = connections.length;

  const connectionsList = document.getElementById("connections-list");
  const connectionsEmpty = document.getElementById("connections-empty");

  if (connections.length === 0) {
    connectionsList.innerHTML = "";
    connectionsEmpty.style.display = "block";
    updateJobButtonState();
    return;
  }

  connectionsEmpty.style.display = "none";

  connectionsList.innerHTML = connections
    .map(
      (conn) => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(conn.name)}</div>
          <div class="card-subtitle">${escapeHtml(conn.server)} / ${escapeHtml(
        conn.database
      )}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-info">
          <div class="info-row">
            <span class="info-label">Server</span>
            <span class="info-value">${escapeHtml(conn.server)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Database</span>
            <span class="info-value">${escapeHtml(conn.database)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">User</span>
            <span class="info-value">${
              conn.user ? escapeHtml(conn.user) : "Windows Auth"
            }</span>
          </div>
          ${
            conn.lastTested
              ? `
          <div class="info-row">
            <span class="info-label">Last Tested</span>
            <span class="info-value">${new Date(
              conn.lastTested
            ).toLocaleString()}</span>
          </div>
          `
              : ""
          }
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-sm" onclick="testConnection('${
          conn.id
        }')">
          <img src="../icon/refresh-ccw.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);"> Test
        </button>
        <button class="btn btn-secondary btn-sm" onclick="editConnection('${
          conn.id
        }')">
          <img src="../icon/pencil.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);"> Edit
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteConnection('${
          conn.id
        }')">
          <img src="../icon/trash-2.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);"> Delete
        </button>
      </div>
    </div>
  `
    )
    .join("");

  updateJobButtonState();
}

async function testConnection(connId) {
  try {
    const result = await ipcRenderer.invoke("test-connection", connId);
    if (result.success) {
      alert(`✅ ${result.message}`);
      // Update lastTested
      await ipcRenderer.invoke("update-connection", connId, {
        lastTested: new Date(),
      });
      loadConnections();
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
}

function editConnection(connId) {
  const conn = connections.find((c) => c.id === connId);
  if (!conn) return;

  currentEditConnection = connId;

  document.getElementById("connection-modal-title").textContent =
    "Edit Connection";
  document.getElementById("conn-name").value = conn.name;

  // Display server with port if not default
  const serverValue =
    conn.port && conn.port !== 1433
      ? `${conn.server}:${conn.port}`
      : conn.server;
  document.getElementById("conn-server").value = serverValue;

  document.getElementById("conn-database").value = conn.database;
  document.getElementById("conn-user").value = conn.user || "";
  document.getElementById("conn-password").value = conn.password || "";
  document.getElementById("conn-trust-cert").checked =
    conn.options?.trustServerCertificate ?? true;

  openModal("connection-modal");
}

async function deleteConnection(connId) {
  if (!confirm("Delete this connection? Any jobs using it will fail.")) return;

  try {
    const result = await ipcRenderer.invoke("delete-connection", connId);
    if (result.success) {
      alert("✅ Connection deleted!");
      loadConnections();
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
}

document.getElementById("add-connection-btn").addEventListener("click", () => {
  currentEditConnection = null;
  document.getElementById("connection-modal-title").textContent =
    "Add Connection";
  document.getElementById("connection-form").reset();
  document.getElementById("conn-trust-cert").checked = true;
  openModal("connection-modal");
});

document
  .getElementById("connection-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    // Parse server and port
    const serverInput = document.getElementById("conn-server").value.trim();
    let server = serverInput;
    let port = 1433; // Default SQL Server port

    // Check if user provided port (e.g., localhost:8000)
    if (serverInput.includes(":")) {
      const parts = serverInput.split(":");
      server = parts[0];
      port = parseInt(parts[1]) || 1433;
    }

    const connection = {
      id: currentEditConnection || `conn_${Date.now()}`,
      name: document.getElementById("conn-name").value,
      server: server,
      port: port,
      database: document.getElementById("conn-database").value,
      user: document.getElementById("conn-user").value || undefined,
      password: document.getElementById("conn-password").value || undefined,
      options: {
        trustServerCertificate:
          document.getElementById("conn-trust-cert").checked,
      },
      createdAt: new Date(),
    };

    try {
      if (currentEditConnection) {
        await ipcRenderer.invoke(
          "update-connection",
          currentEditConnection,
          connection
        );
        alert("✅ Connection updated!");
      } else {
        await ipcRenderer.invoke("add-connection", connection);
        alert("✅ Connection added!");
      }
      closeModal("connection-modal");
      loadConnections();
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    }
  });

document
  .getElementById("test-connection-btn-modal")
  .addEventListener("click", async () => {
    // Parse server and port
    const serverInput = document.getElementById("conn-server").value.trim();
    let server = serverInput;
    let port = 1433;

    if (serverInput.includes(":")) {
      const parts = serverInput.split(":");
      server = parts[0];
      port = parseInt(parts[1]) || 1433;
    }

    const tempConn = {
      id: "test_temp",
      name: "Test",
      server: server,
      port: port,
      database: document.getElementById("conn-database").value,
      user: document.getElementById("conn-user").value || undefined,
      password: document.getElementById("conn-password").value || undefined,
      options: {
        trustServerCertificate:
          document.getElementById("conn-trust-cert").checked,
      },
    };

    try {
      // Add temp connection
      await ipcRenderer.invoke("add-connection", tempConn);
      const result = await ipcRenderer.invoke("test-connection", "test_temp");
      await ipcRenderer.invoke("delete-connection", "test_temp");

      if (result.success) {
        alert(`✅ ${result.message}`);
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
      try {
        await ipcRenderer.invoke("delete-connection", "test_temp");
      } catch (e) {}
    }
  });

// ===== JOBS =====
async function loadJobs() {
  connections = await ipcRenderer.invoke("get-connections");
  jobs = await ipcRenderer.invoke("get-jobs");

  document.getElementById("jobs-count").textContent = jobs.length;

  const jobsList = document.getElementById("jobs-list");
  const jobsEmpty = document.getElementById("jobs-empty");
  const jobsNoConnections = document.getElementById("jobs-no-connections");

  if (connections.length === 0) {
    jobsList.innerHTML = "";
    jobsEmpty.style.display = "none";
    jobsNoConnections.style.display = "block";
    return;
  }

  jobsNoConnections.style.display = "none";

  if (jobs.length === 0) {
    jobsList.innerHTML = "";
    jobsEmpty.style.display = "block";
    return;
  }

  jobsEmpty.style.display = "none";

  jobsList.innerHTML = jobs
    .map((job) => {
      const conn = connections.find((c) => c.id === job.connectionId);
      const connName = conn ? conn.name : "Unknown";

      return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(job.name)}</div>
            <div class="card-subtitle"><img src="../icon/cable.svg" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px;"> ${escapeHtml(
              connName
            )}</div>
          </div>
          <span class="card-badge ${job.enabled ? "success" : "danger"}">
            ${job.enabled ? "● Enabled" : "○ Disabled"}
          </span>
        </div>
        <div class="card-body">
          <div class="card-info">
            <div class="info-row">
              <span class="info-label">Schedule</span>
              <span class="info-value">${escapeHtml(job.schedule)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Trigger</span>
              <span class="info-value">${job.trigger}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Destinations</span>
              <span class="info-value">${job.destinations.length}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Last Run</span>
              <span class="info-value">${
                job.lastRun ? new Date(job.lastRun).toLocaleString() : "Never"
              }</span>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" onclick="runJob('${job.id}')">
            <img src="../icon/mouse-pointer-2.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);"> Run
          </button>
          <button class="btn btn-primary btn-sm" onclick="testJob('${job.id}')">
            <img src="../icon/refresh-ccw.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);"> Test
          </button>
          <button class="btn btn-secondary btn-sm" onclick="editJob('${
            job.id
          }')">
            <img src="../icon/pencil.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);"> Edit
          </button>
          <button class="btn btn-${
            job.enabled ? "warning" : "success"
          } btn-sm" onclick="toggleJob('${job.id}', ${!job.enabled})">
            <img src="../icon/${
              job.enabled ? "mouse-pointer-ban.svg" : "mouse-pointer-2.svg"
            }" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);"> ${
        job.enabled ? "Disable" : "Enable"
      }
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteJob('${
            job.id
          }')">
            <img src="../icon/trash-2.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);"> Delete
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

async function runJob(jobId) {
  if (!confirm("Run this job now?")) return;

  try {
    const result = await ipcRenderer.invoke("run-job", jobId);
    if (result.success) {
      alert("✅ Job executed successfully!");
      loadJobs();
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
}

async function testJob(jobId) {
  try {
    const result = await ipcRenderer.invoke("test-job", jobId);
    if (result.success) {
      alert(`✅ ${result.message}\n\nRows: ${result.rowCount}`);
    } else {
      alert(`❌ ${result.message}`);
    }
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
}

async function editJob(jobId) {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return;

  currentEditJob = job.id;
  document.getElementById("job-modal-title").textContent = "Edit Job";

  // Populate form
  document.getElementById("job-name").value = job.name;
  document.getElementById("job-connection").value = job.connectionId;
  document.getElementById("job-query").value = job.query;
  document.getElementById("job-schedule").value = job.schedule;
  document.getElementById("job-trigger").value = job.trigger;

  // Populate connection dropdown
  const connSelect = document.getElementById("job-connection");
  connSelect.innerHTML =
    '<option value="">-- Select Connection --</option>' +
    connections
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");
  connSelect.value = job.connectionId;

  // Clear and populate destinations
  const container = document.getElementById("destinations-container");
  container.innerHTML = "";
  job.destinations.forEach((dest) => {
    addDestinationItem(dest);
  });

  openModal("job-modal");
}

async function toggleJob(jobId, enabled) {
  try {
    await ipcRenderer.invoke("update-job", jobId, { enabled });
    loadJobs();
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
}

async function deleteJob(jobId) {
  if (!confirm("Delete this job permanently?")) return;

  try {
    await ipcRenderer.invoke("delete-job", jobId);
    alert("✅ Job deleted!");
    loadJobs();
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
}

function updateJobButtonState() {
  const addJobBtn = document.getElementById("add-job-btn");
  const addJobEmptyBtn = document.getElementById("add-job-empty-btn");
  const hasConnections = connections.length > 0;

  addJobBtn.disabled = !hasConnections;
  addJobEmptyBtn.disabled = !hasConnections;
}

document.getElementById("add-job-btn").addEventListener("click", () => {
  if (connections.length === 0) {
    alert("⚠️ Please add at least one connection first!");
    return;
  }

  currentEditJob = null;
  document.getElementById("job-modal-title").textContent = "Create New Job";
  document.getElementById("job-form").reset();

  // Populate connection dropdown
  const connSelect = document.getElementById("job-connection");
  connSelect.innerHTML =
    '<option value="">-- Select Connection --</option>' +
    connections
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join("");

  // Clear destinations
  document.getElementById("destinations-container").innerHTML = "";

  // Reset schedule
  document.getElementById("job-schedule").value = "*/2 * * * *";

  openModal("job-modal");
});

document
  .getElementById("job-schedule-preset")
  .addEventListener("change", (e) => {
    const scheduleInput = document.getElementById("job-schedule");
    if (e.target.value === "manual") {
      // Manual mode - no auto schedule
      scheduleInput.value = "manual";
      scheduleInput.disabled = true;
      scheduleInput.placeholder = "Manual mode - Run button only";
    } else if (e.target.value) {
      scheduleInput.value = e.target.value;
      scheduleInput.disabled = false;
      scheduleInput.placeholder = "*/2 * * * *";
    } else {
      scheduleInput.disabled = false;
      scheduleInput.placeholder = "*/2 * * * *";
    }
  });

document.getElementById("add-destination-btn").addEventListener("click", () => {
  addDestinationItem();
});

function addDestinationItem(dest = null) {
  const container = document.getElementById("destinations-container");
  const destItem = document.createElement("div");
  destItem.className = "destination-item";
  destItem.innerHTML = `
    <select class="dest-type">
      <option value="">-- Select Type --</option>
      <option value="webhook" ${
        dest?.type === "webhook" ? "selected" : ""
      }>Webhook</option>
      <option value="google_sheets" ${
        dest?.type === "google_sheets" ? "selected" : ""
      }>Google Sheets</option>
      <option value="custom_api" ${
        dest?.type === "custom_api" ? "selected" : ""
      }>Custom API</option>
      <option value="excel" ${
        dest?.type === "excel" ? "selected" : ""
      }>Excel File</option>
      <option value="csv" ${
        dest?.type === "csv" ? "selected" : ""
      }>CSV File</option>
    </select>
    <div class="dest-config"></div>
    <button type="button" class="btn btn-danger btn-sm remove-dest">Remove</button>
  `;

  container.appendChild(destItem);

  destItem.querySelector(".dest-type").addEventListener("change", (e) => {
    updateDestinationConfig(destItem, e.target.value);
  });

  destItem.querySelector(".remove-dest").addEventListener("click", () => {
    destItem.remove();
  });

  if (dest) {
    updateDestinationConfig(destItem, dest.type, dest);
  }
}

function updateDestinationConfig(destItem, type, existingConfig = null) {
  const configDiv = destItem.querySelector(".dest-config");

  if (type === "webhook") {
    configDiv.innerHTML = `
      <div class="form-group">
        <label>URL *</label>
        <input type="url" class="dest-url" required value="${
          existingConfig?.url || ""
        }">
      </div>
      <div class="form-group">
        <label>Method</label>
        <select class="dest-method">
          <option value="POST" ${
            existingConfig?.method === "POST" ? "selected" : ""
          }>POST</option>
          <option value="PUT" ${
            existingConfig?.method === "PUT" ? "selected" : ""
          }>PUT</option>
          <option value="PATCH" ${
            existingConfig?.method === "PATCH" ? "selected" : ""
          }>PATCH</option>
        </select>
      </div>
      <div class="form-group">
        <label>Headers (JSON)</label>
        <textarea class="dest-headers" rows="2" placeholder='{"Authorization": "Bearer token"}'>${
          existingConfig?.headers ? JSON.stringify(existingConfig.headers) : ""
        }</textarea>
      </div>
    `;
  } else if (type === "google_sheets") {
    configDiv.innerHTML = `
      <div class="form-group">
        <label>Spreadsheet ID *</label>
        <input type="text" class="dest-spreadsheet-id" required value="${
          existingConfig?.spreadsheetId || ""
        }">
        <small>From URL: docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit</small>
      </div>
      <div class="form-group">
        <label>Sheet Name *</label>
        <input type="text" class="dest-sheet-name" required placeholder="Sheet1" value="${
          existingConfig?.sheetName || "Sheet1"
        }">
      </div>
      <div class="form-group">
        <label>Mode *</label>
        <select class="dest-mode">
          <option value="append" ${
            existingConfig?.mode === "append" ? "selected" : ""
          }>Append (add new rows)</option>
          <option value="replace" ${
            existingConfig?.mode === "replace" ? "selected" : ""
          }>Replace (clear & write)</option>
          <option value="update" ${
            existingConfig?.mode === "update" ? "selected" : ""
          }>Update (by key column)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Key Column (for update mode)</label>
        <input type="text" class="dest-key-column" placeholder="id" value="${
          existingConfig?.keyColumn || ""
        }">
      </div>
      <div class="form-group">
        <label>Credentials Path *</label>
        <input type="text" class="dest-credentials-path" required value="${
          existingConfig?.credentialsPath || "./config/google-credentials.json"
        }">
      </div>
    `;
  } else if (type === "custom_api") {
    configDiv.innerHTML = `
      <div class="form-group">
        <label>API URL *</label>
        <input type="url" class="dest-url" required value="${
          existingConfig?.url || ""
        }">
      </div>
      <div class="form-group">
        <label>Method</label>
        <select class="dest-method">
          <option value="POST" ${
            existingConfig?.method === "POST" ? "selected" : ""
          }>POST</option>
          <option value="PUT" ${
            existingConfig?.method === "PUT" ? "selected" : ""
          }>PUT</option>
          <option value="PATCH" ${
            existingConfig?.method === "PATCH" ? "selected" : ""
          }>PATCH</option>
        </select>
      </div>
      <div class="form-group">
        <label>Headers (JSON)</label>
        <textarea class="dest-headers" rows="2" placeholder='{"Authorization": "Bearer token"}'>${
          existingConfig?.headers ? JSON.stringify(existingConfig.headers) : ""
        }</textarea>
      </div>
    `;
  } else if (type === "excel") {
    configDiv.innerHTML = `
      <div class="form-group">
        <label>File Path *</label>
        <input type="text" class="dest-file-path" required placeholder="C:/exports/data.xlsx" value="${
          existingConfig?.filePath || ""
        }">
        <small>Full path where Excel file will be saved</small>
      </div>
      <div class="form-group">
        <label>Sheet Name</label>
        <input type="text" class="dest-sheet-name" placeholder="Sheet1" value="${
          existingConfig?.sheetName || "Sheet1"
        }">
      </div>
      <div class="form-group">
        <label>Mode</label>
        <select class="dest-mode">
          <option value="replace" ${
            existingConfig?.mode === "replace" ? "selected" : ""
          }>Replace (overwrite file)</option>
          <option value="append" ${
            existingConfig?.mode === "append" ? "selected" : ""
          }>Append (add to existing)</option>
        </select>
      </div>
    `;
  } else if (type === "csv") {
    configDiv.innerHTML = `
      <div class="form-group">
        <label>File Path *</label>
        <input type="text" class="dest-file-path" required placeholder="C:/exports/data.csv" value="${
          existingConfig?.filePath || ""
        }">
        <small>Full path where CSV file will be saved</small>
      </div>
      <div class="form-group">
        <label>Delimiter</label>
        <input type="text" class="dest-delimiter" maxlength="1" placeholder="," value="${
          existingConfig?.delimiter || ","
        }">
        <small>Character to separate values (default: comma)</small>
      </div>
      <div class="form-group">
        <label>Mode</label>
        <select class="dest-mode">
          <option value="replace" ${
            existingConfig?.mode === "replace" ? "selected" : ""
          }>Replace (overwrite file)</option>
          <option value="append" ${
            existingConfig?.mode === "append" ? "selected" : ""
          }>Append (add to existing)</option>
        </select>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" class="dest-include-headers" ${
            existingConfig?.includeHeaders !== false ? "checked" : ""
          }>
          Include Headers
        </label>
      </div>
    `;
  } else {
    configDiv.innerHTML = "";
  }
}

function getDestinations() {
  const destinations = [];
  document.querySelectorAll(".destination-item").forEach((item) => {
    const type = item.querySelector(".dest-type").value;
    if (!type) return;

    const dest = { type };

    if (type === "webhook") {
      dest.url = item.querySelector(".dest-url").value;
      dest.method = item.querySelector(".dest-method").value;
      const headersText = item.querySelector(".dest-headers").value;
      if (headersText) {
        try {
          dest.headers = JSON.parse(headersText);
        } catch (e) {
          alert("Invalid JSON in webhook headers");
        }
      }
    } else if (type === "google_sheets") {
      dest.spreadsheetId = item.querySelector(".dest-spreadsheet-id").value;
      dest.sheetName = item.querySelector(".dest-sheet-name").value;
      dest.mode = item.querySelector(".dest-mode").value;
      dest.keyColumn =
        item.querySelector(".dest-key-column").value || undefined;
      dest.credentialsPath = item.querySelector(".dest-credentials-path").value;
    } else if (type === "custom_api") {
      dest.url = item.querySelector(".dest-url").value;
      dest.method = item.querySelector(".dest-method").value;
      const headersText = item.querySelector(".dest-headers").value;
      if (headersText) {
        try {
          dest.headers = JSON.parse(headersText);
        } catch (e) {
          alert("Invalid JSON in custom API headers");
        }
      }
    } else if (type === "excel") {
      dest.filePath = item.querySelector(".dest-file-path").value;
      dest.sheetName = item.querySelector(".dest-sheet-name").value || "Sheet1";
      dest.mode = item.querySelector(".dest-mode").value || "replace";
    } else if (type === "csv") {
      dest.filePath = item.querySelector(".dest-file-path").value;
      dest.delimiter = item.querySelector(".dest-delimiter").value || ",";
      dest.mode = item.querySelector(".dest-mode").value || "replace";
      dest.includeHeaders = item.querySelector(".dest-include-headers").checked;
    }

    destinations.push(dest);
  });

  return destinations;
}

document.getElementById("job-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const destinations = getDestinations();

  if (destinations.length === 0) {
    alert("⚠️ Please add at least one destination!");
    return;
  }

  const job = {
    id: currentEditJob || `job_${Date.now()}`,
    name: document.getElementById("job-name").value,
    enabled: true,
    connectionId: document.getElementById("job-connection").value,
    query: document.getElementById("job-query").value,
    schedule: document.getElementById("job-schedule").value,
    trigger: document.getElementById("job-trigger").value,
    destinations,
  };

  try {
    if (currentEditJob) {
      await ipcRenderer.invoke("update-job", currentEditJob, job);
      alert("✅ Job updated!");
    } else {
      await ipcRenderer.invoke("add-job", job);
      alert("✅ Job created successfully!");
    }
    closeModal("job-modal");
    loadJobs();
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
});

// ===== LOGS =====
async function loadLogs() {
  const logsContainer = document.getElementById("logs-container");
  logsContainer.innerHTML =
    '<div style="text-align: center; opacity: 0.6;">Loading...</div>';

  try {
    const logs = await ipcRenderer.invoke("get-logs");

    if (logs.length === 0) {
      logsContainer.innerHTML =
        '<div style="text-align: center; opacity: 0.6;">No logs yet</div>';
      return;
    }

    logsContainer.innerHTML = logs
      .map((log) => {
        let className = "info";
        if (log.includes("[ERROR]")) className = "error";
        else if (log.includes("[WARN]")) className = "warn";

        return `<div class="log-line ${className}">${escapeHtml(log)}</div>`;
      })
      .join("");

    logsContainer.scrollTop = logsContainer.scrollHeight;
  } catch (error) {
    logsContainer.innerHTML = `<div class="log-line error">Error loading logs: ${error.message}</div>`;
  }
}

document.getElementById("refresh-logs-btn").addEventListener("click", loadLogs);
document
  .getElementById("clear-logs-btn")
  .addEventListener("click", async () => {
    if (!confirm("Clear all logs?")) return;
    await ipcRenderer.invoke("clear-logs");
    loadLogs();
  });

// ===== MODAL HELPERS =====
function openModal(modalId) {
  // Use native HTML5 dialog.showModal() - GUARANTEED NO FREEZE!
  const dialog = document.getElementById(modalId);
  if (dialog && dialog.tagName === "DIALOG") {
    dialog.showModal(); // Native modal with built-in backdrop

    // Reset scroll to top
    const dialogBody = dialog.querySelector(".dialog-body, .modal-body");
    if (dialogBody) {
      dialogBody.scrollTop = 0;
    }

    // Focus first input
    setTimeout(() => {
      const firstInput = dialog.querySelector(
        'input:not([type="checkbox"]):not([type="hidden"]), textarea, select'
      );
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
  }
}

function closeModal(modalId) {
  // Use native dialog.close()
  const dialog = document.getElementById(modalId);
  if (dialog && dialog.tagName === "DIALOG") {
    dialog.close();
  }
}

// Close dialog on Escape key (built-in feature of <dialog>)
// Close on backdrop click
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    // Click outside dialog content closes it
    const rect = dialog.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      dialog.close();
    }
  });
});

// ===== HELPERS =====
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ===== INITIAL LOAD =====
loadConnections();

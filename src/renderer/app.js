const { ipcRenderer } = require("electron");
const remote = require("@electron/remote");

let connections = [];
let jobs = [];
let currentEditConnection = null;
let currentEditJob = null;

// Pagination and filtering variables
let connectionsPage = 1;
let jobsPage = 1;
let connectionsPerPage = 10;
let jobsPerPage = 10;
let filteredConnections = [];
let filteredJobs = [];

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
    } else if (pageName === "settings") {
      loadSettings();
    }
  });
});

// ===== ACTION DROPDOWN HANDLING =====
function toggleActionDropdown(dropdownId, event) {
  event.stopPropagation();

  // Close all other dropdowns
  document.querySelectorAll(".action-dropdown.show").forEach((dropdown) => {
    if (dropdown.id !== `dropdown-${dropdownId}`) {
      dropdown.classList.remove("show");
    }
  });

  // Toggle the clicked dropdown
  const dropdown = document.getElementById(`dropdown-${dropdownId}`);
  dropdown.classList.toggle("show");
}

// Close dropdowns when clicking outside
document.addEventListener("click", (event) => {
  if (!event.target.closest(".table-actions")) {
    document.querySelectorAll(".action-dropdown.show").forEach((dropdown) => {
      dropdown.classList.remove("show");
    });
  }
});

// ===== CONNECTIONS CHECKBOXES =====
let selectedConnections = [];
let filteredConnectionsForJob = [];

function populateConnectionCheckboxes(filterConnections = null) {
  const container = document.getElementById("connections-checkbox-container");
  const countElement = document.getElementById("selected-count");

  if (!container) return;

  container.innerHTML = "";

  // Use filtered connections if provided, otherwise use all connections
  const connectionsToShow = filterConnections || connections;
  filteredConnectionsForJob = connectionsToShow;

  if (connectionsToShow.length === 0) {
    container.innerHTML =
      '<p style="color: var(--gray-500); font-size: 13px; margin: 0;">No connections available</p>';
    return;
  }

  connectionsToShow.forEach((conn) => {
    const item = document.createElement("div");
    item.className = "connection-checkbox-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `conn-${conn.id}`;
    checkbox.value = conn.id;
    checkbox.checked = selectedConnections.includes(conn.id);
    checkbox.className = "connection-checkbox";

    const label = document.createElement("label");
    label.htmlFor = `conn-${conn.id}`;
    label.textContent = `${conn.name} ${
      conn.financialYear ? "(" + conn.financialYear + ")" : ""
    }`;

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        if (!selectedConnections.includes(conn.id)) {
          selectedConnections.push(conn.id);
        }
      } else {
        selectedConnections = selectedConnections.filter(
          (id) => id !== conn.id
        );
      }
      updateConnectionCount();
      updateSelectAllCheckbox();
    });

    item.appendChild(checkbox);
    item.appendChild(label);
    container.appendChild(item);
  });

  updateConnectionCount();
  updateSelectAllCheckbox();
}

function updateConnectionCount() {
  const countElement = document.getElementById("selected-count");
  if (countElement) {
    countElement.textContent = `(${selectedConnections.length} selected)`;
  }
}

function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById("select-all-connections");
  if (!selectAllCheckbox) return;

  const checkboxes = document.querySelectorAll(".connection-checkbox");
  const checkedCount = Array.from(checkboxes).filter((cb) => cb.checked).length;

  selectAllCheckbox.checked =
    checkboxes.length > 0 && checkedCount === checkboxes.length;
  selectAllCheckbox.indeterminate =
    checkedCount > 0 && checkedCount < checkboxes.length;
}

// ===== SEARCH AND PAGINATION =====
// Connections search
document.getElementById("connections-search").addEventListener("input", (e) => {
  filterConnections(e.target.value);
});

// Jobs search
document.getElementById("jobs-search").addEventListener("input", (e) => {
  filterJobs(e.target.value);
});

// Pagination buttons
document.getElementById("connections-prev").addEventListener("click", () => {
  if (connectionsPage > 1) {
    connectionsPage--;
    renderConnectionsPage();
  }
});

document.getElementById("connections-next").addEventListener("click", () => {
  const totalPages = Math.ceil(filteredConnections.length / connectionsPerPage);
  if (connectionsPage < totalPages) {
    connectionsPage++;
    renderConnectionsPage();
  }
});

document.getElementById("jobs-prev").addEventListener("click", () => {
  if (jobsPage > 1) {
    jobsPage--;
    renderJobsPage();
  }
});

document.getElementById("jobs-next").addEventListener("click", () => {
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);
  if (jobsPage < totalPages) {
    jobsPage++;
    renderJobsPage();
  }
});

// ===== CONNECTIONS =====
async function loadConnections() {
  connections = await ipcRenderer.invoke("get-connections");
  filteredConnections = [...connections];
  connectionsPage = 1;

  document.getElementById("connections-count").textContent = connections.length;

  const connectionsList = document.getElementById("connections-list");
  const connectionsEmpty = document.getElementById("connections-empty");

  if (connections.length === 0) {
    connectionsList.style.display = "none";
    document.getElementById("connections-pagination").style.display = "none";
    connectionsEmpty.style.display = "block";
    updateJobButtonState();
    return;
  }

  connectionsEmpty.style.display = "none";
  connectionsList.style.display = "block";
  document.getElementById("connections-pagination").style.display = "flex";
  renderConnectionsPage();
  updateJobButtonState();
}

function filterConnections(searchTerm) {
  const term = searchTerm.toLowerCase();
  filteredConnections = connections.filter(
    (conn) =>
      conn.name.toLowerCase().includes(term) ||
      conn.server.toLowerCase().includes(term) ||
      conn.database.toLowerCase().includes(term)
  );
  connectionsPage = 1;
  renderConnectionsPage();
}

function renderConnectionsPage() {
  const tbody = document.getElementById("connections-tbody");
  const startIndex = (connectionsPage - 1) * connectionsPerPage;
  const endIndex = startIndex + connectionsPerPage;
  const pageConnections = filteredConnections.slice(startIndex, endIndex);

  tbody.innerHTML = pageConnections
    .map(
      (conn) => `
    <tr>
      <td>
        <div class="table-cell-content">
          <div class="table-title">${escapeHtml(conn.name)}</div>
          <div class="table-text" style="font-size: 12px; color: var(--gray-500);">
            ${
              conn.financialYear ? `FY: ${escapeHtml(conn.financialYear)}` : ""
            } 
            ${
              conn.group
                ? `• ${
                    conn.group === "partner"
                      ? "Partner: " + escapeHtml(conn.partner || "")
                      : "Self"
                  }`
                : ""
            }
          </div>
        </div>
      </td>
      <td>
        <div class="table-cell-content">
          <div class="table-text">${escapeHtml(conn.server)}${
        conn.port && conn.port !== 1433 ? `:${conn.port}` : ""
      }</div>
        </div>
      </td>
      <td>
        <div class="table-cell-content">
          <div class="table-text">${escapeHtml(conn.database)}</div>
        </div>
      </td>
      <td>
        <div class="table-cell-content">
          <span class="table-status ${conn.lastTested ? "success" : "warning"}">
            ${conn.lastTested ? "Tested" : "Untested"}
          </span>
        </div>
      </td>
      <td>
        <div class="table-actions">
          <button class="action-btn" onclick="toggleActionDropdown('${
            conn.id
          }', event)">
            <img src="../icon/pencil.svg" alt="Actions">
          </button>
          <div id="dropdown-${conn.id}" class="action-dropdown">
            <button class="action-dropdown-item" onclick="testConnection('${
              conn.id
            }')">
              <img src="../icon/refresh-ccw.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> Test
            </button>
            <button class="action-dropdown-item" onclick="editConnection('${
              conn.id
            }')">
              <img src="../icon/pencil.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> Edit
            </button>
            <button class="action-dropdown-item" onclick="duplicateConnection('${
              conn.id
            }')">
              <img src="../icon/copy.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> Duplicate
            </button>
            <button class="action-dropdown-item danger" onclick="deleteConnection('${
              conn.id
            }')">
              <img src="../icon/trash-2.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> Delete
            </button>
          </div>
        </div>
      </td>
    </tr>
  `
    )
    .join("");

  updateConnectionsPagination();
}

function updateConnectionsPagination() {
  const totalPages = Math.ceil(filteredConnections.length / connectionsPerPage);
  const prevBtn = document.getElementById("connections-prev");
  const nextBtn = document.getElementById("connections-next");
  const info = document.getElementById("connections-info");

  prevBtn.disabled = connectionsPage <= 1;
  nextBtn.disabled = connectionsPage >= totalPages;
  info.textContent = `Page ${connectionsPage} of ${totalPages || 1}`;
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

async function editConnection(connId) {
  const conn = connections.find((c) => c.id === connId);
  if (!conn) return;

  currentEditConnection = connId;

  // Load settings to populate dropdowns
  await loadSettings();

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

  // Set financial year
  document.getElementById("conn-financial-year").value =
    conn.financialYear || "";

  // Set group
  if (conn.group === "partner") {
    document.getElementById("conn-group-partner").checked = true;
    document.getElementById("conn-partner-group").style.display = "block";
    document
      .getElementById("conn-partner")
      .setAttribute("required", "required");
    document.getElementById("conn-partner").value = conn.partner || "";
  } else {
    document.getElementById("conn-group-self").checked = true;
    document.getElementById("conn-partner-group").style.display = "none";
    document.getElementById("conn-partner").removeAttribute("required");
  }

  openModal("connection-modal");
}

async function duplicateConnection(connId) {
  const conn = connections.find((c) => c.id === connId);
  if (!conn) return;

  const newConnection = {
    ...conn,
    id: `conn_${Date.now()}`,
    name: `${conn.name} (Copy)`,
    createdAt: new Date(),
    lastTested: null,
  };

  try {
    await ipcRenderer.invoke("add-connection", newConnection);
    alert("✅ Connection duplicated!");
    loadConnections();
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
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

document
  .getElementById("add-connection-btn")
  .addEventListener("click", async () => {
    currentEditConnection = null;
    document.getElementById("connection-modal-title").textContent =
      "Add Connection";
    document.getElementById("connection-form").reset();
    document.getElementById("conn-trust-cert").checked = true;
    document.getElementById("conn-group-self").checked = true;
    document.getElementById("conn-partner-group").style.display = "none";

    // Load settings to populate dropdowns
    await loadSettings();

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

    const group = document.querySelector(
      'input[name="conn-group"]:checked'
    ).value;

    const connection = {
      id: currentEditConnection || `conn_${Date.now()}`,
      name: document.getElementById("conn-name").value,
      server: server,
      port: port,
      database: document.getElementById("conn-database").value,
      user: document.getElementById("conn-user").value || undefined,
      password: document.getElementById("conn-password").value || undefined,
      financialYear: document.getElementById("conn-financial-year").value,
      group: group,
      partner:
        group === "partner"
          ? document.getElementById("conn-partner").value
          : "",
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
  filteredJobs = [...jobs];
  jobsPage = 1;

  document.getElementById("jobs-count").textContent = jobs.length;

  const jobsList = document.getElementById("jobs-list");
  const jobsEmpty = document.getElementById("jobs-empty");
  const jobsNoConnections = document.getElementById("jobs-no-connections");

  if (connections.length === 0) {
    jobsList.style.display = "none";
    document.getElementById("jobs-pagination").style.display = "none";
    jobsEmpty.style.display = "none";
    jobsNoConnections.style.display = "block";
    return;
  }

  jobsNoConnections.style.display = "none";

  if (jobs.length === 0) {
    jobsList.style.display = "none";
    document.getElementById("jobs-pagination").style.display = "none";
    jobsEmpty.style.display = "block";
    return;
  }

  jobsEmpty.style.display = "none";
  jobsList.style.display = "block";
  document.getElementById("jobs-pagination").style.display = "flex";
  renderJobsPage();
}

function filterJobs(searchTerm) {
  const term = searchTerm.toLowerCase();
  filteredJobs = jobs.filter((job) => {
    const conn = connections.find((c) => c.id === job.connectionId);
    const connName = conn ? conn.name : "";
    return (
      job.name.toLowerCase().includes(term) ||
      connName.toLowerCase().includes(term) ||
      job.schedule.toLowerCase().includes(term)
    );
  });
  jobsPage = 1;
  renderJobsPage();
}

function renderJobsPage() {
  const tbody = document.getElementById("jobs-tbody");
  const startIndex = (jobsPage - 1) * jobsPerPage;
  const endIndex = startIndex + jobsPerPage;
  const pageJobs = filteredJobs.slice(startIndex, endIndex);

  tbody.innerHTML = pageJobs
    .map((job) => {
      // Handle both old format (connectionId) and new format (connectionIds)
      const connectionIds = job.connectionIds || [job.connectionId];
      const connectionNames = connectionIds
        .map((id) => {
          const conn = connections.find((c) => c.id === id);
          return conn ? conn.name : "Unknown";
        })
        .join(", ");

      return `
      <tr>
        <td>
          <div class="table-cell-content">
            <div class="table-title">${escapeHtml(job.name)}</div>
          </div>
        </td>
        <td>
          <div class="table-cell-content">
            <div class="table-text">${escapeHtml(connectionNames)}</div>
          </div>
        </td>
        <td>
          <div class="table-cell-content">
            <div class="table-text">${escapeHtml(job.schedule)}</div>
          </div>
        </td>
        <td>
          <div class="table-cell-content">
            <span class="table-status ${job.enabled ? "success" : "danger"}">
              ${job.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </td>
        <td>
          <div class="table-cell-content">
            <div class="table-text">${job.destinations.length} destination${
        job.destinations.length !== 1 ? "s" : ""
      }</div>
          </div>
        </td>
        <td>
          <div class="table-actions">
            <button class="action-btn" onclick="toggleActionDropdown('job-${
              job.id
            }', event)">
              <img src="../icon/pencil.svg" alt="Actions">
            </button>
            <div id="dropdown-job-${job.id}" class="action-dropdown">
              <button class="action-dropdown-item" onclick="runJob('${
                job.id
              }')">
                <img src="../icon/mouse-pointer-2.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> Run
              </button>
              <button class="action-dropdown-item" onclick="testJob('${
                job.id
              }')">
                <img src="../icon/refresh-ccw.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> Test
              </button>
              <button class="action-dropdown-item" onclick="editJob('${
                job.id
              }')">
                <img src="../icon/pencil.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> Edit
              </button>
              <button class="action-dropdown-item" onclick="duplicateJob('${
                job.id
              }')">
                <img src="../icon/copy.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> Duplicate
              </button>
              <button class="action-dropdown-item ${
                job.enabled ? "warning" : "success"
              }" onclick="toggleJob('${job.id}', ${!job.enabled})">
                <img src="../icon/${
                  job.enabled ? "mouse-pointer-ban.svg" : "mouse-pointer-2.svg"
                }" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> ${
        job.enabled ? "Disable" : "Enable"
      }
              </button>
              <button class="action-dropdown-item danger" onclick="deleteJob('${
                job.id
              }')">
                <img src="../icon/trash-2.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 8px;"> Delete
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");

  updateJobsPagination();
}

function updateJobsPagination() {
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);
  const prevBtn = document.getElementById("jobs-prev");
  const nextBtn = document.getElementById("jobs-next");
  const info = document.getElementById("jobs-info");

  prevBtn.disabled = jobsPage <= 1;
  nextBtn.disabled = jobsPage >= totalPages;
  info.textContent = `Page ${jobsPage} of ${totalPages || 1}`;
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

  // Populate checkboxes with job's connections
  selectedConnections = (job.connectionIds || [job.connectionId]).filter(
    (id) => id
  ); // Support both old and new format, filter out undefined
  populateConnectionCheckboxes();

  document.getElementById("job-query").value = job.query;
  document.getElementById("job-schedule").value = job.schedule;
  document.getElementById("job-trigger").value = job.trigger;

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

async function duplicateJob(jobId) {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return;

  const newJob = {
    ...job,
    id: `job_${Date.now()}`,
    name: `${job.name} (Copy)`,
    enabled: false,
    lastRun: null,
  };

  try {
    await ipcRenderer.invoke("add-job", newJob);
    alert("✅ Job duplicated! (Disabled by default)");
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

  // Initialize checkboxes connections
  selectedConnections = [];
  populateConnectionCheckboxes();

  // Clear destinations
  document.getElementById("destinations-container").innerHTML = "";

  // Reset schedule
  document.getElementById("job-schedule").value = "*/2 * * * *";

  openModal("job-modal");
});

// Select All Connections checkbox
document
  .getElementById("select-all-connections")
  ?.addEventListener("change", (e) => {
    const checkboxes = document.querySelectorAll(".connection-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = e.target.checked;
      const connId = cb.value;
      if (e.target.checked) {
        if (!selectedConnections.includes(connId)) {
          selectedConnections.push(connId);
        }
      } else {
        selectedConnections = selectedConnections.filter((id) => id !== connId);
      }
    });
    updateConnectionCount();
  });

// Show/hide partner filter based on group selection
document.getElementById("job-group-filter")?.addEventListener("change", (e) => {
  const partnerGroup = document.getElementById("job-partner-filter-group");
  if (e.target.value === "partner") {
    partnerGroup.style.display = "block";
  } else {
    partnerGroup.style.display = "none";
  }
});

// Apply Connection Filter
document
  .getElementById("apply-connection-filter-btn")
  ?.addEventListener("click", () => {
    const financialYear = document.getElementById("job-financial-year").value;
    const group = document.getElementById("job-group-filter").value;
    const partner = document.getElementById("job-partner").value;

    let filtered = [...connections];

    if (financialYear) {
      filtered = filtered.filter(
        (conn) => conn.financialYear === financialYear
      );
    }

    if (group) {
      filtered = filtered.filter((conn) => conn.group === group);
    }

    if (group === "partner" && partner) {
      filtered = filtered.filter((conn) => conn.partner === partner);
    }

    populateConnectionCheckboxes(filtered);
  });

// Clear Connection Filter
document
  .getElementById("clear-connection-filter-btn")
  ?.addEventListener("click", () => {
    document.getElementById("job-financial-year").value = "";
    document.getElementById("job-group-filter").value = "";
    document.getElementById("job-partner").value = "";
    document.getElementById("job-partner-filter-group").style.display = "none";

    populateConnectionCheckboxes();
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
        <label>Google Service Account Credentials (JSON) *</label>
        <textarea class="dest-credentials-json" rows="6" required placeholder='Paste your complete service account JSON here...'>${
          existingConfig?.credentialsJson || ""
        }</textarea>
        <small>From URL: docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit</small>
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

      // Get credentials JSON from textarea
      const credentialsJson = item.querySelector(
        ".dest-credentials-json"
      ).value;
      if (!credentialsJson) {
        alert("Please paste your Google Service Account credentials JSON");
        return;
      }

      try {
        // Validate JSON
        const credentials = JSON.parse(credentialsJson);
        dest.credentialsJson = credentialsJson;
      } catch (e) {
        alert(
          "Invalid JSON in Google credentials. Please check and paste complete JSON."
        );
        return;
      }
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

  if (selectedConnections.length === 0) {
    alert("⚠️ Please select at least one connection!");
    return;
  }

  const job = {
    id: currentEditJob || `job_${Date.now()}`,
    name: document.getElementById("job-name").value,
    enabled: true,
    connectionIds: selectedConnections, // Changed from connectionId to connectionIds
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

// ===== SETTINGS PAGE =====
let settings = {
  financialYears: [],
  partners: [],
};

async function loadSettings() {
  try {
    settings = await ipcRenderer.invoke("get-settings");
    if (!settings.financialYears) settings.financialYears = [];
    if (!settings.partners) settings.partners = [];

    renderFinancialYears();
    renderPartners();
    populateFinancialYearDropdowns();
    populatePartnerDropdowns();
  } catch (error) {
    console.error("Error loading settings:", error);
  }
}

function renderFinancialYears() {
  const container = document.getElementById("financial-years-list");
  if (!container) {
    console.warn("Financial years list container not found");
    return;
  }

  if (!settings.financialYears || settings.financialYears.length === 0) {
    container.innerHTML =
      '<p style="color: var(--gray-500); font-size: 13px;">No financial years added yet</p>';
    return;
  }

  container.innerHTML = settings.financialYears
    .map(
      (year, index) => `
    <div class="settings-list-item">
      <span class="settings-list-item-text">${escapeHtml(year)}</span>
      <div class="settings-list-item-actions">
        <button class="btn-secondary" style="background: var(--primary); color: white;" onclick="editFinancialYear(${index})">Edit</button>
        <button class="btn-danger" onclick="deleteFinancialYear(${index})">Delete</button>
      </div>
    </div>
  `
    )
    .join("");
}

function renderPartners() {
  const container = document.getElementById("partners-list");
  if (!container) {
    console.warn("Partners list container not found");
    return;
  }

  if (!settings.partners || settings.partners.length === 0) {
    container.innerHTML =
      '<p style="color: var(--gray-500); font-size: 13px;">No partners added yet</p>';
    return;
  }

  container.innerHTML = settings.partners
    .map(
      (partner, index) => `
    <div class="settings-list-item">
      <span class="settings-list-item-text">${escapeHtml(partner)}</span>
      <div class="settings-list-item-actions">
        <button class="btn-secondary" style="background: var(--primary); color: white;" onclick="editPartner(${index})">Edit</button>
        <button class="btn-danger" onclick="deletePartner(${index})">Delete</button>
      </div>
    </div>
  `
    )
    .join("");
}

function populateFinancialYearDropdowns() {
  const connSelect = document.getElementById("conn-financial-year");
  const jobSelect = document.getElementById("job-financial-year");

  if (connSelect) {
    const currentValue = connSelect.value;
    connSelect.innerHTML =
      '<option value="">Select Financial Year</option>' +
      settings.financialYears
        .map(
          (year) =>
            `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`
        )
        .join("");
    if (currentValue) connSelect.value = currentValue;
  }

  if (jobSelect) {
    const currentValue = jobSelect.value;
    jobSelect.innerHTML =
      '<option value="">All Financial Years</option>' +
      settings.financialYears
        .map(
          (year) =>
            `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`
        )
        .join("");
    if (currentValue) jobSelect.value = currentValue;
  }
}

function populatePartnerDropdowns() {
  const connSelect = document.getElementById("conn-partner");
  const jobSelect = document.getElementById("job-partner");

  if (connSelect) {
    const currentValue = connSelect.value;
    connSelect.innerHTML =
      '<option value="">Select Partner</option>' +
      settings.partners
        .map(
          (partner) =>
            `<option value="${escapeHtml(partner)}">${escapeHtml(
              partner
            )}</option>`
        )
        .join("");
    if (currentValue) connSelect.value = currentValue;
  }

  if (jobSelect) {
    const currentValue = jobSelect.value;
    jobSelect.innerHTML =
      '<option value="">All Partners</option>' +
      settings.partners
        .map(
          (partner) =>
            `<option value="${escapeHtml(partner)}">${escapeHtml(
              partner
            )}</option>`
        )
        .join("");
    if (currentValue) jobSelect.value = currentValue;
  }
}

// Financial Year Modal
let currentEditFinancialYearIndex = null;

document
  .getElementById("add-financial-year-btn")
  .addEventListener("click", () => {
    currentEditFinancialYearIndex = null;
    document
      .getElementById("financial-year-modal")
      .querySelector("h3").textContent = "Add Financial Year";
    document.getElementById("financial-year-form").reset();
    openModal("financial-year-modal");
  });

function editFinancialYear(index) {
  currentEditFinancialYearIndex = index;
  document
    .getElementById("financial-year-modal")
    .querySelector("h3").textContent = "Edit Financial Year";
  document.getElementById("financial-year-name").value =
    settings.financialYears[index];
  openModal("financial-year-modal");
}

document
  .getElementById("financial-year-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const yearName = document
      .getElementById("financial-year-name")
      .value.trim();

    if (!yearName) {
      alert("Please enter a financial year!");
      return;
    }

    if (currentEditFinancialYearIndex !== null) {
      // Edit mode
      const oldYear = settings.financialYears[currentEditFinancialYearIndex];
      if (yearName !== oldYear && settings.financialYears.includes(yearName)) {
        alert("This financial year already exists!");
        return;
      }
      settings.financialYears[currentEditFinancialYearIndex] = yearName;
      await ipcRenderer.invoke("update-settings", settings);

      renderFinancialYears();
      populateFinancialYearDropdowns();
      closeModal("financial-year-modal");
      alert("✅ Financial year updated!");
    } else {
      // Add mode
      if (settings.financialYears.includes(yearName)) {
        alert("This financial year already exists!");
        return;
      }

      settings.financialYears.push(yearName);
      await ipcRenderer.invoke("update-settings", settings);

      renderFinancialYears();
      populateFinancialYearDropdowns();
      closeModal("financial-year-modal");
      alert("✅ Financial year added!");
    }
  });

async function deleteFinancialYear(index) {
  const yearToDelete = settings.financialYears[index];

  // Check if any connection is using this financial year
  const connectionsUsingYear = connections.filter(
    (conn) => conn.financialYear === yearToDelete
  );

  if (connectionsUsingYear.length > 0) {
    alert(
      `❌ Cannot delete! This financial year is being used by ${
        connectionsUsingYear.length
      } connection(s):\n\n${connectionsUsingYear
        .map((c) => `• ${c.name}`)
        .join("\n")}\n\nPlease remove or change these connections first.`
    );
    return;
  }

  if (!confirm(`Delete financial year "${yearToDelete}"?`)) return;

  settings.financialYears.splice(index, 1);
  await ipcRenderer.invoke("update-settings", settings);

  renderFinancialYears();
  populateFinancialYearDropdowns();
  alert("✅ Financial year deleted!");
}

// Partner Modal
let currentEditPartnerIndex = null;

document.getElementById("add-partner-btn").addEventListener("click", () => {
  currentEditPartnerIndex = null;
  document.getElementById("partner-modal").querySelector("h3").textContent =
    "Add Partner";
  document.getElementById("partner-form").reset();
  openModal("partner-modal");
});

function editPartner(index) {
  currentEditPartnerIndex = index;
  document.getElementById("partner-modal").querySelector("h3").textContent =
    "Edit Partner";
  document.getElementById("partner-name").value = settings.partners[index];
  openModal("partner-modal");
}

document
  .getElementById("partner-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const partnerName = document.getElementById("partner-name").value.trim();

    if (!partnerName) {
      alert("Please enter a partner name!");
      return;
    }

    if (currentEditPartnerIndex !== null) {
      // Edit mode
      const oldPartner = settings.partners[currentEditPartnerIndex];
      if (
        partnerName !== oldPartner &&
        settings.partners.includes(partnerName)
      ) {
        alert("This partner already exists!");
        return;
      }
      settings.partners[currentEditPartnerIndex] = partnerName;
      await ipcRenderer.invoke("update-settings", settings);

      renderPartners();
      populatePartnerDropdowns();
      closeModal("partner-modal");
      alert("✅ Partner updated!");
    } else {
      // Add mode
      if (settings.partners.includes(partnerName)) {
        alert("This partner already exists!");
        return;
      }

      settings.partners.push(partnerName);
      await ipcRenderer.invoke("update-settings", settings);

      renderPartners();
      populatePartnerDropdowns();
      closeModal("partner-modal");
      alert("✅ Partner added!");
    }
  });

async function deletePartner(index) {
  const partnerToDelete = settings.partners[index];

  // Check if any connection is using this partner
  const connectionsUsingPartner = connections.filter(
    (conn) => conn.group === "partner" && conn.partner === partnerToDelete
  );

  if (connectionsUsingPartner.length > 0) {
    alert(
      `❌ Cannot delete! This partner is being used by ${
        connectionsUsingPartner.length
      } connection(s):\n\n${connectionsUsingPartner
        .map((c) => `• ${c.name}`)
        .join("\n")}\n\nPlease remove or change these connections first.`
    );
    return;
  }

  if (!confirm(`Delete partner "${partnerToDelete}"?`)) return;

  settings.partners.splice(index, 1);
  await ipcRenderer.invoke("update-settings", settings);

  renderPartners();
  populatePartnerDropdowns();
  alert("✅ Partner deleted!");
}

// Group radio buttons - show/hide partner dropdown
document.getElementById("conn-group-self").addEventListener("change", () => {
  document.getElementById("conn-partner-group").style.display = "none";
  document.getElementById("conn-partner").removeAttribute("required");
});

document.getElementById("conn-group-partner").addEventListener("change", () => {
  document.getElementById("conn-partner-group").style.display = "block";
  document.getElementById("conn-partner").setAttribute("required", "required");
});

// ===== BULK UPLOAD =====
document.getElementById("bulk-upload-btn").addEventListener("click", () => {
  document.getElementById("bulk-upload-form").reset();
  document.getElementById("bulk-upload-preview").innerHTML = "";
  openModal("bulk-upload-modal");
});

// Download Template Button
document
  .getElementById("download-template-btn")
  .addEventListener("click", () => {
    const csvContent = `name,server,database,user,password,port,financialYear,group,partner
Production Server,prod.example.com,ProductionDB,sa,SecurePass123,1433,2024-2025,self,
Test Server,test.example.com,TestDB,sa,TestPass456,1433,2024-2025,self,
Partner Server 1,partner1.com,PartnerDB1,sa,PartnerPass1,1433,2024-2025,partner,Partner A
Partner Server 2,partner2.com,PartnerDB2,sa,PartnerPass2,1433,2024-2025,partner,Partner B`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", "connection_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert("✅ Template downloaded successfully!");
  });

let bulkUploadData = [];

document
  .getElementById("bulk-upload-file")
  .addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const rows = text
        .split("\n")
        .map((row) => row.trim())
        .filter((row) => row);

      if (rows.length < 2) {
        alert("File must have at least a header row and one data row");
        return;
      }

      const headers = rows[0].split(",").map((h) => h.trim());
      bulkUploadData = [];

      for (let i = 1; i < rows.length; i++) {
        const values = rows[i].split(",").map((v) => v.trim());
        const conn = {};

        headers.forEach((header, index) => {
          conn[header] = values[index] || "";
        });

        bulkUploadData.push(conn);
      }

      // Show preview
      const preview = document.getElementById("bulk-upload-preview");
      preview.innerHTML = `
      <p style="margin-bottom: 12px; font-weight: 600;">Preview (${
        bulkUploadData.length
      } connections):</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr>
            ${headers
              .map(
                (h) =>
                  `<th style="padding: 6px; border: 1px solid var(--gray-200); background: var(--gray-100);">${escapeHtml(
                    h
                  )}</th>`
              )
              .join("")}
          </tr>
        </thead>
        <tbody>
          ${bulkUploadData
            .slice(0, 5)
            .map(
              (conn) => `
            <tr>
              ${headers
                .map(
                  (h) =>
                    `<td style="padding: 6px; border: 1px solid var(--gray-200);">${escapeHtml(
                      conn[h] || ""
                    )}</td>`
                )
                .join("")}
            </tr>
          `
            )
            .join("")}
          ${
            bulkUploadData.length > 5
              ? `<tr><td colspan="${
                  headers.length
                }" style="text-align: center; padding: 6px; font-style: italic; color: var(--gray-500);">... and ${
                  bulkUploadData.length - 5
                } more</td></tr>`
              : ""
          }
        </tbody>
      </table>
    `;
    } catch (error) {
      alert("Error reading file: " + error.message);
    }
  });

document
  .getElementById("bulk-upload-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    if (bulkUploadData.length === 0) {
      alert("No data to upload");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const connData of bulkUploadData) {
      try {
        const connection = {
          id: `conn_${Date.now()}_${Math.random()}`,
          name: connData.name || "Unnamed",
          server: connData.server || "localhost",
          database: connData.database || "",
          user: connData.user || undefined,
          password: connData.password || undefined,
          port: parseInt(connData.port) || 1433,
          financialYear: connData.financialYear || "",
          group: connData.group || "self",
          partner: connData.partner || "",
          options: {
            trustServerCertificate: true,
          },
          createdAt: new Date(),
        };

        await ipcRenderer.invoke("add-connection", connection);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error("Error adding connection:", error);
      }
    }

    closeModal("bulk-upload-modal");
    loadConnections();
    alert(
      `✅ Bulk upload complete!\n${successCount} connections added, ${errorCount} failed.`
    );
  });

// ===== TEST ALL CONNECTIONS =====
document
  .getElementById("test-all-connections-btn")
  .addEventListener("click", async () => {
    if (connections.length === 0) {
      alert("No connections to test");
      return;
    }

    if (!confirm(`Test all ${connections.length} connections?`)) return;

    const btn = document.getElementById("test-all-connections-btn");
    btn.disabled = true;
    btn.textContent = "Testing...";

    let online = 0;
    let offline = 0;
    const results = [];

    for (const conn of connections) {
      try {
        const result = await ipcRenderer.invoke("test-connection", conn.id);
        if (result.success) {
          online++;
          results.push(`✅ ${conn.name}: Online`);
          await ipcRenderer.invoke("update-connection", conn.id, {
            lastTested: new Date(),
          });
        } else {
          offline++;
          results.push(`❌ ${conn.name}: ${result.message}`);
        }
      } catch (error) {
        offline++;
        results.push(`❌ ${conn.name}: ${error.message}`);
      }
    }

    btn.disabled = false;
    btn.innerHTML = `<img src="../icon/refresh-ccw.svg" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px;"/> Test All`;

    loadConnections();
    alert(
      `Test Results:\n\n${online} Online\n${offline} Offline\n\n` +
        results.join("\n")
    );
  });

// ===== INITIAL LOAD =====
loadConnections();
loadSettings();

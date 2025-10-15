# 🔄 SQL Bridge - Local Database Sync App

**SQL Bridge** ek powerful desktop application hai jo aapke local SQL Server se data fetch karke **kahin bhi** bhej sakta hai — Google Sheets, Webhooks, Custom APIs, ya kisi bhi destination par!

---

## ✨ Features

- ✅ **Multiple SQL Server Connections** — ek ya zyada servers ko save karke manage karo
- ✅ **Connection Management** — pehle connection setup, phir jobs banao
- ✅ **Saved Connections** — har job mein saved connections ka dropdown (bar-bar details nahi bharni padegi)
- ✅ **Multiple jobs** configure kare — har job apna query, schedule, aur destinations
- ✅ **Flexible scheduling** — cron expressions ya preset intervals (1min, 2min, 5min, etc.)
- ✅ **Smart triggers** — har baar bhejo ya sirf jab data change ho (`onChange`)
- ✅ **Multiple destinations**:
  - 📊 **Google Sheets** (append, replace, update modes)
  - 🌐 **Webhooks** (POST/PUT/PATCH with custom headers)
  - 🔌 **Custom APIs** (MongoDB, REST APIs, etc.)
  - 📊 **Excel Files** (local .xlsx/.xls export with append/replace)
  - 📄 **CSV Files** (universal format export with custom delimiter)
- ✅ **Modern Clean UI** — sidebar navigation, connection-first workflow
- ✅ **Cross-platform** — Windows, Mac, Linux
- ✅ **Extensible** — naye adapters easily add kar sakte ho

---

## 📦 Installation

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build the App

```bash
npm run build
```

### Step 3: Start the App

```bash
npm start
```

---

## 🚀 Quick Start

### 1. SQL Server Setup

Ensure your SQL Server is running and accessible. Note down:

- Server name (e.g., `localhost` or `.\SQLEXPRESS`)
- Database name
- Username & password (or use Windows Authentication)

### 2. Create Your First Job

1. Launch the app
2. Click **"Add Job"** tab
3. Fill in:
   - **Job Name**: e.g., "Sales Data Sync"
   - **Job ID**: e.g., "sales-sync"
   - **Connection**: server, database, credentials
   - **Query**: your SQL query (e.g., `SELECT * FROM Sales`)
   - **Schedule**: `*/2 * * * *` (every 2 minutes)
   - **Trigger**: `onChange` (only when data changes)
4. Add a **Destination** (webhook, Google Sheets, etc.)
5. Click **"Save Job"**

### 3. Test & Run

- Click **"Test Query"** to verify your SQL connection and query
- Click **"Run Now"** to execute immediately
- Enable the job to run on schedule

---

## 📊 Google Sheets Setup

**📖 Complete Step-by-Step Guide:** [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md)

### Quick Summary:

1. **Create Google Cloud Project** → Enable Google Sheets API
2. **Create Service Account** → Download JSON key
3. **Create Google Sheet** → Share with service account email
4. **In SQL Bridge:**
   - Add Google Sheets destination
   - Paste complete JSON credentials
   - Enter Spreadsheet ID and Sheet name
   - Select sync mode (Append/Replace/Update)
5. **Run & Verify** → Data syncs automatically!

**Need detailed instructions?** See full guide: [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md)

### Step 2: Configure Credentials

1. Rename downloaded file to `google-credentials.json`
2. Place it in `config/` folder:
   ```
   RMDB/
   └── config/
       └── google-credentials.json
   ```

### Step 3: Share Your Sheet

1. Open your Google Sheet
2. Click **Share**
3. Add the service account email (found in credentials JSON: `client_email`)
4. Give **Editor** permission

### Step 4: Get Spreadsheet ID

From your sheet URL:

```
https://docs.google.com/spreadsheets/d/1ABC123xyz.../edit
                                      ↑
                              This is your Spreadsheet ID
```

---

## 🔧 Configuration

### Job Configuration (`config/jobs.json`)

```json
{
  "jobs": [
    {
      "id": "sales-sync",
      "name": "Sales Data to Sheets",
      "enabled": true,
      "connection": {
        "server": "localhost",
        "database": "MyDB",
        "user": "sa",
        "password": "yourpassword",
        "options": {
          "trustServerCertificate": true
        }
      },
      "query": "SELECT * FROM Sales WHERE CreatedAt > DATEADD(day, -1, GETDATE())",
      "schedule": "*/5 * * * *",
      "trigger": "onChange",
      "destinations": [
        {
          "type": "google_sheets",
          "spreadsheetId": "YOUR_SPREADSHEET_ID",
          "sheetName": "Sheet1",
          "mode": "append",
          "credentialsPath": "./config/google-credentials.json"
        }
      ]
    }
  ]
}
```

### Schedule Format

**Cron expressions:**

```
*/2 * * * *   → Every 2 minutes
*/5 * * * *   → Every 5 minutes
0 * * * *     → Every hour
0 0 * * *     → Every day at midnight
```

**Simple format:**

```
2m   → Every 2 minutes
5m   → Every 5 minutes
10m  → Every 10 minutes
```

### Trigger Options

- `always` — har run pe data bhejo (chahe data change ho ya na ho)
- `onChange` — sirf jab data change ho tab bhejo

### Destination Types

#### 1. Webhook

```json
{
  "type": "webhook",
  "url": "https://your-api.com/endpoint",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN"
  },
  "batchSize": 100
}
```

#### 2. Google Sheets

```json
{
  "type": "google_sheets",
  "spreadsheetId": "1ABC...",
  "sheetName": "Sheet1",
  "mode": "append",
  "credentialsPath": "./config/google-credentials.json"
}
```

**Modes:**

- `append` — naye rows add karo (existing data rahega)
- `replace` — sheet clear karke naya data write karo
- `update` — key column se match karke update karo

#### 3. Custom API

```json
{
  "type": "custom_api",
  "url": "https://your-mongodb-api.com/data",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "API-Key": "your-api-key"
  },
  "batchSize": 50
}
```

#### 4. Excel File Export 📊

```json
{
  "type": "excel",
  "filePath": "C:/exports/data.xlsx",
  "sheetName": "Sheet1",
  "mode": "replace"
}
```

**Important:**

- ⚠️ File path must end with `.xlsx` or `.xls` extension
- ⚠️ Must be a full file path, NOT a folder path
- ✅ Correct: `C:/exports/report.xlsx`
- ❌ Wrong: `C:/exports/` (this is a folder)

**Modes:**

- `replace` — File ko overwrite karo (default)
- `append` — Existing file mein naye rows add karo

**Example Use Cases:**

- Daily reports generate karo
- Backup data as Excel files
- Share with non-technical users
- Import into other tools

#### 5. CSV File Export 📄

```json
{
  "type": "csv",
  "filePath": "C:/exports/data.csv",
  "delimiter": ",",
  "mode": "replace",
  "includeHeaders": true
}
```

**Important:**

- ⚠️ File path must end with `.csv` extension
- ⚠️ Must be a full file path, NOT a folder path
- ✅ Correct: `C:/exports/report.csv`
- ❌ Wrong: `C:/exports/` (this is a folder)

**Options:**

- `delimiter` — Field separator (default: comma `,`)
  - Use `;` for semicolon
  - Use `\t` for tab-separated
- `mode` — `replace` (overwrite) or `append` (add rows)
- `includeHeaders` — First row mein column names (default: `true`)

**Example Use Cases:**

- Universal data export
- Import into Excel, Power BI, Tableau
- Share with any system
- Daily logs append karna

---

## 🛠️ Development

### Run in Dev Mode

```bash
npm run dev
```

### Watch TypeScript Changes

```bash
npm run watch
```

### Build Installer

```bash
npm run package
```

Output will be in `release/` folder.

---

## 🏗️ Architecture

```
sql-bridge-app/
├── src/
│   ├── main.ts              # Electron main process
│   ├── types/               # TypeScript interfaces
│   ├── core/
│   │   ├── scheduler.ts     # Job scheduling logic
│   │   ├── executor.ts      # Query execution
│   │   ├── trigger.ts       # Trigger detection (onChange)
│   │   └── logger.ts        # Logging
│   ├── connectors/
│   │   └── sql.ts           # SQL Server connector
│   ├── adapters/
│   │   ├── webhook.ts       # Webhook adapter
│   │   ├── google-sheets.ts # Google Sheets adapter
│   │   ├── custom-api.ts    # Custom API adapter
│   │   ├── excel.ts         # Excel file export adapter
│   │   ├── csv.ts           # CSV file export adapter
│   │   └── index.ts         # Adapter registry
│   └── renderer/            # UI files
│       ├── index.html
│       ├── app.js
│       └── style.css
├── config/
│   ├── jobs.json            # Job configurations
│   └── google-credentials.json  # Google service account
└── logs/
    └── app.log              # Application logs
```

---

## 🔌 Adding Custom Adapters

### Step 1: Create Adapter File

`src/adapters/my-custom-adapter.ts`:

```typescript
import { DestinationAdapter, Destination, JobMeta, SendResult } from "../types";
import { logger } from "../core/logger";

export class MyCustomAdapter implements DestinationAdapter {
  name = "my_custom";

  async send(
    data: any[],
    config: Destination,
    meta: JobMeta
  ): Promise<SendResult> {
    try {
      // Your logic here
      console.log(`Sending ${data.length} rows...`);

      // Example: send to your custom API
      // await yourCustomLogic(data, config);

      return {
        success: true,
        message: `Sent ${data.length} rows successfully`,
      };
    } catch (error: any) {
      logger.error("My custom adapter failed", meta.jobId, error);
      return {
        success: false,
        message: error.message,
        error,
      };
    }
  }
}
```

### Step 2: Register Adapter

`src/adapters/index.ts`:

```typescript
import { MyCustomAdapter } from "./my-custom-adapter";

// Add to registry
adapters.set("my_custom", new MyCustomAdapter());
```

### Step 3: Use in Job Config

```json
{
  "destinations": [
    {
      "type": "my_custom",
      "customField": "value"
    }
  ]
}
```

---

## 🐛 Troubleshooting

### SQL Connection Issues

- ✅ Check SQL Server is running
- ✅ Verify server name (use `localhost` or `.\SQLEXPRESS`)
- ✅ Enable TCP/IP in SQL Server Configuration Manager
- ✅ Check firewall settings
- ✅ Use `trustServerCertificate: true` for local dev

### Google Sheets Issues

- ✅ Service account email added to sheet with Editor permission
- ✅ Google Sheets API enabled in Cloud Console
- ✅ Correct Spreadsheet ID
- ✅ Valid credentials JSON file

### Logs

Check `logs/app.log` for detailed error messages:

```bash
tail -f logs/app.log
```

Or use the **Logs** tab in the app.

---

## 📝 Examples

### Example 1: Sales Data to Google Sheets (Every 2 Minutes)

```json
{
  "id": "sales-sheets",
  "name": "Sales to Sheets",
  "enabled": true,
  "connection": {
    "server": "localhost",
    "database": "SalesDB"
  },
  "query": "SELECT * FROM Sales WHERE Date = CAST(GETDATE() AS DATE)",
  "schedule": "*/2 * * * *",
  "trigger": "onChange",
  "destinations": [
    {
      "type": "google_sheets",
      "spreadsheetId": "1ABC...",
      "sheetName": "Daily Sales",
      "mode": "replace",
      "credentialsPath": "./config/google-credentials.json"
    }
  ]
}
```

### Example 2: Orders to MongoDB API

```json
{
  "id": "orders-mongo",
  "name": "Orders to MongoDB",
  "enabled": true,
  "connection": {
    "server": "localhost",
    "database": "OrdersDB"
  },
  "query": "SELECT * FROM Orders WHERE Status = 'Pending'",
  "schedule": "*/1 * * * *",
  "trigger": "always",
  "destinations": [
    {
      "type": "custom_api",
      "url": "https://your-api.com/mongodb/orders",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  ]
}
```

### Example 3: Multiple Destinations

```json
{
  "destinations": [
    {
      "type": "google_sheets",
      "spreadsheetId": "1ABC...",
      "sheetName": "Data",
      "mode": "append",
      "credentialsPath": "./config/google-credentials.json"
    },
    {
      "type": "webhook",
      "url": "https://hooks.slack.com/services/YOUR/WEBHOOK",
      "method": "POST"
    },
    {
      "type": "custom_api",
      "url": "https://your-mongodb-api.com/data",
      "method": "POST"
    }
  ]
}
```

---

## 📄 License

MIT

---

## 🤝 Contributing

Naye adapters ya features add karne ke liye:

1. Fork karo
2. Feature branch banao
3. Changes commit karo
4. Pull request bhejo

---

## 💡 Tips

- **Test First**: Har naye job ke liye pehle "Test Query" button use karo
- **Start Small**: Simple queries se shuru karo, phir complex queries add karo
- **Monitor Logs**: Logs tab regularly check karo for errors
- **Backup**: `config/jobs.json` ko regularly backup karo
- **Security**: Production mein credentials ko environment variables mein store karo

---

## 🎯 Roadmap

- [ ] Email notifications on job failures
- [ ] More adapters (MySQL, PostgreSQL, MongoDB direct)
- [ ] Data transformation rules
- [ ] Web dashboard (remote monitoring)
- [ ] Docker container support
- [ ] Cloud deployment options

---

**Happy Syncing! 🚀**

Agar koi problem ho ya question ho, to logs check karo ya issue open karo!
# db-bridge

# 📊 Google Sheets Integration Guide

Complete step-by-step guide to connect SQL Bridge with Google Sheets.

---

## 🎯 Overview

SQL Bridge can automatically sync your SQL Server data to Google Sheets in real-time. This guide will help you set up the connection in under 10 minutes.

---

## 📋 Prerequisites

- ✅ Google account
- ✅ SQL Bridge app installed
- ✅ Internet connection

---

## 🚀 Setup Steps

### **Step 1: Create Google Cloud Project**

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** (top bar)
3. Click **"New Project"**
4. Enter project name: `SQL Bridge` (or any name)
5. Click **"Create"**
6. Wait for project creation (~30 seconds)

---

### **Step 2: Enable Google Sheets API**

1. In Google Cloud Console, open **"APIs & Services"** → **"Library"**
2. Search for: `Google Sheets API`
3. Click on **"Google Sheets API"**
4. Click **"Enable"** button
5. Wait for API to enable (~10 seconds)

---

### **Step 3: Create Service Account**

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** (top bar)
3. Select **"Service Account"**

**Fill the form:**
- **Service account name:** `sql-bridge-sync`
- **Service account ID:** (auto-generated)
- **Description:** `SQL Bridge data synchronization`

4. Click **"Create and Continue"**
5. **Grant access:** Skip this step (click "Continue")
6. **Grant users access:** Skip this step (click "Done")

---

### **Step 4: Download JSON Key**

1. In **"Credentials"** page, scroll to **"Service Accounts"** section
2. Click on your service account email:
   - Example: `sql-bridge-sync@project-name.iam.gserviceaccount.com`
3. Go to **"KEYS"** tab (top)
4. Click **"ADD KEY"** → **"Create new key"**
5. Select key type: **JSON** ✅
6. Click **"Create"**
7. JSON file will download automatically
8. Save it securely (you'll need it in next steps)

**JSON file will look like this:**
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "sql-bridge-sync@your-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  ...
}
```

---

### **Step 5: Create Google Sheet**

1. Visit [Google Sheets](https://sheets.google.com/)
2. Click **"+"** (Blank spreadsheet)
3. Name your sheet: `SQL Bridge Data` (or any name)
4. Note the default sheet name: `Sheet1`

---

### **Step 6: Share Sheet with Service Account**

⚠️ **IMPORTANT STEP - Don't skip!**

1. In your Google Sheet, click **"Share"** button (top-right)
2. In "Add people and groups" field, paste the **service account email**:
   - Find this email in your downloaded JSON file
   - Look for: `"client_email": "sql-bridge-sync@..."`
   - Example: `sql-bridge-sync@test-475201.iam.gserviceaccount.com`
3. Set role: **Editor** ✅
4. **Uncheck** "Notify people" (service accounts don't receive emails)
5. Click **"Share"**

---

### **Step 7: Get Spreadsheet ID**

1. Look at your Google Sheet URL:
```
https://docs.google.com/spreadsheets/d/1ABC...XYZ/edit
                                          ^^^^^^^^
                                     This is your Spreadsheet ID
```

2. Copy the ID between `/d/` and `/edit`
3. Example: `1ABCxyz123_DEFuvw456`

---

### **Step 8: Configure in SQL Bridge**

#### **8.1 Open SQL Bridge App**
- Run `SQL Bridge.exe`

#### **8.2 Create or Select Connection**
- If already have connection, skip to next step
- Otherwise, create new SQL Server connection

#### **8.3 Create New Job**
1. Go to **"Jobs"** page
2. Click **"Add Job"**

**Fill Job Details:**
- **Job Name:** `Sync to Google Sheets`
- **Connection:** Select your SQL connection
- **Query:** Enter your SQL query
  ```sql
  SELECT TOP 100 * FROM YourTable
  ```
- **Schedule:** 
  - `Manual` (for testing)
  - Or `Every 5 minutes` (for auto-sync)
- **Trigger:** `Always (every run)`

#### **8.4 Add Google Sheets Destination**

1. Click **"+ Add Destination"**
2. **Type:** Select `Google Sheets`

**Fill Destination Config:**

- **Spreadsheet ID:** 
  - Paste the ID from Step 7
  - Example: `1ABCxyz123_DEFuvw456`

- **Sheet Name:** 
  - Enter: `Sheet1`
  - (or your custom sheet name)

- **Mode:** Select based on need:
  - `Append (add new rows)` - Adds data at bottom
  - `Replace (clear and write)` - Replaces all data
  - `Update (by key column)` - Updates matching rows

- **Key Column (for update mode only):**
  - Enter column name: `id` or `student_id`
  - Used to match and update existing rows

- **Google Service Account Credentials (JSON):**
  1. Open downloaded JSON file in Notepad
  2. **Select All** (Ctrl + A)
  3. **Copy** (Ctrl + C)
  4. **Paste** in the large textarea (Ctrl + V)
  5. Entire JSON should be visible

3. Click **"Create Job"**

---

### **Step 9: Test the Connection**

#### **Test Query First:**
1. In your job card, click **"Test"** button
2. Check logs for:
   ```
   ✅ Query returned X rows
   ```

#### **Run Full Sync:**
1. Click **"Run"** button on job card
2. Wait for execution (5-10 seconds)
3. Check logs for success:
   ```
   ✅ [INFO] Google Sheets adapter sent 100 rows successfully
   ✅ [INFO] Job completed successfully
   ```

#### **Verify in Google Sheets:**
1. Go to your Google Sheet
2. Refresh page (F5)
3. Data should appear! 🎉

---

## 🎨 Different Sync Modes Explained

### **Append Mode (Recommended for logs/events)**
- Adds new rows at the bottom
- Previous data stays intact
- Good for: Transaction logs, event tracking

### **Replace Mode (Clean slate)**
- Clears entire sheet first
- Then writes new data
- Good for: Dashboard data, current status

### **Update Mode (Smart sync)**
- Updates matching rows (by key column)
- Adds new rows if not found
- Good for: Master data, inventory, user lists

---

## 🔄 Scheduling Options

### **Manual Mode**
- Run only when you click "Run" button
- Good for: Testing, on-demand reports

### **Auto Schedule**
- `Every 1 minute` - Real-time sync
- `Every 5 minutes` - Frequent updates
- `Every 30 minutes` - Regular updates
- `Every hour` - Periodic sync

### **Trigger Options**
- `Always` - Runs every time
- `On Change` - Only if data changed (saves API quota)

---

## ❌ Common Issues & Solutions

### **Error: "Invalid credentials"**
**Cause:** JSON not properly pasted or corrupted

**Solution:**
1. Open JSON file in Notepad
2. Copy entire content (Ctrl+A, Ctrl+C)
3. Paste again in SQL Bridge
4. Ensure no extra spaces or characters

---

### **Error: "Spreadsheet not found"**
**Cause:** Sheet not shared with service account

**Solution:**
1. Open Google Sheet
2. Click "Share"
3. Add service account email (from JSON's `client_email`)
4. Give "Editor" access

---

### **Error: "Sheet not found"**
**Cause:** Wrong sheet name (case-sensitive!)

**Solution:**
1. Check exact sheet name in Google Sheets
2. Default is `Sheet1` (capital S)
3. Update in SQL Bridge destination config

---

### **Error: "Access denied" or "Permission denied"**
**Cause:** Service account doesn't have Editor access

**Solution:**
1. In Google Sheet → "Share"
2. Find service account email
3. Change access level to "Editor"
4. Save and try again

---

### **No data appearing but no errors**
**Cause:** Sheet needs refresh or wrong sheet name

**Solution:**
1. Refresh Google Sheet (F5)
2. Check if sheet name matches exactly
3. Verify query returns data (use "Test" button)

---

## 📊 Example Use Cases

### **Use Case 1: Daily Sales Report**
```sql
-- Query
SELECT 
    CAST(sale_date AS DATE) as Date,
    product_name as Product,
    SUM(quantity) as Units_Sold,
    SUM(total_amount) as Revenue
FROM sales
WHERE sale_date >= DATEADD(day, -30, GETDATE())
GROUP BY CAST(sale_date AS DATE), product_name
ORDER BY sale_date DESC
```
- **Mode:** Replace
- **Schedule:** Every day at 9 AM
- **Sheet:** `Daily Sales`

---

### **Use Case 2: Live Inventory Tracking**
```sql
-- Query
SELECT 
    product_id as ID,
    product_name as Product,
    current_stock as Stock,
    reorder_level as Reorder_At,
    CASE 
        WHEN current_stock < reorder_level THEN 'Low Stock'
        ELSE 'OK'
    END as Status
FROM inventory
ORDER BY current_stock ASC
```
- **Mode:** Replace
- **Schedule:** Every 5 minutes
- **Sheet:** `Inventory Status`

---

### **Use Case 3: Student Records Sync**
```sql
-- Query
SELECT 
    student_id as ID,
    first_name as First_Name,
    last_name as Last_Name,
    email as Email,
    department as Department,
    enrollment_date as Enrolled_On
FROM students
WHERE active = 1
ORDER BY last_name
```
- **Mode:** Update (by ID)
- **Key Column:** `ID`
- **Schedule:** Every 30 minutes
- **Sheet:** `Students`

---

## 🔐 Security Best Practices

### **✅ DO:**
- Keep JSON key file secure
- Use unique service account per application
- Grant only "Editor" access (not "Owner")
- Delete unused service accounts
- Rotate keys periodically (every 90 days)

### **❌ DON'T:**
- Share JSON key file publicly
- Commit JSON to Git repositories
- Use same service account for multiple apps
- Give "Owner" access to service accounts

---

## 📈 API Quota Information

**Google Sheets API Limits (Free Tier):**
- **Read requests:** 300 per minute per user
- **Write requests:** 300 per minute per user

**Tips to stay within limits:**
- Use "On Change" trigger (saves quota)
- Batch operations when possible
- Avoid syncing every minute for large datasets

---

## 🆘 Need Help?

**Check Logs:**
- SQL Bridge → "Logs" page
- Look for error messages
- Recent logs appear at top

**Common Log Messages:**

✅ **Success:**
```
[INFO] Google Sheets adapter sent 100 rows successfully
[INFO] Job completed successfully
```

❌ **Errors:**
```
[ERROR] Invalid credentials
[ERROR] Spreadsheet not found
[ERROR] Permission denied
```

---

## 📞 Support

If you encounter issues:
1. Check logs in SQL Bridge
2. Verify all steps in this guide
3. Ensure Google Sheet is shared with service account
4. Test with small dataset first (10-20 rows)

---

## ✅ Quick Checklist

Before running your first sync, verify:

- [ ] Google Sheets API is enabled
- [ ] Service account created
- [ ] JSON key downloaded
- [ ] Google Sheet created
- [ ] Sheet shared with service account email (Editor access)
- [ ] Spreadsheet ID copied correctly
- [ ] Sheet name is correct (case-sensitive)
- [ ] JSON credentials pasted in SQL Bridge
- [ ] Query tested successfully
- [ ] First manual run successful

---

## 🎉 Success!

If everything works, you should see:
1. ✅ Green success message in logs
2. ✅ Data appearing in Google Sheet
3. ✅ Auto-sync working on schedule

**Enjoy automated data syncing!** 🚀

---

*Last Updated: October 15, 2025*
*SQL Bridge - Data Sync Automation*

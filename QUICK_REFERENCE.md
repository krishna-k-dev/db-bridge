# Quick Reference - All New Features

## 🚀 How to Start

```bash
# Stop the app if running
# Then restart
npm start
```

## ✅ All Features Working

### 1️⃣ Settings Page

**Path**: Click "Settings" in sidebar

**Add Financial Year**:

- Click "Add Year"
- Enter year (e.g., "2024-2025")
- Click Add
- ✅ Modal closes automatically

**Edit Financial Year**:

- Click "Edit" button next to year
- Change the name
- Click Save
- ✅ Updates everywhere

**Same for Partners!**

---

### 2️⃣ Bulk Upload Template

**Path**: Connections → Bulk Upload

**Steps**:

1. Click "Bulk Upload"
2. Click "Download Template"
3. File downloads: `connection_template.csv`
4. Fill in your data
5. Upload file
6. ✅ All connections added!

---

### 3️⃣ Duplicate Connection

**Path**: Connections → Actions → Duplicate

**Result**:

- Creates "[Name] (Copy)"
- New unique ID
- Ready to edit
- ✅ Super fast!

---

### 4️⃣ Duplicate Job

**Path**: Jobs → Actions → Duplicate

**Result**:

- Creates "[Name] (Copy)"
- **Disabled by default** (safety)
- New unique ID
- ✅ Enable when ready!

---

### 5️⃣ Connection Form

**New Fields**:

- Financial Year (dropdown) - Required
- Group (Self/Partner) - Self is default
- Partner (dropdown) - Shows when Partner selected

**Auto-Features**:

- ✅ Dropdowns populate automatically
- ✅ Partner field shows/hides based on group
- ✅ Validation works perfectly

---

## 🎯 Common Tasks

### Add Connection with All Fields

1. Click "Add Connection"
2. Fill: Name, Server, Database, User, Password
3. Select Financial Year
4. Choose Group (Self/Partner)
5. If Partner: Select Partner
6. Save

### Quick Bulk Import

1. Download template
2. Open in Excel
3. Fill rows (see template examples)
4. Save as CSV
5. Upload
6. Done!

### Copy & Modify

**Connection**: Actions → Duplicate → Edit → Save
**Job**: Actions → Duplicate → Edit → Enable → Save

---

## 📊 What Shows in Tables

### Connections Table

```
Connection Name
FY: 2024-2025 • Self
```

or

```
Connection Name
FY: 2024-2025 • Partner: Partner A
```

### Jobs Table

- Name
- Connection(s)
- Schedule
- Status (Enabled/Disabled)
- Destinations

---

## 🔧 Actions Available

### Connection Actions

1. Test
2. Edit
3. **Duplicate** ⭐ NEW
4. Delete

### Job Actions

1. Run
2. Test
3. Edit
4. **Duplicate** ⭐ NEW
5. Enable/Disable
6. Delete

---

## ✨ Pro Tips

1. **Use Duplicates** - Faster than creating from scratch
2. **Download Template** - Much faster than manual entry
3. **Edit Settings** - Update financial years/partners anytime
4. **Safety First** - Duplicated jobs are disabled automatically

---

## 🎉 You're All Set!

Everything is working and production-ready!

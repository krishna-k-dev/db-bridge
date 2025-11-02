# SQL Bridge - System Tray Guide (Hindi + English)

## ⚠️ महत्वपूर्ण जानकारी / Important Information

### अगर Tray Icon दिखाई नहीं दे रहा / If Tray Icon Not Visible

**कैसे बंद करें / How to Close:**

#### Method 1: Task Manager (सबसे आसान / Easiest)

1. **Ctrl + Shift + Esc** दबाएं
2. "SQL Bridge" या "SQL Bridge.exe" को खोजें
3. Right-click करके "End Task" select करें
4. ✅ Application बंद हो जाएगी

#### Method 2: Command Line

```bash
# PowerShell में चलाएं / Run in PowerShell
taskkill /F /IM "SQL Bridge.exe"
```

#### Method 3: System Tray में Icon खोजें

- Taskbar के **right side bottom corner** में देखें
- **Arrow (^)** icon पर click करें hidden icons देखने के लिए
- SQL Bridge icon पर **Right-click** → "Quit Application"

---

## 🎯 System Tray Features

### Tray Icon Location

- **Windows 11**: Taskbar के right side में, clock के पास
- **Windows 10**: System tray में, notification area के पास
- अगर दिखाई न दे तो **up arrow (^)** पर click करें

### Tray Menu Options

| Option               | Description (Hindi)        | Description (English)            |
| -------------------- | -------------------------- | -------------------------------- |
| **Show SQL Bridge**  | Window को दिखाने के लिए    | Show the application window      |
| **Hide Window**      | Window को छुपाने के लिए    | Hide the application window      |
| **Quit Application** | Gracefully बंद करें        | Close app properly (saves state) |
| **Force Quit**       | तुरंत बंद करें (Emergency) | Immediate shutdown (emergency)   |

### Mouse Actions

- **Single Click**: Menu खोलें / Open menu
- **Double Click**: Window show/hide toggle
- **Right Click**: Menu खोलें / Open menu

---

## 🚀 Application को कैसे चलाएं

### Normal Start

```bash
# Development mode
npm run dev:full

# Production (packaged exe)
Double-click SQL Bridge.exe
```

### Background Service Mode

```bash
# Windows Service install करें
npm run service:install

# Service start करें
npm run service:start

# Service stop करें
npm run service:stop
```

---

## ❓ Common Problems & Solutions

### Problem 1: Icon नहीं दिख रहा

**Solution:**

1. Taskbar के right side में **up arrow (^)** click करें
2. Hidden icons में देखें
3. अगर फिर भी न दिखे तो **Task Manager** से check करें कि app running है या नहीं

### Problem 2: Close button दबाने पर कुछ नहीं होता

**This is by design!**

- Close button window को **hide** करता है (बंद नहीं)
- Background में jobs चलते रहते हैं
- Quit करने के लिए **tray menu** use करें

### Problem 3: Application बंद नहीं हो रहा

**Solutions (क्रम में try करें):**

1. Tray icon → Right-click → "Quit Application"
2. Tray icon → Right-click → "Force Quit"
3. Task Manager → End Task
4. Command: `taskkill /F /IM "SQL Bridge.exe"`

### Problem 4: Startup पर notification नहीं आ रहा

- Application start होने के **3 seconds** बाद notification आता है
- Windows notification settings check करें
- Focus Assist को off करें

---

## 🔍 कैसे पता करें App Running है?

### Check करने के 3 तरीके:

#### 1. Task Manager

```
Ctrl + Shift + Esc → Processes tab → "SQL Bridge" खोजें
```

#### 2. System Tray

```
Taskbar right-side → Up arrow (^) → SQL Bridge icon
```

#### 3. Command Line

```powershell
# PowerShell
Get-Process | Where-Object {$_.ProcessName -like "*SQL Bridge*"}

# CMD
tasklist | findstr "SQL Bridge"
```

---

## 💡 Best Practices

### Desktop Mode के लिए:

- ✅ Window को देख सकते हैं
- ✅ Jobs monitor कर सकते हैं
- ✅ Real-time logs देख सकते हैं
- ❌ Computer restart पर auto-start नहीं होगा

### Service Mode के लिए:

- ✅ Auto-start on boot
- ✅ Background में हमेशा running
- ✅ No window needed
- ✅ Production deployment के लिए best
- ❌ UI नहीं दिखता (logs file में जाते हैं)

---

## 🛠️ Emergency Actions

### अगर Application respond नहीं कर रहा:

1. **Try graceful shutdown:**

   ```
   Tray menu → Quit Application
   ```

2. **Force quit from tray:**

   ```
   Tray menu → Force Quit (Emergency)
   ```

3. **Task Manager:**

   ```
   Ctrl + Shift + Esc → SQL Bridge → End Task
   ```

4. **Command line force kill:**

   ```bash
   taskkill /F /IM "SQL Bridge.exe"
   ```

5. **If nothing works (extreme):**
   ```bash
   # PowerShell as Admin
   Stop-Process -Name "SQL Bridge" -Force
   ```

---

## 📊 Logs Location

Application logs यहाँ save होते हैं:

```
C:\Users\<YourUsername>\Desktop\RMDB\logs\
```

### Log Files:

- `app.log` - General application logs
- `error.log` - Error logs only
- `buffer-backup\` - Data backups

---

## 🔔 Notifications

Application 3 बार notification show करता है:

1. **Startup** (3 seconds after launch)

   - "SQL Bridge Started"
   - "Application is running. Find icon in system tray."

2. **First Minimize** (when you close window)

   - "SQL Bridge Running"
   - "Application minimized to system tray."

3. **Connection Test Results** (every 2 hours)
   - Database connection test results
   - WhatsApp notifications

---

## 📞 Support

### अगर problem solve नहीं हो रही:

1. **Check logs:**

   ```
   C:\Users\<YourUsername>\Desktop\RMDB\logs\error.log
   ```

2. **Check if running:**

   ```
   Task Manager → Processes → SQL Bridge
   ```

3. **Reinstall:**

   ```bash
   # Close all instances first
   taskkill /F /IM "SQL Bridge.exe"

   # Then run installer again
   ```

---

## ⚙️ Configuration

### Tray Icon को Taskbar में Pin करें:

1. Tray icon पर **Right-click**
2. "Pin to taskbar" select करें (if available)
3. या Settings → Personalization → Taskbar → Notification area

### Notifications को Control करें:

```
Windows Settings → System → Notifications
→ SQL Bridge → Enable/Disable
```

---

**Version:** 2.4.0  
**Last Updated:** November 2025  
**Platform:** Windows 10/11

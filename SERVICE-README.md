# SQL Bridge - Windows Service Setup

## Overview

SQL Bridge can run as a Windows background service that:

- ✅ Starts automatically on system boot
- ✅ Runs continuously in the background (even without UI)
- ✅ Automatically restarts if it crashes
- ✅ Operates like a Docker container

## Quick Start

### 1. Build the Application

```bash
npm run build
```

### 2. Install as Windows Service (Administrator Required)

```bash
npm run service:install
```

**Important:** You must run this command in an Administrator PowerShell/CMD window.

To open Administrator PowerShell:

- Press `Win + X`
- Select "Windows PowerShell (Admin)" or "Terminal (Admin)"

### 3. Service Management Commands

| Command                     | Description         |
| --------------------------- | ------------------- |
| `npm run service:start`     | Start the service   |
| `npm run service:stop`      | Stop the service    |
| `npm run service:restart`   | Restart the service |
| `npm run service:uninstall` | Remove the service  |

Alternatively, use Windows Services Manager:

- Press `Win + R`
- Type `services.msc` and press Enter
- Find "SQLBridgeApp" in the list

## Service Details

- **Service Name:** SQLBridgeApp
- **Display Name:** SQL Bridge Background Service
- **Startup Type:** Automatic (starts on boot)
- **Recovery:** Automatically restarts on failure (max 3 retries)

## What Runs in the Background?

When installed as a service, SQL Bridge runs:

1. **Job Scheduler** - Executes all configured database sync jobs
2. **Connection Test Scheduler** - Tests database connections every 30 minutes
3. **WhatsApp Notifications** - Sends status updates for test results

## Logs

Service logs are stored in:

```
C:\Users\user\Desktop\RMDB\logs\
```

Check these files for debugging:

- `app.log` - Application logs
- `error.log` - Error logs
- `buffer-backup\` - Data buffer backups

## Troubleshooting

### Service Won't Install

- **Cause:** Not running as Administrator
- **Solution:** Right-click PowerShell/CMD → "Run as Administrator"

### Service Fails to Start

- **Cause:** Missing dependencies or configuration errors
- **Solution:**
  1. Check `logs/error.log`
  2. Verify `config/config.json` exists and is valid
  3. Ensure database connections are configured

### Service Doesn't Auto-Start on Reboot

- **Cause:** Service startup type is not "Automatic"
- **Solution:**
  1. Open `services.msc`
  2. Find "SQLBridgeApp"
  3. Right-click → Properties
  4. Set "Startup type" to "Automatic"

### How to View Service Status

```bash
# PowerShell
Get-Service SQLBridgeApp

# CMD
sc query SQLBridgeApp
```

## Uninstalling the Service

To completely remove the service:

```bash
npm run service:uninstall
```

This will:

1. Stop the service if running
2. Remove it from Windows Services
3. Clean up all service registration

**Note:** This does NOT delete your data, configuration, or logs. It only removes the service registration.

## Running Without Service (Normal Desktop Mode)

If you want to run SQL Bridge as a normal desktop application instead:

```bash
npm run start
```

This will:

- Show the UI window
- Run the job scheduler
- Exit when you close the window

## Comparison: Desktop vs Service Mode

| Feature                | Desktop Mode | Service Mode |
| ---------------------- | ------------ | ------------ |
| UI Window              | ✅ Yes       | ❌ No        |
| Auto-start on boot     | ❌ No        | ✅ Yes       |
| Runs after closing     | ❌ No        | ✅ Yes       |
| Background operation   | ❌ No        | ✅ Yes       |
| Job scheduler          | ✅ Yes       | ✅ Yes       |
| Connection tests       | ✅ Yes       | ✅ Yes       |
| WhatsApp notifications | ✅ Yes       | ✅ Yes       |

## Production Deployment Checklist

Before installing as a service in production:

- [ ] Test all database connections
- [ ] Verify job configurations in `config/jobs.json`
- [ ] Test WhatsApp notifications
- [ ] Review and adjust cron schedules
- [ ] Check log rotation settings
- [ ] Verify disk space for buffer backups
- [ ] Document recovery procedures
- [ ] Test service auto-restart on failure
- [ ] Confirm service starts after system reboot

## Security Note

The service runs with the privileges of the account that installed it. For production:

- Consider using a dedicated service account
- Restrict access to `config/` directory (contains credentials)
- Use environment variables for sensitive data
- Enable Windows Firewall rules if accessing remote databases

## Support

For issues or questions:

1. Check logs in `logs/` directory
2. Review error messages in `logs/error.log`
3. Verify configuration in `config/config.json`
4. Test database connections manually

---

**Version:** 2.4.0  
**Last Updated:** 2024

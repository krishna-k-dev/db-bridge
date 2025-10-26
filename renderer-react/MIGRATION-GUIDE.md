# SQL Bridge - React UI Migration Guide

## ✅ Completed Work

### 1. Project Setup

- ✅ Created new Vite + React + TypeScript project in `renderer-react/` folder
- ✅ Configured Tailwind CSS with custom theme
- ✅ Setup shadcn/ui base configuration
- ✅ Configured path aliases (`@/` -> `src/`)

### 2. UI Components Created

- ✅ **TitleBar** - Custom window controls (minimize, maximize, close)
- ✅ **Sidebar** - Navigation with active states and badges
- ✅ **ConnectionsPage** - Full connections management UI
- ✅ **JobsPage** - Jobs listing and management UI
- ✅ **LogsPage** - Logs viewer with filtering
- ✅ **SettingsPage** - Application settings UI

### 3. Features Implemented

- Modern responsive design with Tailwind CSS
- Clean component architecture
- TypeScript for type safety
- Lucide React icons integration
- Proper state management with React hooks

## 🚧 Pending Work

### 1. Install Missing Dependencies

```bash
cd renderer-react
npm install @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-checkbox @radix-ui/react-label @radix-ui/react-separator @radix-ui/react-tooltip @radix-ui/react-tabs
```

### 2. Setup Electron IPC Bridge

Create a preload script to expose Electron APIs to React:

**File**: `src/preload.ts` (in main project)

```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  // Window controls
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  maximizeWindow: () => ipcRenderer.send("maximize-window"),
  closeWindow: () => ipcRenderer.send("close-window"),

  // Connections
  getConnections: () => ipcRenderer.invoke("get-connections"),
  addConnection: (data: any) => ipcRenderer.invoke("add-connection", data),
  updateConnection: (id: string, data: any) =>
    ipcRenderer.invoke("update-connection", id, data),
  deleteConnection: (id: string) => ipcRenderer.invoke("delete-connection", id),
  testConnection: (id: string) => ipcRenderer.invoke("test-connection", id),

  // Jobs
  getJobs: () => ipcRenderer.invoke("get-jobs"),
  addJob: (data: any) => ipcRenderer.invoke("add-job", data),
  updateJob: (id: string, data: any) =>
    ipcRenderer.invoke("update-job", id, data),
  deleteJob: (id: string) => ipcRenderer.invoke("delete-job", id),
  runJob: (id: string) => ipcRenderer.invoke("run-job", id),

  // Logs
  getLogs: () => ipcRenderer.invoke("get-logs"),
});
```

### 3. Update main.ts

Update BrowserWindow configuration:

```typescript
const mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  frame: false, // Remove default frame (we have custom title bar)
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
  },
});

// In development, load from Vite dev server
if (process.env.NODE_ENV === "development") {
  mainWindow.loadURL("http://localhost:5173");
} else {
  // In production, load built files
  mainWindow.loadFile(
    path.join(__dirname, "../renderer-react/dist/index.html")
  );
}

// Add IPC handlers
ipcMain.on("minimize-window", () => mainWindow.minimize());
ipcMain.on("maximize-window", () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("close-window", () => mainWindow.close());
```

### 4. Update Vite Config for Electron

**File**: `renderer-react/vite.config.ts`

```typescript
export default defineConfig({
  plugins: [react()],
  base: "./", // Important for Electron
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 5. Update package.json Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:react\" \"npm run dev:electron\"",
    "dev:react": "cd renderer-react && npm run dev",
    "dev:electron": "tsc && electronmon .",
    "build": "tsc && cd renderer-react && npm run build",
    "package": "npm run build && electron-builder --win --x64"
  }
}
```

### 6. Add shadcn/ui Components (As Needed)

Install more shadcn components:

```bash
# Dialog for modals
# Input for form fields
# Select for dropdowns
# Table for data tables
# Badge for status indicators
# Card for content containers
```

### 7. Add Modal Components

Create dialog components for:

- Add/Edit Connection Modal
- Add/Edit Job Modal
- Bulk Upload Modal
- Delete Confirmation Modal

### 8. Connect IPC to Components

Update all pages to use actual Electron IPC calls instead of mock data.

## 📁 Project Structure

```
RMDB/
├── src/                          # Main Electron process
│   ├── main.ts
│   ├── preload.ts (to create)
│   ├── adapters/
│   ├── connectors/
│   └── core/
│
├── renderer-react/               # New React UI
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── TitleBar.tsx
│   │   │   │   └── Sidebar.tsx
│   │   │   ├── pages/
│   │   │   │   ├── ConnectionsPage.tsx
│   │   │   │   ├── JobsPage.tsx
│   │   │   │   ├── LogsPage.tsx
│   │   │   │   └── SettingsPage.tsx
│   │   │   └── ui/              # shadcn components
│   │   │       └── button.tsx
│   │   ├── lib/
│   │   │   └── utils.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
│
└── package.json                  # Root package.json
```

## 🎨 Design System

### Colors

- **Primary**: Indigo/Blue (#6366f1)
- **Success**: Green (#10b981)
- **Warning**: Yellow (#f59e0b)
- **Danger**: Red (#ef4444)
- **Gray Scale**: Tailwind default grays

### Typography

- **Font**: System fonts (Segoe UI, SF Pro, etc.)
- **Headings**: Bold, various sizes
- **Body**: Regular weight, readable sizes

### Components

- Rounded corners (lg, md, sm)
- Subtle shadows
- Smooth transitions
- Hover states on interactive elements

## 🚀 Next Steps

1. **Install Dependencies**: Run the npm install command above
2. **Create Preload Script**: Add IPC bridge
3. **Update main.ts**: Load React app
4. **Test in Development**: Run `npm run dev`
5. **Add More Features**: Modals, forms, validations
6. **Test Build**: Run `npm run package`

## 📝 Notes

- Current old UI files are in `src/renderer/` (index.html, app.js, style.css)
- New React UI is completely separate in `renderer-react/`
- Can keep both during transition/testing
- Eventually remove old renderer files
- All business logic stays in main process
- React UI just displays data and sends commands via IPC

## 💡 Tips

- Use React DevTools for debugging
- Keep components small and focused
- Use TypeScript for type safety
- Follow shadcn/ui patterns for consistency
- Test each feature as you integrate IPC

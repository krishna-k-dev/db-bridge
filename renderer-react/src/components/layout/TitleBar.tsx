import { Minus, Square, X, Menu } from 'lucide-react'
import Logo from '../../assets/logo.png'

interface TitleBarProps {
  onToggleSidebar?: () => void
}

const TitleBar = ({ onToggleSidebar }: TitleBarProps) => {
  // Helper that tries multiple strategies to control the window:
  // 1) dynamic import of @electron/remote (preferred when running in Electron)
  // 2) window.electron.invoke fallback (if a preload exposed an API)
  // 3) console.log fallback for browser/dev server
  const callWindowAction = async (action: 'minimize' | 'maximize' | 'close') => {
    try {
      // dynamic import so this file still works in the browser dev server
      const remote = await import('@electron/remote')
      const win = remote.getCurrentWindow()
      if (!win) throw new Error('No current window')

      if (action === 'minimize') win.minimize()
      if (action === 'maximize') {
        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
      }
      if (action === 'close') win.close()
      return
    } catch (err) {
      // try ipc invoke fallback exposed on window (preload) or nodeIntegration require
      try {
        // First, check for a preload-exposed API: window.electron.invoke
        const api = (window as any).electron?.invoke
        if (api && typeof api === 'function') {
          if (action === 'minimize') await api('minimize-window')
          if (action === 'maximize') await api('maximize-window')
          if (action === 'close') await api('close-window')
          return
        }

        // Next, if nodeIntegration is enabled we can require electron directly
        const req = (window as any).require
        if (typeof req === 'function') {
          const electron = req('electron')
          if (electron && electron.ipcRenderer && typeof electron.ipcRenderer.invoke === 'function') {
            if (action === 'minimize') await electron.ipcRenderer.invoke('minimize-window')
            if (action === 'maximize') await electron.ipcRenderer.invoke('maximize-window')
            if (action === 'close') await electron.ipcRenderer.invoke('close-window')
            return
          }
        }
      } catch (e) {
        // swallow and fallback to console
      }
    }

    // final fallback when not running inside Electron
    console.log(`${action} clicked`)
  }

  const handleMinimize = () => { void callWindowAction('minimize') }
  const handleMaximize = () => { void callWindowAction('maximize') }
  const handleClose = () => { void callWindowAction('close') }

  return (
    <div className="h-8 bg-blue-600 flex items-center justify-between px-4 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="md:hidden w-8 h-8 flex items-center justify-center text-white hover:bg-blue-700 transition-colors rounded"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <Menu className="w-5 h-5" />
        </button>
        <img src={Logo} alt="Logo" className="w-5 h-5" />
        <span className="text-white text-sm font-medium">Bridge</span>
      </div>
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={handleMinimize}
          className="w-12 h-8 flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-8 flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-8 flex items-center justify-center text-white hover:bg-red-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default TitleBar

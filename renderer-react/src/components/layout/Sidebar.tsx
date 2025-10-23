import { Cable, Settings, ClipboardList, Activity, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Link, useLocation } from 'react-router-dom'

interface SidebarProps {
  connectionsCount: number
  jobsCount: number
  isOpen?: boolean
  onToggle?: () => void
}

const Sidebar = ({ connectionsCount, jobsCount, isOpen = true, onToggle }: SidebarProps) => {
  const location = useLocation()

  const navItems = [
    { id: 'connections', label: 'Connections', icon: Cable, path: '/connections', badge: connectionsCount },
    { id: 'jobs', label: 'Jobs', icon: Settings, path: '/jobs', badge: jobsCount },
    { id: 'logs', label: 'Logs', icon: ClipboardList, path: '/logs' },
    { id: 'monitoring', label: 'Monitoring', icon: BarChart3, path: '/monitoring' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ]

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onToggle}
        />
      )}

      <aside className={cn(
        "fixed md:relative top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        "md:translate-x-0" // Always visible on desktop
      )}>
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <Link to="/" className="block">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              SQL Bridge
            </h1>
            <p className="text-sm text-gray-600 mt-1">Data Sync Automation</p>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path || (item.path === '/connections' && location.pathname === '/')

            return (
                <Link key={item.id} to={item.path} onClick={onToggle} className={cn("w-full flex items-center py-3 px-4", isActive ? "bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" : "bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors")}>
                  <div className="flex items-center gap-3 flex-1">
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={cn(
                      "px-2 py-0.5 text-xs font-semibold rounded-full",
                      isActive
                        ? "bg-white text-blue-600"
                        : "bg-blue-600 text-white"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-sm text-gray-600">Ready</span>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar

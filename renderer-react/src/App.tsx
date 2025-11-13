import { useState } from 'react'
import './App.css'
import TitleBar from './components/layout/TitleBar'
import Sidebar from '@/components/layout/Sidebar'
import ConnectionsPage from './components/pages/ConnectionsPage'
import ConnectionsDashboard from '@/components/pages/ConnectionsDashboard'
import JobsPage from '@/components/pages/JobsPage'
import SingleQueryJobsPage from '@/components/pages/SingleQueryJobsPage'
import MultiQueryJobsPage from '@/components/pages/MultiQueryJobsPage'
import LogsPage from '@/components/pages/LogsPage'
import SettingsPage from '@/components/pages/SettingsPage'
import MonitoringPage from '@/components/pages/MonitoringPage'
import JobMonitor from '@/components/JobMonitor'
import { CreateConnectionForm } from '@/components/forms/CreateConnectionForm'
import { EditConnectionForm } from '@/components/forms/EditConnectionForm'
import { CreateJobForm } from '@/components/forms/CreateJobForm'
import { EditJobForm } from '@/components/forms/EditJobForm'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from "@/components/ui/sonner"

function App() {
  const [connectionsCount, setConnectionsCount] = useState(0)
  const [jobsCount, setJobsCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)



  return (
    <Router>
      <div className="h-screen flex flex-col bg-white">
        <TitleBar onToggleSidebar={toggleSidebar} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar 
            connectionsCount={connectionsCount}
            jobsCount={jobsCount}
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
          />
          <main className="flex-1 overflow-auto bg-gray-50 md:ml-0">
            <Routes>
              <Route path="/" element={<ConnectionsDashboard onCountChange={setConnectionsCount} />} />
              <Route path="/connections" element={<ConnectionsDashboard onCountChange={setConnectionsCount} />} />
              <Route path="/connections/self" element={<ConnectionsPage onCountChange={setConnectionsCount} />} />
              <Route path="/connections/partner" element={<ConnectionsPage onCountChange={setConnectionsCount} />} />
              <Route path="/connections/create" element={<CreateConnectionForm onConnectionCreated={() => setConnectionsCount(c => c + 1)} />} />
              <Route path="/connections/:id/edit" element={<EditConnectionForm onConnectionUpdated={() => {}} />} />
              <Route path="/jobs" element={<JobsPage onCountChange={setJobsCount} />} />
              <Route path="/jobs/single" element={<SingleQueryJobsPage onCountChange={setJobsCount} />} />
              <Route path="/jobs/multi-query" element={<MultiQueryJobsPage onCountChange={setJobsCount} />} />
              <Route path="/jobs/create" element={<CreateJobForm onJobCreated={() => setJobsCount(c => c + 1)} />} />
              <Route path="/jobs/:id/edit" element={<EditJobForm onJobUpdated={() => setJobsCount(c => c + 1)} />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/monitoring" element={<MonitoringPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
        {/* Job Monitor - floating panel for real-time progress */}
        <JobMonitor />
      </div>
      <Toaster expand position='top-right' />
    </Router>
  )
}

export default App

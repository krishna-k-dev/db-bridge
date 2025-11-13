import { useState, useEffect } from 'react'
import { Plus, Database, Sparkle, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from "sonner"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

interface Job {
  id: string
  name: string
  queries?: any[]
}

interface JobsPageProps {
  onCountChange: (count: number) => void
}

const JobsPage = ({ onCountChange }: JobsPageProps) => {
  const navigate = useNavigate()
  const [singleJobsCount, setSingleJobsCount] = useState(0)
  const [multiJobsCount, setMultiJobsCount] = useState(0)

  useEffect(() => {
    loadJobsCounts()
  }, [])

  useEffect(() => {
    onCountChange(singleJobsCount + multiJobsCount)
  }, [singleJobsCount, multiJobsCount, onCountChange])

  const loadJobsCounts = async () => {
    try {
      const allJobs: Job[] = await ipcRenderer.invoke('get-jobs')
      const singleJobs = allJobs.filter((job: Job) => !job.queries || job.queries.length === 0)
      const multiJobs = allJobs.filter((job: Job) => job.queries && job.queries.length > 0)
      
      setSingleJobsCount(singleJobs.length)
      setMultiJobsCount(multiJobs.length)
    } catch (error) {
      console.error('Failed to load jobs:', error)
      toast.error('Failed to load jobs')
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs Dashboard</h1>
          <p className="text-gray-600">Manage your data sync jobs</p>
        </div>
        <button
          onClick={() => navigate('/jobs/create')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Job
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div 
          onClick={() => navigate('/jobs/single')}
          className="bg-white rounded-lg shadow-lg border-2 border-gray-200 hover:border-blue-500 hover:shadow-xl transition-all cursor-pointer p-6 group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg group-hover:bg-blue-600 transition-colors">
              <Database className="w-8 h-8 text-blue-600 group-hover:text-white" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 mb-2">Single Query Jobs</h2>
          <p className="text-gray-600 mb-4">Jobs that run a single SQL query</p>
          
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-blue-600">{singleJobsCount}</span>
            <span className="text-gray-500">jobs</span>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <button className="text-blue-600 font-medium text-sm group-hover:underline flex items-center gap-1">
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div 
          onClick={() => navigate('/jobs/multi-query')}
          className="bg-white rounded-lg shadow-lg border-2 border-gray-200 hover:border-purple-500 hover:shadow-xl transition-all cursor-pointer p-6 group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="bg-purple-100 p-3 rounded-lg group-hover:bg-purple-600 transition-colors">
              <Sparkle className="w-8 h-8 text-purple-600 group-hover:text-white" />
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 mb-2">Multi-Query Jobs</h2>
          <p className="text-gray-600 mb-4">Jobs with multiple named queries</p>
          
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-purple-600">{multiJobsCount}</span>
            <span className="text-gray-500">jobs</span>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <button className="text-purple-600 font-medium text-sm group-hover:underline flex items-center gap-1">
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600 mb-1">Total Jobs</p>
            <p className="text-2xl font-bold text-gray-900">{singleJobsCount + multiJobsCount}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600 mb-1">Single Query</p>
            <p className="text-2xl font-bold text-blue-600">{singleJobsCount}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600 mb-1">Multi-Query</p>
            <p className="text-2xl font-bold text-purple-600">{multiJobsCount}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JobsPage

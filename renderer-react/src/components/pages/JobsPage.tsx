import { useState, useEffect } from 'react'
import { Plus, Search, MoreVertical, Edit, Trash2, Play, Pause, Sparkle, Copy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

interface Job {
  id: string
  name: string
  connectionId?: string
  connectionIds?: string[]
  schedule: string
  enabled: boolean
  destinations: any[]
  lastRun?: string
}

interface JobsPageProps {
  onCountChange: (count: number) => void
}

const JobsPage = ({ onCountChange }: JobsPageProps) => {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null)

  useEffect(() => {
    loadJobs()
  }, [])

  useEffect(() => {
    onCountChange(jobs.length)
  }, [jobs, onCountChange])

  const loadJobs = async () => {
    try {
      const data = await ipcRenderer.invoke('get-jobs')
      if (data) {
        setJobs(data)
      }
    } catch (error) {
      console.error('Failed to load jobs:', error)
    }
  }

  const handleRunJob = async (jobId: string) => {
    const jobPromise = ipcRenderer.invoke('run-job', jobId)

    toast.promise(jobPromise, {
      loading: 'Running job...',
      success: (result: any) => {
        loadJobs() // Refresh jobs list
        return result?.message || 'Job completed successfully!'
      },
      error: (error: any) => {
        console.error('Failed to run job:', error)
        return error?.message || 'Failed to run job. Please try again.'
      }
    })
  }

  const handleToggleJob = async (jobId: string, enabled: boolean) => {
    const togglePromise = ipcRenderer.invoke('update-job', jobId, { enabled: !enabled })

    toast.promise(togglePromise, {
      loading: `${enabled ? 'Disabling' : 'Enabling'} job...`,
      success: () => {
        loadJobs() // Refresh jobs list
        return `Job ${!enabled ? 'enabled' : 'disabled'} successfully!`
      },
      error: (error: any) => {
        console.error('Failed to toggle job:', error)
        return 'Failed to update job status. Please try again.'
      }
    })
  }

  const handleEditJob = (jobId: string) => {
    navigate(`/jobs/${jobId}/edit`)
  }

  const handleDuplicateJob = async (jobId: string) => {
    try {
      const jobs = await ipcRenderer.invoke('get-jobs')
      const jobToDuplicate = jobs.find((j: any) => j.id === jobId)
      if (!jobToDuplicate) return

      const duplicatedJob = {
        ...jobToDuplicate,
        id: undefined, // Let the backend generate new ID
        name: `${jobToDuplicate.name} (Copy)`,
        enabled: false, // Disable by default
        lastRun: undefined
      }

      const duplicatePromise = ipcRenderer.invoke('create-job', duplicatedJob)

      toast.promise(duplicatePromise, {
        loading: 'Duplicating job...',
        success: () => {
          loadJobs() // Refresh jobs list
          return 'Job duplicated successfully!'
        },
        error: (error: any) => {
          console.error('Failed to duplicate job:', error)
          return 'Failed to duplicate job. Please try again.'
        }
      })
    } catch (error) {
      console.error('Failed to duplicate job:', error)
      toast.error('Failed to duplicate job. Please try again.')
    }
  }

  const handleDeleteJob = async () => {
    if (!deleteJobId) return

    const deletePromise = ipcRenderer.invoke('delete-job', deleteJobId)

    toast.promise(deletePromise, {
      loading: 'Deleting job...',
      success: () => {
        loadJobs() // Refresh jobs list
        setDeleteJobId(null)
        return 'Job deleted successfully!'
      },
      error: (error: any) => {
        console.error('Failed to delete job:', error)
        return 'Failed to delete job. Please try again.'
      }
    })
  }

  const filteredJobs = jobs.filter(job =>
    job.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Jobs</h2>
            <p className="text-gray-600 mt-1">Manage your data sync jobs</p>
          </div>
          <button 
            onClick={() => navigate('/jobs/create')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Job
          </button>
        </div>

        <div className="mt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </header>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Connection
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Schedule
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Destinations
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-xs">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-12 text-center text-gray-500">
                    No jobs found. Click "Create Job" to get started.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job, idx) => (
                  <tr key={job.id ?? `job-${idx}-${(job.name || '').replace(/\s+/g, '-')}` } className="hover:bg-gray-50">
                    <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-900">
                      {job.name}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {(job.connectionIds?.length || (job.connectionId ? 1 : 0))} connection{(job.connectionIds?.length || (job.connectionId ? 1 : 0)) !== 1 ? 's' : ''}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {job.schedule}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        job.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {job.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-700">
                      {job.destinations?.length || 0} destination{job.destinations?.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                            <MoreVertical className="w-4 h-4 text-gray-600" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRunJob(job.id)}>
                            <Sparkle  className="w-4 h-4 mr-2" />
                            Run Job
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleJob(job.id, job.enabled)}>
                            {job.enabled ? (
                              <Pause className="w-4 h-4 mr-2" />
                            ) : (
                              <Play className="w-4 h-4 mr-2" />
                            )}
                            {job.enabled ? 'Disable' : 'Enable'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditJob(job.id)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateJob(job.id)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => setDeleteJobId(job.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!deleteJobId} onOpenChange={() => setDeleteJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this job? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteJob} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default JobsPage

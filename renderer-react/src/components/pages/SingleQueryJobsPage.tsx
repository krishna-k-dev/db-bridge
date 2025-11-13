import { useState, useEffect } from 'react'
import { Plus, Search, MoreVertical, Edit, Trash2, Play, Pause, Copy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

interface Job {
  id: string
  name: string
  connectionId?: string
  connectionIds?: string[]
  schedule: string
  recurrenceType?: 'once' | 'daily' | 'every-n-days'
  everyNDays?: number
  timeOfDay?: string
  enabled: boolean
  destinations: any[]
  lastRun?: string
  group?: string
  queries?: any[]
}

interface SingleQueryJobsPageProps {
  onCountChange: (count: number) => void
}

const SingleQueryJobsPage = ({ onCountChange }: SingleQueryJobsPageProps) => {
  const navigate = useNavigate()

  const formatSchedule = (job: any) => {
    if (job.timeOfDay) {
      return `Daily at ${job.timeOfDay}`;
    }
    return job.schedule || 'Manual';
  };

  const [jobs, setJobs] = useState<Job[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [groupFilter, setGroupFilter] = useState('none')
  const [jobGroups, setJobGroups] = useState<string[]>([])
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null)

  useEffect(() => {
    loadJobs()
  }, [])

  useEffect(() => {
    let mounted = true

    const restore = async () => {
      try {
        const settings = await ipcRenderer.invoke('get-settings')
        const ui = (settings && (settings as any).ui) || {}
        const jobsUi = ui.jobs || {}
        const saved = jobsUi.groupFilter || localStorage.getItem('jobs.groupFilter')
        if (mounted && saved) setGroupFilter(saved)
      } catch (err) {
        console.error('Failed to restore group filter', err)
      }
    }
    restore()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    onCountChange(jobs.length)
  }, [jobs.length, onCountChange])

  const loadJobs = async () => {
    const allJobs = await ipcRenderer.invoke('get-jobs')
    // Filter only single-query jobs (jobs without queries array or empty queries)
    const singleJobs = allJobs.filter((job: Job) => !job.queries || job.queries.length === 0)
    setJobs(singleJobs)

    const groups = Array.from(new Set(singleJobs.map((j: Job) => j.group).filter(Boolean))) as string[]
    setJobGroups(groups)
  }

  const handleDelete = async () => {
    if (!deleteJobId) return
    await ipcRenderer.invoke('delete-job', deleteJobId)
    toast.success('Job deleted successfully')
    setDeleteJobId(null)
    loadJobs()
  }

  const handleToggleEnabled = async (jobId: string, currentEnabled: boolean) => {
    await ipcRenderer.invoke('update-job', jobId, { enabled: !currentEnabled })
    toast.success(currentEnabled ? 'Job disabled' : 'Job enabled')
    loadJobs()
  }

  const handleRunNow = async (jobId: string) => {
    try {
      await ipcRenderer.invoke('run-job-now', jobId)
      toast.success('Job started successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to start job')
    }
  }

  const handleDuplicate = async (job: Job) => {
    const newJob = {
      ...job,
      id: undefined,
      name: `${job.name} (Copy)`,
      enabled: false,
    }
    await ipcRenderer.invoke('create-job', newJob)
    toast.success('Job duplicated successfully')
    loadJobs()
  }

  const handleGroupFilterChange = async (value: string) => {
    setGroupFilter(value)
    localStorage.setItem('jobs.groupFilter', value)

    try {
      const settings = await ipcRenderer.invoke('get-settings')
      const updated = {
        ...settings,
        ui: {
          ...(settings as any).ui,
          jobs: {
            ...((settings as any).ui?.jobs || {}),
            groupFilter: value
          }
        }
      }
      await ipcRenderer.invoke('save-settings', updated)
    } catch (err) {
      console.error('Failed to persist group filter', err)
    }
  }

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesGroup = groupFilter === 'none' || job.group === groupFilter
    return matchesSearch && matchesGroup
  })

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Single Query Jobs</h1>
          <p className="text-gray-600">Jobs with a single SQL query</p>
        </div>
        <button
          onClick={() => navigate('/jobs/create')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Job
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Select value={groupFilter} onValueChange={handleGroupFilterChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All Groups</SelectItem>
              {jobGroups.map(group => (
                <SelectItem key={group} value={group}>{group}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-tight">Name</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-tight">Group</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-tight">Connection</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-tight">Schedule</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-tight">Status</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-tight">Destinations</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-tight">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredJobs.map(job => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <div className="text-[11px] font-medium text-gray-900">{job.name}</div>
                    </div>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <span className="text-[11px] text-gray-600">{job.group || '-'}</span>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <span className="text-[11px] text-gray-600">
                      {job.connectionIds ? `${job.connectionIds.length} connections` : '1 connection'}
                    </span>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <span className="text-[11px] text-gray-600">{formatSchedule(job)}</span>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <Badge variant={job.enabled ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                      {job.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <span className="text-[11px] text-gray-600">{job.destinations?.length || 0} destination(s)</span>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-0.5 hover:bg-gray-100 rounded">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRunNow(job.id)}>
                          <Play className="w-3.5 h-3.5 mr-2" />
                          Run Now
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/jobs/${job.id}/edit`)}>
                          <Edit className="w-3.5 h-3.5 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(job)}>
                          <Copy className="w-3.5 h-3.5 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleEnabled(job.id, job.enabled)}>
                          <Pause className="w-3.5 h-3.5 mr-2" />
                          {job.enabled ? 'Disable' : 'Enable'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => setDeleteJobId(job.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredJobs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No single query jobs found</p>
          </div>
        )}
      </div>

      <AlertDialog open={deleteJobId !== null} onOpenChange={() => setDeleteJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the job.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default SingleQueryJobsPage

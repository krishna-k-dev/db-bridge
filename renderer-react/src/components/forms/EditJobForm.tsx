import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { CreateJobForm } from "./CreateJobForm"

// @ts-ignore - Electron types
const { ipcRenderer } = window.require('electron')

interface EditJobFormProps {
  onJobUpdated?: () => void
}

export function EditJobForm({ onJobUpdated }: EditJobFormProps) {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadJob()
  }, [id])

  const loadJob = async () => {
    if (!id) return

    try {
      const jobs = await ipcRenderer.invoke('get-jobs')
      const foundJob = jobs.find((j: any) => j.id === id)
      if (foundJob) {
        setJob(foundJob)
      }
    } catch (error) {
      console.error('Failed to load job', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return <div className="p-4">Loading job...</div>
  }

  if (!job) {
    return <div className="p-4">Job not found</div>
  }

  return <CreateJobForm job={job} onJobUpdated={onJobUpdated} />
}
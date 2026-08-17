import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { site as siteApi } from './api.js'

const TaskContext = createContext({
  activeTask: null,
  startTask: () => {},
  cancelTask: () => {},
  resumeTask: () => {},
  clearTask: () => {},
})

export function TaskProvider({ children, siteId }) {
  const [activeTask, setActiveTask] = useState(null)
  const timerRef = useRef(null)

  const clearTask = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setActiveTask(null)
  }, [])

  const pollJob = useCallback((jobId, taskMeta = {}) => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!jobId || !siteId) return

    timerRef.current = setInterval(async () => {
      try {
        const s = await siteApi(siteId).job(jobId)
        if (!s) return

        setActiveTask((prev) => ({
          id: jobId,
          title: taskMeta.title || s.message || 'در حال پردازش…',
          type: taskMeta.type || s.type || 'job',
          state: s.state || 'running', // 'running' | 'paused' | 'done' | 'failed'
          progress: s.progress || (s.state === 'done' ? 100 : 30),
          message: s.message,
          result: s.result,
        }))

        if (s.state === 'done' || s.state === 'failed') {
          clearInterval(timerRef.current)
          timerRef.current = null
          // Automatically clear done task after 6 seconds
          setTimeout(() => {
            setActiveTask((curr) => (curr?.id === jobId ? null : curr))
          }, 6000)
        }
      } catch {
        // continue polling or ignore
      }
    }, 2000)
  }, [siteId])

  const startTask = useCallback((task) => {
    const { id, title, type = 'general', progress = 5 } = task
    setActiveTask({
      id,
      title: title || 'عملیات در حال اجرا…',
      type,
      state: 'running',
      progress,
    })
    if (id) {
      pollJob(id, task)
    }
  }, [pollJob])

  const cancelTask = useCallback(async () => {
    if (!activeTask) return
    if (timerRef.current) clearInterval(timerRef.current)
    setActiveTask((prev) => prev ? { ...prev, state: 'paused', title: `متوقف شد: ${prev.title}` } : null)
  }, [activeTask])

  const resumeTask = useCallback(async () => {
    if (!activeTask?.id) return
    setActiveTask((prev) => prev ? { ...prev, state: 'running' } : null)
    pollJob(activeTask.id, activeTask)
  }, [activeTask, pollJob])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return (
    <TaskContext.Provider value={{ activeTask, startTask, cancelTask, resumeTask, clearTask, pollJob }}>
      {children}
    </TaskContext.Provider>
  )
}

export function useTask() {
  return useContext(TaskContext)
}

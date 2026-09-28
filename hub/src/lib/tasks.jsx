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

    // Consecutive unreadable polls. A job id nothing answers for (HTTP 200
    // {ok:false}) or a server that keeps failing must end the task instead of
    // showing «running» forever — the work itself may still run on the site.
    let fails = 0
    timerRef.current = setInterval(async () => {
      let s
      try {
        s = await siteApi(siteId).job(jobId)
        if (!s || s.ok === false || !s.state) throw new Error(s?.message || 'وضعیت خوانده نشد.')
        fails = 0
      } catch {
        fails += 1
        if (fails >= 5) {
          clearInterval(timerRef.current)
          timerRef.current = null
          setActiveTask((curr) => (curr?.id === jobId
            ? {
                ...curr,
                state: 'failed',
                message: 'خواندن وضعیت عملیات چند بار ناموفق ماند؛ اجرای آن روی سایت ممکن است همچنان در جریان باشد.',
              }
            : curr))
        }
        return
      }

      setActiveTask(() => ({
        id: jobId,
        title: taskMeta.title || s.message || 'در حال پردازش…',
        type: taskMeta.type || s.type || 'job',
        state: s.state || 'running', // 'running' | 'done' | 'failed' | 'detached'
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

  // This cannot stop anything: a queued job (scan, backup, update) keeps
  // running on the managed site and the server has no cancel endpoint. So the
  // only honest effect is ending the panel's own progress display, and the
  // bar must say exactly that — never "متوقف شد" about the job itself.
  const cancelTask = useCallback(() => {
    if (!activeTask) return
    if (timerRef.current) clearInterval(timerRef.current)
    setActiveTask((prev) => (prev ? { ...prev, state: 'detached' } : null))
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

// eslint-disable-next-line react-refresh/only-export-components
export function useTask() {
  return useContext(TaskContext)
}

import { useTask } from '../lib/tasks.jsx'
import Icon from '../lib/icons.jsx'
import { faNum } from '../lib/format.js'
import { Button, IconButton } from './actions.jsx'

export default function TaskNotificationBar() {
  const { activeTask, cancelTask, resumeTask, clearTask } = useTask()

  if (!activeTask) return null

  const isRunning = activeTask.state === 'running'
  const isDone = activeTask.state === 'done'
  const isFailed = activeTask.state === 'failed'
  const isPaused = activeTask.state === 'paused'

  const progress = isDone ? 100 : (activeTask.progress || 10)

  return (
    <div style={{
      background: isFailed ? 'var(--gd-danger-bg)' : isDone ? 'var(--gd-success-bg)' : 'var(--gd-bg-surface)',
      borderBottom: `1px solid ${isFailed ? 'var(--gd-danger-border)' : isDone ? 'var(--gd-success-border)' : 'var(--gd-border)'}`,
      padding: '10px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      boxShadow: 'var(--gd-shadow-sm)',
      animation: 'slideDown 0.3s ease',
      zIndex: 15,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            background: isFailed ? 'var(--gd-danger)' : isDone ? 'var(--gd-success)' : 'var(--gd-primary-subtle)',
            color: (isFailed || isDone) ? '#fff' : 'var(--gd-primary)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
          }}>
            {isRunning && <Icon name="loader-2" size={16} className="gd-activity__ic--spin" />}
            {isDone && <Icon name="check" size={16} />}
            {isFailed && <Icon name="alert-octagon" size={16} />}
            {isPaused && <Icon name="clock" size={16} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeTask.title}
            </div>
            {activeTask.message && (
              <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 1 }}>
                {activeTask.message}
              </div>
            )}
          </div>
        </div>

        {/* Action Controls & Percentage */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: isFailed ? 'var(--gd-danger)' : isDone ? 'var(--gd-success)' : 'var(--gd-primary)' }}>
            {isFailed ? 'خطا' : isDone ? 'تکمیل شد' : `${faNum(progress)}٪`}
          </span>

          {isRunning && (
            <Button size="sm" variant="subtle" onClick={cancelTask} leftIcon="minus">
              توقف
            </Button>
          )}

          {isPaused && (
            <Button size="sm" variant="primary" onClick={resumeTask} leftIcon="play">
              ادامه
            </Button>
          )}

          {(isDone || isFailed) && (
            <IconButton icon="x" label="بستن" size="sm" onClick={clearTask} />
          )}
        </div>
      </div>

      {/* Progress Track */}
      <div style={{
        height: 4, borderRadius: 2, background: 'var(--gd-bg-inset)', overflow: 'hidden', width: '100%',
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: isFailed ? 'var(--gd-danger)' : isDone ? 'var(--gd-success)' : 'var(--gd-primary)',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

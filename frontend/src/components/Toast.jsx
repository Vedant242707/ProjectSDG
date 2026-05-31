import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const CFG = {
  success: { Icon: CheckCircle2, bg: 'bg-green-600',  ring: 'ring-green-700' },
  error:   { Icon: XCircle,      bg: 'bg-red-600',    ring: 'ring-red-700'   },
  warning: { Icon: AlertTriangle, bg: 'bg-amber-500', ring: 'ring-amber-600' },
  info:    { Icon: Info,          bg: 'bg-blue-600',  ring: 'ring-blue-700'  },
}

function ToastItem({ toast, onRemove }) {
  const { Icon, bg, ring } = CFG[toast.type] ?? CFG.info
  return (
    <div
      className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-xl ring-1 ${bg} ${ring} animate-in slide-in-from-right-4`}
      style={{ minWidth: '280px', maxWidth: '380px' }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="ml-1 shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => remove(id), 3_500)
    return id
  }, [remove])

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  )
}

// useToast() returns: addToast(message, type?) → id
// type: 'success' | 'error' | 'warning' | 'info'
export const useToast = () => useContext(ToastContext)

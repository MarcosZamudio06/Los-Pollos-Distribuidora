import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '../../lib/utils'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const SIDEBAR_STORAGE_KEY = 'pollos.ui.sidebar.open'
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

function readStoredSidebarState() {
  if (typeof window === 'undefined') {
    return true
  }

  const storedValue = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)

  if (storedValue === null) {
    return true
  }

  return storedValue === 'true'
}

export function AppShell() {
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(readStoredSidebarState)
  const desktopSidebarRef = useRef<HTMLDivElement | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(DESKTOP_MEDIA_QUERY).matches,
  )
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(desktopSidebarOpen))
  }, [desktopSidebarOpen])

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const handleChange = () => setIsDesktopViewport(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!desktopSidebarOpen) {
      return undefined
    }

    function handlePointerDown(event: PointerEvent) {
      const sidebarElement = desktopSidebarRef.current

      if (!sidebarElement || sidebarElement.contains(event.target as Node)) {
        return
      }

      setDesktopSidebarOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [desktopSidebarOpen])

  useEffect(() => {
    if (!mobileSidebarOpen) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileSidebarOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileSidebarOpen])

  return (
    <div className="erp-shell-bg min-h-screen text-[var(--erp-foreground)]">
      <div className="flex min-h-screen">
        <div
          className="sticky top-0 z-30 hidden h-dvh self-start md:block"
          onMouseEnter={() => setDesktopSidebarOpen(true)}
          onMouseLeave={() => setDesktopSidebarOpen(false)}
          ref={desktopSidebarRef}
        >
          <Sidebar collapsed={!desktopSidebarOpen} />
        </div>

        <AnimatePresence>
          {mobileSidebarOpen && (
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-50 bg-[rgba(17,24,21,0.58)] backdrop-blur-sm md:hidden"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            >
              <button
                aria-label="Cerrar capa del menú"
                className="absolute inset-0 h-full w-full cursor-default"
                onClick={() => setMobileSidebarOpen(false)}
                type="button"
              />
              <motion.div
                animate={{ x: 0 }}
                aria-label="Menú de navegación"
                aria-modal="true"
                className="relative h-full w-72 max-w-[88vw]"
                exit={{ x: '-100%' }}
                initial={{ x: '-100%' }}
                role="dialog"
                transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: 'easeOut' }}
              >
                <Sidebar onNavigate={() => setMobileSidebarOpen(false)} variant="mobile" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            onMenuClick={() => {
              if (window.matchMedia(DESKTOP_MEDIA_QUERY).matches) {
                setDesktopSidebarOpen((isOpen) => !isOpen)
                return
              }

              setMobileSidebarOpen((isOpen) => !isOpen)
            }}
            sidebarOpen={isDesktopViewport ? desktopSidebarOpen : mobileSidebarOpen}
          />

          <main className={cn('min-w-0 flex-1')} id="app-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

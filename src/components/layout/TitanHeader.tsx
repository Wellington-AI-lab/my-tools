'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MODULES } from '@/config/modules'
import { useEffect, useState } from 'react'

export function TitanHeader() {
  const pathname = usePathname()
  const [role, setRole] = useState<string>('user')

  useEffect(() => {
    // Fetch user role from session
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setRole(data?.user?.role ?? 'user'))
      .catch(() => setRole('user'))
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {}
    window.location.href = '/login'
  }

  return (
    <header className="titan-header">
      <div className="titan-container">
        <div className="titan-header-inner">
          {/* Logo */}
          <Link href="/" className="titan-logo">
            <span>my tools</span>
          </Link>

          {/* Navigation */}
          {pathname !== '/' && (
            <nav className="titan-nav">
              {MODULES.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`titan-nav-item ${
                    pathname.startsWith(m.href) ? 'titan-nav-item-active' : ''
                  }`}
                >
                  {m.name}
                  {m.status && m.status !== 'stable' && (
                    <span className={`titan-badge titan-badge-${m.status}`}>
                      {m.status}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          )}

          {/* Actions */}
          <div className="titan-header-actions">
            <button
              onClick={handleLogout}
              className="titan-btn titan-btn-ghost titan-btn-sm"
              type="button"
            >
              登出
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        /* --- TITAN HEADER --- */
        .titan-header {
          position: sticky;
          top: 0;
          z-index: 200;
          background-color: #FFFFFF;
          border-bottom: 1px solid #E5E7EB;
        }

        .titan-container {
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 16px;
        }

        .titan-header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          height: 64px;
        }

        .titan-logo {
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #1F2937;
          text-decoration: none;
          white-space: nowrap;
        }

        .titan-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .titan-nav-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 16px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #6B7280;
          text-decoration: none;
          border-radius: 9999px;
          transition: all 150ms cubic-bezier(0.33, 1, 0.68, 1);
          white-space: nowrap;
        }

        .titan-nav-item:hover {
          color: #1F2937;
          background-color: #FAFAFA;
        }

        .titan-nav-item-active {
          color: #00B812;
          background-color: #E8F5E9;
        }

        .titan-badge {
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .titan-badge-beta {
          background-color: #FEF3C7;
          color: #D97706;
        }

        .titan-badge-alpha {
          background-color: #FEE2E2;
          color: #DC2626;
        }

        .titan-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .titan-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 16px;
          height: 36px;
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: 9999px;
          border: none;
          cursor: pointer;
          transition: all 150ms;
        }

        .titan-btn-ghost {
          background: transparent;
          color: #6B7280;
        }

        .titan-btn-ghost:hover {
          background-color: #FAFAFA;
          color: #1F2937;
        }

        .titan-btn-sm {
          height: 32px;
          padding: 0 12px;
          font-size: 0.8125rem;
        }

        /* --- TITAN MAIN --- */
        .titan-main {
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px 16px;
        }

        .titan-wrapper {
          min-height: 100vh;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .titan-nav {
            display: none;
          }

          .titan-main {
            padding: 16px 12px;
          }
        }
      `}</style>
    </header>
  )
}

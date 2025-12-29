'use client'

import Link from 'next/link'
import type { ModuleDef } from '@/config/modules'
import { useState, useEffect } from 'react'

export function ModuleCard({ module }: { module: ModuleDef }) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setIsAdmin(data?.user?.role === 'admin'))
      .catch(() => setIsAdmin(false))
  }, [])

  // Hide admin-only modules for non-admin users
  if (module.adminOnly && !isAdmin) {
    return null
  }

  const statusColors = {
    stable: 'bg-green-100 text-green-700 border-green-300',
    beta: 'bg-red-100 text-red-700 border-red-300',
    alpha: 'bg-gray-100 text-gray-700 border-gray-300',
  }

  return (
    <Link
      href={module.href}
      className="block glass-effect rounded-xl p-5 card-hover"
      target={module.external ? '_blank' : undefined}
      rel={module.external ? 'noopener noreferrer' : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-onekey-text-primary">{module.name}</h3>
            {module.status && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[module.status] || statusColors.alpha}`}
              >
                {module.status}
              </span>
            )}
          </div>
          {module.description && (
            <p className="mt-2 text-sm text-onekey-text-secondary leading-relaxed">
              {module.description}
            </p>
          )}
        </div>
        <div className="shrink-0 text-onekey-accent-green font-bold">
          {module.external ? '↗' : '→'}
        </div>
      </div>
    </Link>
  )
}

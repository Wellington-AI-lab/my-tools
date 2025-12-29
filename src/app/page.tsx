import { MODULES } from '@/config/modules'
import { ModuleCard } from '@/components/ModuleCard'

export default function HomePage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {MODULES.map((m) => (
        <ModuleCard key={m.id} module={m} />
      ))}
    </div>
  )
}

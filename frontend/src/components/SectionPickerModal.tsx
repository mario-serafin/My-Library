import { BookOpen } from 'lucide-react'

interface Section {
  id: number
  name: string
  description?: string
  genres?: string
}

interface Props {
  sections: Section[]
  onSelect: (id: number) => void
  onDismiss: () => void
}

export default function SectionPickerModal({ sections, onSelect, onDismiss }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="text-blue-600" size={24} />
          <h2 className="text-lg font-semibold">Choose your active section</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Books you add will go to this section by default.
        </p>
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <p className="font-medium text-gray-900">{s.name}</p>
              {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
              {s.genres && <p className="text-xs text-blue-500 mt-0.5">{s.genres}</p>}
            </button>
          ))}
        </div>
        <button onClick={onDismiss} className="mt-4 text-sm text-gray-400 hover:text-gray-600 w-full text-center">
          Skip for now
        </button>
      </div>
    </div>
  )
}

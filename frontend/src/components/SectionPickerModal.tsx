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
    <div className="modal-backdrop z-50">
      <div className="modal-panel max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="text-brand-600" size={24} />
          <h2 className="font-serif text-xl font-semibold">Scegli la sezione attiva</h2>
        </div>
        <p className="text-sm text-stone-500 mb-4">
          I libri che aggiungi finiranno in questa sezione come impostazione predefinita.
        </p>
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="text-left px-4 py-3 rounded-xl border border-stone-200 hover:border-brand-400 hover:bg-brand-50 transition-colors"
            >
              <p className="font-medium text-stone-900">{s.name}</p>
              {s.description && <p className="text-xs text-stone-500 mt-0.5">{s.description}</p>}
              {s.genres && <p className="text-xs text-brand-600 mt-0.5">{s.genres}</p>}
            </button>
          ))}
        </div>
        <button onClick={onDismiss} className="mt-4 text-sm text-stone-400 hover:text-stone-600 w-full text-center">
          Salta per ora
        </button>
      </div>
    </div>
  )
}

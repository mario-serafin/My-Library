import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Check, ImageOff, Link as LinkIcon } from 'lucide-react'
import { searchCovers } from '../api/client'

interface CoverCandidate {
  url: string
  source: string
  language?: string
  edition?: string
}

interface Props {
  title: string
  author: string
  isbn: string
  current?: string
  onSelect: (url: string) => void
  onClose: () => void
}

export default function CoverPicker({ title, author, isbn, current, onSelect, onClose }: Props) {
  const [chosen, setChosen] = useState<string | null>(current ?? null)
  const [manualUrl, setManualUrl] = useState('')
  const [failed, setFailed] = useState<Set<string>>(new Set())

  const { data: covers = [], isLoading } = useQuery({
    queryKey: ['covers', title, author, isbn],
    queryFn: () => searchCovers(title, author, isbn).then((r) => r.data),
    enabled: !!(title || isbn),
    staleTime: 5 * 60_000,
  })

  const visible = (covers as CoverCandidate[]).filter((c) => !failed.has(c.url))

  const markFailed = (url: string) =>
    setFailed((prev) => new Set(prev).add(url))

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Scegli copertina</h2>
            <p className="text-xs text-gray-500">Edizioni e lingue diverse trovate online</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 p-6">
          {isLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ImageOff size={40} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nessuna copertina trovata.</p>
              <p className="text-xs mt-1">Puoi incollare un URL manualmente qui sotto.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {visible.map((c) => {
                const isSel = chosen === c.url
                return (
                  <button
                    key={c.url}
                    onClick={() => setChosen(c.url)}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                      isSel ? 'border-blue-600 ring-2 ring-blue-200' : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <div className="aspect-[2/3] bg-gray-100">
                      <img
                        src={c.url}
                        alt="cover"
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={() => markFailed(c.url)}
                      />
                    </div>
                    {isSel && (
                      <div className="absolute top-1 right-1 bg-blue-600 text-white rounded-full p-0.5">
                        <Check size={14} />
                      </div>
                    )}
                    {c.language && (
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] py-0.5 text-center truncate px-1">
                        {c.language}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Manual URL */}
          <div className="mt-6 border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
              <LinkIcon size={12} /> Oppure incolla l'URL di un'immagine
            </label>
            <div className="flex gap-2">
              <input
                className="input text-sm"
                placeholder="https://…/cover.jpg"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
              />
              <button
                onClick={() => manualUrl.trim() && setChosen(manualUrl.trim())}
                disabled={!manualUrl.trim()}
                className="btn-secondary text-sm whitespace-nowrap"
              >
                Usa URL
              </button>
            </div>
            {chosen === manualUrl.trim() && manualUrl.trim() && (
              <p className="text-xs text-blue-600 mt-1.5">URL selezionato ✓</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            {chosen && (
              <>
                <span className="text-xs text-gray-500">Anteprima:</span>
                <img src={chosen} alt="preview" className="h-12 w-8 object-cover rounded border border-gray-200" />
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Annulla</button>
            <button
              onClick={() => chosen && onSelect(chosen)}
              disabled={!chosen}
              className="btn-primary text-sm"
            >
              <Check size={15} /> Usa questa copertina
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

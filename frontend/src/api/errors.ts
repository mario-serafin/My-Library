// Traduce un errore di rete/API in un messaggio italiano da mostrare all'utente.
type ApiError = {
  response?: { status?: number; data?: { detail?: unknown } }
  request?: unknown
}

export function apiStatus(err: unknown): number | undefined {
  return (err as ApiError)?.response?.status
}

export function errorMessage(err: unknown, fallback: string): string {
  const e = err as ApiError
  if (!e?.response) {
    return e?.request ? 'Server non raggiungibile. Controlla la connessione e riprova.' : fallback
  }
  const detail = e.response.data?.detail
  // Il backend restituisce già messaggi in italiano
  if (typeof detail === 'string' && detail.trim()) return detail
  // Errori di validazione FastAPI (422): lista di oggetti
  if (Array.isArray(detail)) return 'Alcuni dati non sono validi. Controlla i campi e riprova.'

  switch (e.response.status) {
    case 401: return 'Sessione scaduta: effettua di nuovo l\'accesso.'
    case 403: return 'Non hai i permessi per questa operazione.'
    case 404: return 'Elemento non trovato.'
    case 409: return 'Elemento già presente.'
    case 413: return 'File troppo grande.'
    case 502:
    case 503:
    case 504: return 'Il server non risponde al momento. Riprova tra poco.'
    default: return fallback
  }
}

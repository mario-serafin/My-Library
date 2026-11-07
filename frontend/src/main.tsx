import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            borderRadius: '14px',
            background: '#1c1917',
            color: '#fafaf9',
            fontSize: '14px',
            padding: '10px 14px',
          },
          success: { iconTheme: { primary: '#5f9f8b', secondary: '#fafaf9' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#fafaf9' } },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>
)

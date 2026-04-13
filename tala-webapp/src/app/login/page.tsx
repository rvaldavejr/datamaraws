'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', {
      username,
      password,
      redirect: false,
    })

    if (res?.ok) {
      router.push('/dashboard')
    } else {
      setError('Invalid credentials. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        // Logo / title
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-red-700 flex items-center
                          justify-center text-xl font-bold font-mono mx-auto mb-4">
            T
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Project TALA</h1>
          <p className="text-slate-400 text-sm font-mono">
            Poverty Incidence Estimation · Philippines 2025
          </p>
        </div>

        // Form
        <form onSubmit={handleSubmit}
              className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
          <div>
            <label className="block font-mono text-xs text-slate-400 uppercase
                              tracking-wider mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded px-3
                         py-2.5 text-sm text-white font-mono placeholder-slate-500
                         focus:outline-none focus:border-slate-500 transition-colors"
              placeholder="username"
            />
          </div>

          <div>
            <label className="block font-mono text-xs text-slate-400 uppercase
                              tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded px-3
                         py-2.5 text-sm text-white font-mono placeholder-slate-500
                         focus:outline-none focus:border-slate-500 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-red-400 text-xs font-mono bg-red-950/40
                            border border-red-900/50 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-700 hover:bg-red-600 disabled:opacity-50
                       disabled:cursor-not-allowed text-white font-mono text-sm
                       py-2.5 rounded transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-slate-600 text-xs font-mono mt-4">
          FEU Institute of Technology · BS CS Data Science · 2026
        </p>
      </div>
    </div>
  )
}
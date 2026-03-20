'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const supabase = createClient()

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError('Googleログインに失敗しました。Supabaseの設定を確認してください。')
      setLoading(false)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else window.location.href = '/map'
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) setError(error.message)
      else setMessage('確認メールを送信しました。メールをご確認ください。')
    }

    setLoading(false)
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Google Login */}
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 border border-gray-300 rounded-xl px-4 py-3 font-medium hover:bg-gray-50 transition disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Googleでログイン
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/20" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-3 bg-black/60 text-white/50 rounded">または</span>
        </div>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={handleEmailAuth} className="space-y-3">
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 outline-none focus:border-white/60 transition"
        />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 outline-none focus:border-white/60 transition"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {message && <p className="text-green-400 text-sm">{message}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-black rounded-xl px-4 py-3 font-semibold hover:bg-white/90 transition disabled:opacity-50"
        >
          {loading ? '処理中...' : mode === 'login' ? 'ログイン' : 'アカウント作成'}
        </button>
      </form>

      <p className="text-center text-white/50 text-sm">
        {mode === 'login' ? 'アカウントをお持ちでない方は' : 'すでにアカウントをお持ちの方は'}
        {' '}
        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setMessage(null) }}
          className="text-white underline hover:text-white/80 transition"
        >
          {mode === 'login' ? '新規登録' : 'ログイン'}
        </button>
      </p>
    </div>
  )
}

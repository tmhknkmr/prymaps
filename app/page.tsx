import AuthForm from '@/components/AuthForm'

export default function LandingPage() {
  return (
    <main className="relative h-full flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0f]">
      {/* Background gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[300px] bg-purple-600/10 rounded-full blur-[100px]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-10 px-6">
        {/* Logo */}
        <div className="text-center space-y-3">
          <h1
            className="text-7xl font-black text-white"
            style={{ letterSpacing: '-0.05em' }}
          >
            PRY
          </h1>
          <p className="text-white/40 text-xs tracking-[0.3em] uppercase">
            A place remembers you.
          </p>
        </div>

        {/* Description */}
        <p className="text-white/50 text-center text-sm max-w-xs leading-relaxed">
          写真を地図に紐づけて、
          <br />
          あなただけの記憶の地図をつくる。
        </p>

        {/* Auth Form */}
        <AuthForm />
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 text-white/20 text-xs">
        PRY MVP · prymaps.com
      </p>
    </main>
  )
}

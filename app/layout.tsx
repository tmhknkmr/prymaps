import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PRY — A place remembers you.',
  description: '写真を地図上に紐づけてアーカイブするwebサービス。',
  openGraph: {
    title: 'PRY — A place remembers you.',
    description: '写真を地図上に紐づけてアーカイブするwebサービス。',
    siteName: 'PRY',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,    // スマホブラウザの自動ズームを防ぐ
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className="h-full overflow-hidden">
      <body className="h-full overflow-hidden bg-[#0a0a0f] text-white antialiased">{children}</body>
    </html>
  )
}

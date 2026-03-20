import type { Metadata } from 'next'
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full bg-[#0a0a0f] text-white antialiased">{children}</body>
    </html>
  )
}

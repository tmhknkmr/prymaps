import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json([], { status: 400 })

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&accept-language=ja`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'PRY/1.0 (prymaps.com)',
        'Accept-Language': 'ja',
      },
      next: { revalidate: 60 }, // 同じ検索は60秒キャッシュ
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}

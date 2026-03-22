'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import LayerPanel from '@/components/LayerPanel'
import PhotoUploadModal from '@/components/PhotoUploadModal'
import PhotoDetailModal from '@/components/PhotoDetailModal'
import PublicUsersPanel from '@/components/PublicUsersPanel'
import { exportArchiveZip } from '@/lib/export'
import type { Layer, Photo, Profile, Archive, MapViewSettings } from '@/types/database'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

interface PhotoWithMeta extends Photo {
  layer: Layer
  profile: Profile
}

interface Props {
  userId: string
  archive: Archive | null
  initialLayers: Layer[]
  mapSettings: MapViewSettings | null
  profile: Profile | null
}

type PanelTab = 'layers' | 'discover' | null

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
}

export default function MapClient({ userId, archive, initialLayers, mapSettings, profile }: Props) {
  const [layers, setLayers] = useState<Layer[]>(initialLayers)
  const [photos, setPhotos] = useState<PhotoWithMeta[]>([])
  const [visibleLayerIds, setVisibleLayerIds] = useState<Set<string>>(
    new Set(initialLayers.map(l => l.id))
  )
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(
    new Set(mapSettings?.hidden_user_ids || [])
  )
  const [activePanel, setActivePanel] = useState<PanelTab>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null)
  const [pinMode, setPinMode] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoWithMeta | null>(null)
  const [exporting, setExporting] = useState(false)
  const [geoCenter, setGeoCenter] = useState<[number, number] | null>(null)

  // 「写真を先に選ぶ」フロー
  const [showFlowMenu, setShowFlowMenu] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  // 複数写真キュー
  const [photoQueue, setPhotoQueue] = useState<File[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [queuePreviews, setQueuePreviews] = useState<string[]>([])

  const photoFirstInputRef = useRef<HTMLInputElement>(null)

  // 場所検索
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  // flyTo（検索・現在地ボタン用）
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)

  const saveSettingsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinModeRef = useRef(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // pinModeRef を同期更新するラッパー
  const setPinModeSync = useCallback((val: boolean) => {
    pinModeRef.current = val
    setPinMode(val)
  }, [])

  // 初回ジオロケーション（保存済み設定がなければ現在地へ）
  useEffect(() => {
    if (mapSettings) return
    navigator.geolocation?.getCurrentPosition(
      pos => setGeoCenter([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    )
  }, [mapSettings])

  // 検索ドロップダウンの外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchLayers = useCallback(async () => {
    const { data } = await supabase
      .from('layers')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
    if (data) {
      const typedData = data as Layer[]
      setLayers(typedData)
      setVisibleLayerIds(prev => {
        const next = new Set(prev)
        typedData.forEach(l => { if (!next.has(l.id)) next.add(l.id) })
        return next
      })
    }
  }, [userId, supabase])

  const fetchPhotos = useCallback(async () => {
    try {
      const myLayerIds = layers.map(l => l.id)

      let ownPhotos: PhotoWithMeta[] = []
      if (myLayerIds.length > 0) {
        const { data: myData } = await supabase
          .from('photos')
          .select('*')
          .in('layer_id', myLayerIds)

        if (myData) {
          const typedMyData = myData as Photo[]
          const layerMap = new Map(layers.map(l => [l.id, l]))
          ownPhotos = typedMyData
            .filter(p => visibleLayerIds.has(p.layer_id))
            .map(p => ({
              ...p,
              layer: layerMap.get(p.layer_id)!,
              profile: profile!,
            }))
            .filter(p => p.layer)
        }
      }

      type PublicPhotoRow = Photo & { layers: Layer; profiles: Profile }
      const { data: publicRaw } = await supabase
        .from('photos')
        .select(`*, layers!photos_layer_id_fkey(*), profiles!photos_user_id_fkey(*)`)
        .eq('is_public', true)
        .neq('user_id', userId)

      const publicData = publicRaw as unknown as PublicPhotoRow[]

      let publicPhotos: PhotoWithMeta[] = []
      if (publicData) {
        publicPhotos = publicData
          .filter(p => p.layers?.is_public && !hiddenUserIds.has(p.user_id))
          .map(p => ({
            ...p,
            layer: p.layers,
            profile: p.profiles,
          }))
      }

      setPhotos([...ownPhotos, ...publicPhotos])
    } catch (e) {
      console.error('fetchPhotos error:', e)
    }
  }, [layers, visibleLayerIds, hiddenUserIds, userId, profile, supabase])

  useEffect(() => { fetchPhotos() }, [fetchPhotos])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (pinModeRef.current) {
      setPinModeSync(false)
      setPendingPin({ lat, lng })
      // pendingFiles があれば「写真先行フロー」、なければ「位置先行フロー」
      setTimeout(() => setShowUpload(true), 0)
    }
  }, [setPinModeSync])

  const handleMoveEnd = useCallback((lat: number, lng: number, zoom: number) => {
    if (saveSettingsTimeout.current) clearTimeout(saveSettingsTimeout.current)
    saveSettingsTimeout.current = setTimeout(async () => {
      await supabase.from('map_view_settings').upsert({
        user_id: userId,
        center_lat: lat,
        center_lng: lng,
        zoom,
      })
    }, 1000)
  }, [userId, supabase])

  const handleToggleLayer = useCallback((id: string) => {
    setVisibleLayerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleToggleUser = useCallback((uid: string) => {
    setHiddenUserIds(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      supabase.from('map_view_settings').update({
        hidden_user_ids: Array.from(next),
      }).eq('user_id', userId).then(() => {})
      return next
    })
  }, [userId, supabase])

  const handleExport = async () => {
    setExporting(true)
    try {
      const myLayerIds = layers.map(l => l.id)
      const layerMap = new Map(layers.map(l => [l.id, l]))
      const { data } = await supabase.from('photos').select('*').in('layer_id', myLayerIds)
      if (data) {
        await exportArchiveZip(
          data.map(p => ({
            ...p,
            layer_name: layerMap.get(p.layer_id)?.name || 'Unknown',
            layer_color: layerMap.get(p.layer_id)?.color || '#6366f1',
          })),
          archive?.name || 'My Archive'
        )
      }
    } finally {
      setExporting(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  // キューの1枚を処理（GPS判定 → fly → モーダル or ピンモード）
  const processQueuePhoto = useCallback(async (queue: File[], idx: number) => {
    const file = queue[idx]
    setPendingFiles([file])
    setPendingPin(null)

    const { extractExif } = await import('@/lib/image')
    const exif = await extractExif(file)

    if (exif.lat !== null && exif.lng !== null) {
      setPendingPin({ lat: exif.lat, lng: exif.lng })
      setFlyToTarget({ lat: exif.lat, lng: exif.lng, zoom: 15 })
      setTimeout(() => setShowUpload(true), 1300)
    } else {
      setPinModeSync(true)
    }
  }, [setPinModeSync])

  // キューをクリアして操作を終了
  const clearQueue = useCallback(() => {
    setPhotoQueue([])
    setQueueIndex(0)
    setQueuePreviews(prev => { prev.forEach(u => URL.revokeObjectURL(u)); return [] })
    setPendingFiles([])
    setPendingPin(null)
    setPinModeSync(false)
    setShowUpload(false)
  }, [setPinModeSync])

  // 「写真を先に選ぶ」フロー — 複数選択対応（最大20枚）
  const handlePhotoFirstSelect = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/')).slice(0, 20)
    if (arr.length === 0) return
    setShowFlowMenu(false)

    if (arr.length === 1) {
      // 1枚: 従来フロー
      setPendingFiles(arr)
      const { extractExif } = await import('@/lib/image')
      const exif = await extractExif(arr[0])
      if (exif.lat !== null && exif.lng !== null) {
        setPendingPin({ lat: exif.lat, lng: exif.lng })
        setFlyToTarget({ lat: exif.lat, lng: exif.lng, zoom: 15 })
        setTimeout(() => setShowUpload(true), 1300)
      } else {
        setPinModeSync(true)
      }
    } else {
      // 複数枚: キューに積んで1枚ずつ処理
      const previews = arr.map(f => URL.createObjectURL(f))
      setPhotoQueue(arr)
      setQueuePreviews(previews)
      setQueueIndex(0)
      await processQueuePhoto(arr, 0)
    }
  }, [setPinModeSync, processQueuePhoto])

  // 場所検索（Nominatim / OSM）
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setShowResults(false)
    try {
      // サーバーサイドAPIルート経由（Nominatimへの直接fetchはブラウザでUser-Agent不可）
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`)
      const data: NominatimResult[] = await res.json()
      setSearchResults(data)
      setShowResults(true)
    } catch {
      // silent
    } finally {
      setSearching(false)
    }
  }

  const handleSearchSelect = (result: NominatimResult) => {
    setFlyToTarget({ lat: parseFloat(result.lat), lng: parseFloat(result.lon), zoom: 14 })
    setSearchQuery(result.display_name.split(',')[0])
    setShowResults(false)
    setSearchResults([])
  }

  // 現在地ボタン
  const handleLocate = () => {
    navigator.geolocation?.getCurrentPosition(
      pos => setFlyToTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 15 }),
      () => alert('現在地を取得できませんでした。ブラウザの位置情報を許可してください。')
    )
  }

  const displayedPhotos = photos.filter(p => p.lat !== null && p.lng !== null)

  // パネルコンテンツ（デスクトップサイドバー・モバイルシート共用）
  const panelContent = (
    <div className="p-4">
      {activePanel === 'layers' && (
        archive
          ? <LayerPanel
              layers={layers}
              archiveId={archive.id}
              userId={userId}
              onLayersChange={fetchLayers}
              visibleLayerIds={visibleLayerIds}
              onToggleLayer={handleToggleLayer}
            />
          : <p className="text-white/30 text-xs">アーカイブを読み込み中...</p>
      )}
      {activePanel === 'discover' && (
        <PublicUsersPanel
          currentUserId={userId}
          hiddenUserIds={hiddenUserIds}
          onToggleUser={handleToggleUser}
        />
      )}
    </div>
  )

  // 既存ピンからの「この場所に投稿」
  const handlePostAtLocation = useCallback((lat: number, lng: number) => {
    if (layers.length === 0) {
      alert('まずレイヤを作成してください')
      setActivePanel('layers')
      return
    }
    setPendingPin({ lat, lng })
    setPendingFiles([])
    setShowUpload(true)
  }, [layers])

  // FABクリックハンドラ
  const handleFabClick = () => {
    if (pinMode) { setPinModeSync(false); setPendingFiles([]); return }
    if (layers.length === 0) {
      alert('まずレイヤを作成してください')
      setActivePanel('layers')
      return
    }
    setShowFlowMenu(v => !v)
  }

  return (
    <div className="relative w-full h-full flex flex-col md:flex-row overflow-hidden">

      {/* ── マップエリア ── */}
      <div className="flex-1 relative min-h-0">
        <MapView
          photos={displayedPhotos}
          onMapClick={handleMapClick}
          onPostAtLocation={handlePostAtLocation}
          onPhotoClick={setSelectedPhoto}
          center={mapSettings ? [mapSettings.center_lat, mapSettings.center_lng] : (geoCenter ?? [35.6812, 139.7671])}
          zoom={mapSettings?.zoom || 12}
          onMoveEnd={handleMoveEnd}
          pendingPin={pendingPin}
          pinMode={pinMode}
          flyToTarget={flyToTarget}
          onFlyToHandled={() => setFlyToTarget(null)}
        />

        {/* 場所検索バー（モバイル: 全幅、デスクトップ: 固定幅） */}
        <div
          ref={searchRef}
          className="absolute top-4 left-4 right-20 md:right-auto"
          style={{ zIndex: 1000 }}
        >
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1 md:flex-none">
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setShowResults(false) }}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                placeholder="場所を検索..."
                className="w-full md:w-52 pl-4 pr-9 rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none"
                style={{ background: 'rgba(255,255,255,0.96)', boxShadow: '0 2px 16px rgba(0,0,0,0.14)', height: '42px' }}
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-base">
                {searching ? '…' : '⌕'}
              </button>
            </div>
            <button
              type="button"
              onClick={handleLocate}
              className="flex items-center gap-1.5 rounded-xl flex-shrink-0 transition px-3"
              style={{ height: '42px', background: 'rgba(255,255,255,0.96)', boxShadow: '0 2px 16px rgba(0,0,0,0.14)', color: '#374151' }}
              title="現在地へ"
            >
              {/* 現在地アイコン（GPS矢印） */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
              </svg>
              <span className="text-xs font-medium hidden sm:inline">現在地</span>
            </button>
          </form>

          {showResults && searchResults.length > 0 && (
            <div className="mt-1.5 rounded-xl overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.15)', maxHeight: '220px', overflowY: 'auto' }}>
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => handleSearchSelect(r)}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                  <span className="font-medium text-gray-800">{r.display_name.split(',')[0]}</span>
                  <span className="text-gray-400 ml-1">{r.display_name.split(',').slice(1, 3).join(',')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 写真先行フロー用隠しファイル入力 */}
        <input ref={photoFirstInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => handlePhotoFirstSelect(e.target.files)} />

        {/* FAB — モバイル: 右上（検索横）、デスクトップ: 右上 */}
        <button
          onClick={handleFabClick}
          className="absolute top-4 right-4 flex items-center gap-2 rounded-xl font-medium text-sm transition"
          style={{
            zIndex: 1000,
            padding: '0 14px',
            height: '42px',
            background: pinMode ? '#6366f1' : 'rgba(255,255,255,0.96)',
            color: pinMode ? 'white' : '#1f2937',
            boxShadow: '0 2px 16px rgba(0,0,0,0.14)',
            whiteSpace: 'nowrap',
          }}
        >
          {pinMode ? '✕' : '＋'}
          <span className="hidden sm:inline">{pinMode ? ' キャンセル' : ' 写真を置く'}</span>
        </button>

        {/* フロー選択メニュー */}
        {showFlowMenu && !pinMode && (
          <div className="absolute top-[60px] right-4 rounded-2xl overflow-hidden"
            style={{ zIndex: 1000, background: 'rgba(17,17,24,0.97)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', minWidth: '200px' }}>
            <button onClick={() => { setShowFlowMenu(false); setPendingFiles([]); setPinModeSync(true) }}
              className="w-full text-left px-5 py-4 text-sm text-white/80 hover:bg-white/5 transition border-b border-white/10">
              <p className="font-medium">📍 位置を先に指定</p>
              <p className="text-white/35 text-xs mt-0.5">地図をタップ → 写真を選択</p>
            </button>
            <button onClick={() => { setShowFlowMenu(false); photoFirstInputRef.current?.click() }}
              className="w-full text-left px-5 py-4 text-sm text-white/80 hover:bg-white/5 transition">
              <p className="font-medium">🖼 写真を先に選ぶ</p>
              <p className="text-white/35 text-xs mt-0.5">写真を選択 → 地図に置く</p>
            </button>
          </div>
        )}

        {/* ピンモード案内 — モバイルはボトムバーの上に表示 */}
        {pinMode && (
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none bottom-[72px] md:bottom-10" style={{ zIndex: 1000 }}>
            <div className="text-white text-sm px-6 py-3 rounded-full" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}>
              {pendingFiles.length > 0 ? `📷 ${pendingFiles.length}枚を置く場所をタップ` : '写真を置く場所をタップ'}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════
          デスクトップ: 右サイドバー
      ══════════════════════════════════════ */}
      <div className="hidden md:flex w-72 bg-[#0c0c14]/95 border-l border-white/10 flex-col backdrop-blur-xl slide-in">
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black" style={{ letterSpacing: '-0.04em' }}>PRY</h1>
            <div className="flex items-center gap-2">
              {archive && (
                <button onClick={handleExport} disabled={exporting}
                  className="text-white/40 hover:text-white/80 text-xs transition disabled:opacity-50">
                  {exporting ? '...' : '↓ ZIP'}
                </button>
              )}
              <button onClick={handleSignOut} className="text-white/30 hover:text-white/60 text-xs transition">ログアウト</button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className="w-7 h-7 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
              {profile?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-xs text-white/40">{(profile?.display_name || '?')[0].toUpperCase()}</div>
              }
            </div>
            <div>
              <p className="text-xs font-medium text-white/80">{profile?.display_name || '匿名'}</p>
              <p className="text-xs text-white/30">{photos.filter(p => p.user_id === userId).length}枚の写真</p>
            </div>
          </div>
        </div>

        <div className="flex border-b border-white/10">
          {(['layers', 'discover'] as PanelTab[]).map(tab => (
            <button key={tab}
              onClick={() => setActivePanel(activePanel === tab ? null : tab)}
              className={`flex-1 py-2.5 text-xs font-medium transition ${activePanel === tab ? 'text-white border-b-2 border-indigo-400' : 'text-white/40 hover:text-white/70'}`}>
              {tab === 'layers' ? 'マイレイヤ' : 'みんなの写真'}
            </button>
          ))}
        </div>

        {panelContent}

        <div className="border-t border-white/10 p-4">
          <p className="text-white/30 text-xs mb-2">
            📍 {displayedPhotos.filter(p => p.user_id === userId).length} / {photos.filter(p => p.user_id === userId).length} 枚を表示中
          </p>
          {photos.filter(p => p.user_id === userId && (p.lat === null || p.lng === null)).slice(0, 3).map(p => (
            <div key={p.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-white/5 rounded px-1 transition" onClick={() => setSelectedPhoto(p)}>
              <div className="w-2 h-2 rounded-full bg-white/20 flex-shrink-0" />
              <span className="text-xs text-white/40 truncate">{p.title || p.filename}</span>
              <span className="text-xs text-white/20 flex-shrink-0">位置なし</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          モバイル: ボトムシート（パネル内容）
      ══════════════════════════════════════ */}
      <div
        className={`md:hidden fixed left-0 right-0 transition-transform duration-300 ease-out ${activePanel ? 'translate-y-0' : 'translate-y-full'}`}
        style={{
          bottom: '56px',
          maxHeight: '65vh',
          minHeight: '200px',
          background: 'rgba(10,10,18,0.98)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          overflowY: 'auto',
          zIndex: 2000,   // Leaflet(1000)・FAB(1000)より確実に上
        }}
      >
        {/* シートヘッダー：タイトル＋閉じるボタン */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-xs font-medium text-white/40">
            {activePanel === 'layers' ? 'マイレイヤ' : 'みんなの写真'}
          </span>
          <button
            onClick={() => setActivePanel(null)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white transition"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            ×
          </button>
        </div>
        {panelContent}
      </div>

      {/* ══════════════════════════════════════
          複数写真キュー進捗ストリップ
      ══════════════════════════════════════ */}
      {photoQueue.length > 1 && (
        <div
          className="fixed left-1/2 -translate-x-1/2 pointer-events-none"
          style={{ bottom: '72px', zIndex: 1500 }}
        >
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-2xl px-3 py-2.5"
            style={{ background: 'rgba(8,8,16,0.85)', backdropFilter: 'blur(12px)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
          >
            {/* 進捗テキスト */}
            <span className="text-xs tabular-nums mr-1" style={{ color: 'rgba(255,255,255,0.4)', minWidth: '2.8rem' }}>
              {queueIndex + 1} / {photoQueue.length}
            </span>

            {/* サムネイルストリップ */}
            {queuePreviews.map((preview, i) => (
              <div
                key={i}
                className="relative flex-shrink-0 overflow-hidden"
                style={{
                  width: i === queueIndex ? '44px' : '30px',
                  height: i === queueIndex ? '44px' : '30px',
                  borderRadius: '6px',
                  border: i === queueIndex ? '2px solid rgba(255,255,255,0.9)' : '1.5px solid rgba(255,255,255,0.15)',
                  opacity: i < queueIndex ? 0.3 : i === queueIndex ? 1 : 0.55,
                  transition: 'all 0.2s ease',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {/* 完了済みチェック */}
                {i < queueIndex && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>✓</span>
                  </div>
                )}
              </div>
            ))}

            {/* キャンセルボタン */}
            <button
              onClick={clearQueue}
              className="ml-1 flex-shrink-0 transition"
              style={{ color: 'rgba(255,255,255,0.25)', fontSize: '16px', lineHeight: 1, padding: '4px' }}
              title="キューをキャンセル"
            >✕</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          モバイル: ボトムナビゲーションバー
      ══════════════════════════════════════ */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-center"
        style={{ height: '56px', background: 'rgba(10,10,18,0.97)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: '16px', paddingRight: '16px', zIndex: 2001 }}
      >
        {/* ロゴ */}
        <h1 className="text-base font-black mr-4 flex-shrink-0" style={{ letterSpacing: '-0.04em' }}>PRY</h1>

        {/* タブ */}
        <div className="flex flex-1 justify-center gap-1">
          {(['layers', 'discover'] as PanelTab[]).map(tab => (
            <button key={tab}
              onClick={() => setActivePanel(activePanel === tab ? null : tab)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition"
              style={{
                color: activePanel === tab ? 'white' : 'rgba(255,255,255,0.35)',
                background: activePanel === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                minHeight: '36px',
              }}
            >
              {tab === 'layers' ? 'マイレイヤ' : 'みんなの写真'}
            </button>
          ))}
        </div>

        {/* サインアウト */}
        <button onClick={handleSignOut} className="text-xs flex-shrink-0 ml-2" style={{ color: 'rgba(255,255,255,0.2)', minHeight: '36px', padding: '0 4px' }}>
          ログアウト
        </button>
      </div>

      {showUpload && (
        <PhotoUploadModal
          layers={layers}
          defaultPin={pendingPin}
          userId={userId}
          initialFiles={pendingFiles.length > 0 ? pendingFiles : undefined}
          onClose={() => {
            setShowUpload(false)
            setPendingPin(null)
            setPendingFiles([])
            // キューがあればスキップして次へ
            if (photoQueue.length > 0) {
              const next = queueIndex + 1
              if (next < photoQueue.length) {
                setQueueIndex(next)
                processQueuePhoto(photoQueue, next)
              } else {
                clearQueue()
              }
            }
          }}
          onSuccess={async () => {
            setShowUpload(false)
            setPendingPin(null)
            setPendingFiles([])
            await fetchLayers()
            await fetchPhotos()
            // キューの次の写真へ
            if (photoQueue.length > 0) {
              const next = queueIndex + 1
              if (next < photoQueue.length) {
                setQueueIndex(next)
                await processQueuePhoto(photoQueue, next)
              } else {
                clearQueue()
              }
            }
          }}
          onPinChange={(lat, lng) => setPendingPin({ lat, lng })}
          onGpsDetected={(lat, lng) => {
            setPendingPin({ lat, lng })
            setFlyToTarget({ lat, lng, zoom: 15 })
          }}
        />
      )}

      {selectedPhoto && (
        <PhotoDetailModal
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          onUpdate={() => { fetchPhotos(); setSelectedPhoto(null) }}
          isOwner={selectedPhoto.user_id === userId}
        />
      )}
    </div>
  )
}

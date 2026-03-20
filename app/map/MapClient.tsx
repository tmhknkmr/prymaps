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
  const [activePanel, setActivePanel] = useState<PanelTab>('layers')
  const [showUpload, setShowUpload] = useState(false)
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null)
  const [pinMode, setPinMode] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoWithMeta | null>(null)
  const [exporting, setExporting] = useState(false)
  const [geoCenter, setGeoCenter] = useState<[number, number] | null>(null)

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

  // 場所検索（Nominatim / OSM）
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setShowResults(false)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=6&accept-language=ja`,
        { headers: { 'User-Agent': 'PRY/1.0 (prymaps.com)' } }
      )
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

  return (
    <div className="relative w-full h-full flex">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          photos={displayedPhotos}
          onMapClick={handleMapClick}
          onPhotoClick={setSelectedPhoto}
          center={mapSettings ? [mapSettings.center_lat, mapSettings.center_lng] : (geoCenter ?? [35.6812, 139.7671])}
          zoom={mapSettings?.zoom || 12}
          onMoveEnd={handleMoveEnd}
          pendingPin={pendingPin}
          pinMode={pinMode}
          flyToTarget={flyToTarget}
          onFlyToHandled={() => setFlyToTarget(null)}
        />

        {/* 場所検索バー */}
        <div
          ref={searchRef}
          className="absolute top-5 left-5"
          style={{ zIndex: 1000 }}
        >
          <form onSubmit={handleSearch} className="relative flex gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value)
                  if (!e.target.value) setShowResults(false)
                }}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                placeholder="場所を検索..."
                className="w-56 pl-4 pr-10 py-2.5 rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none"
                style={{
                  background: 'rgba(255,255,255,0.96)',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.14)',
                }}
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                style={{ fontSize: '16px' }}
              >
                {searching ? '…' : '⌕'}
              </button>
            </div>

            {/* 現在地ボタン */}
            <button
              type="button"
              onClick={handleLocate}
              className="flex items-center justify-center rounded-xl transition hover:scale-105"
              style={{
                width: '42px',
                height: '42px',
                background: 'rgba(255,255,255,0.96)',
                boxShadow: '0 2px 16px rgba(0,0,0,0.14)',
                fontSize: '18px',
                flexShrink: 0,
              }}
              title="現在地へ"
            >
              ◎
            </button>
          </form>

          {/* 検索結果ドロップダウン */}
          {showResults && searchResults.length > 0 && (
            <div
              className="mt-1.5 rounded-xl overflow-hidden"
              style={{
                background: 'white',
                boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                maxHeight: '240px',
                overflowY: 'auto',
                width: '280px',
              }}
            >
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => handleSearchSelect(r)}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition border-b border-gray-100 last:border-0"
                >
                  <span className="font-medium text-gray-800">{r.display_name.split(',')[0]}</span>
                  <span className="text-gray-400 ml-1">{r.display_name.split(',').slice(1, 3).join(',')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 写真を置くボタン */}
        <button
          onClick={() => {
            if (layers.length === 0) {
              alert('まずレイヤを作成してください')
              setActivePanel('layers')
              return
            }
            setPinModeSync(!pinMode)
          }}
          className="absolute top-5 right-5 flex items-center gap-2 rounded-xl font-medium text-sm transition"
          style={{
            zIndex: 1000,
            padding: '0 18px',
            height: '42px',
            background: pinMode ? '#6366f1' : 'rgba(255,255,255,0.96)',
            color: pinMode ? 'white' : '#1f2937',
            boxShadow: '0 2px 16px rgba(0,0,0,0.14)',
          }}
        >
          {pinMode ? '✕ キャンセル' : '＋ 写真を置く'}
        </button>

        {/* ピンモード中の案内 */}
        {pinMode && (
          <div
            className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{ zIndex: 1000 }}
          >
            <div
              className="text-white text-sm px-6 py-3 rounded-full"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
            >
              写真を置きたい場所をクリック
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-72 bg-[#0c0c14]/95 border-l border-white/10 flex flex-col backdrop-blur-xl slide-in">
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black tracking-tighter" style={{ letterSpacing: '-0.04em' }}>PRY</h1>
            <div className="flex items-center gap-2">
              {archive && (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="text-white/40 hover:text-white/80 text-xs transition disabled:opacity-50"
                  title="エクスポート"
                >
                  {exporting ? '...' : '↓ ZIP'}
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="text-white/30 hover:text-white/60 text-xs transition"
              >
                ログアウト
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="w-7 h-7 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-white/40">
                  {(profile?.display_name || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-white/80">{profile?.display_name || '匿名'}</p>
              <p className="text-xs text-white/30">{photos.filter(p => p.user_id === userId).length}枚の写真</p>
            </div>
          </div>
        </div>

        <div className="flex border-b border-white/10">
          {(['layers', 'discover'] as PanelTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActivePanel(activePanel === tab ? null : tab)}
              className={`flex-1 py-2.5 text-xs font-medium transition ${
                activePanel === tab
                  ? 'text-white border-b-2 border-indigo-400'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {tab === 'layers' ? 'マイレイヤ' : 'みんなの写真'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activePanel === 'layers' && archive && (
            <LayerPanel
              layers={layers}
              archiveId={archive.id}
              userId={userId}
              onLayersChange={fetchLayers}
              visibleLayerIds={visibleLayerIds}
              onToggleLayer={handleToggleLayer}
            />
          )}
          {activePanel === 'discover' && (
            <PublicUsersPanel
              currentUserId={userId}
              hiddenUserIds={hiddenUserIds}
              onToggleUser={handleToggleUser}
            />
          )}
        </div>

        <div className="border-t border-white/10 p-4">
          <p className="text-white/30 text-xs mb-2">
            📍 {displayedPhotos.filter(p => p.user_id === userId).length} /
            {photos.filter(p => p.user_id === userId).length} 枚が地図上に表示中
          </p>
          {photos.filter(p => p.user_id === userId && (p.lat === null || p.lng === null)).slice(0, 3).map(p => (
            <div
              key={p.id}
              className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-white/5 rounded px-1 transition"
              onClick={() => setSelectedPhoto(p)}
            >
              <div className="w-2 h-2 rounded-full bg-white/20 flex-shrink-0" />
              <span className="text-xs text-white/40 truncate">{p.title || p.filename}</span>
              <span className="text-xs text-white/20 flex-shrink-0">位置なし</span>
            </div>
          ))}
        </div>
      </div>

      {showUpload && (
        <PhotoUploadModal
          layers={layers}
          defaultPin={pendingPin}
          userId={userId}
          onClose={() => { setShowUpload(false); setPendingPin(null) }}
          onSuccess={async () => {
            setShowUpload(false)
            setPendingPin(null)
            await fetchLayers()
            await fetchPhotos()
          }}
          onPinChange={(lat, lng) => setPendingPin({ lat, lng })}
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

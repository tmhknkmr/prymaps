'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import type { Photo, Layer, Profile } from '@/types/database'
import { createClient } from '@/lib/supabase/client'

interface PhotoWithMeta extends Photo {
  layer: Layer
  profile: Profile
}

interface MapViewProps {
  photos: PhotoWithMeta[]
  onMapClick?: (lat: number, lng: number) => void
  onPhotoClick?: (photo: PhotoWithMeta) => void
  center?: [number, number]
  zoom?: number
  onMoveEnd?: (lat: number, lng: number, zoom: number) => void
  pendingPin?: { lat: number; lng: number } | null
  pinMode?: boolean
  flyToTarget?: { lat: number; lng: number; zoom?: number } | null
  onFlyToHandled?: () => void
}

export default function MapView({
  photos,
  onMapClick,
  onPhotoClick,
  center = [35.6812, 139.7671],
  zoom = 12,
  onMoveEnd,
  pendingPin,
  pinMode,
  flyToTarget,
  onFlyToHandled,
}: MapViewProps) {
  const mapRef = useRef<LeafletMap | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<Record<string, L.Marker>>({})
  const pendingMarkerRef = useRef<L.Marker | null>(null)
  const initializedRef = useRef(false)
  const supabase = createClient()

  const getPhotoUrl = useCallback((storagePath: string) => {
    const { data } = supabase.storage.from('photos').getPublicUrl(storagePath)
    return data.publicUrl
  }, [supabase])

  // Map initialization
  useEffect(() => {
    if (initializedRef.current) return
    if (!containerRef.current) return
    initializedRef.current = true

    const initMap = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (!containerRef.current || mapRef.current) return

      const el = containerRef.current as HTMLDivElement & { _leaflet_id?: number }
      if (el._leaflet_id) delete el._leaflet_id

      const map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: false,
      })

      // 衛星写真専用ペイン — フィルターをラベルと分離するため
      map.createPane('satellitePane')
      const satPaneEl = map.getPane('satellitePane')!
      satPaneEl.style.zIndex = '200'
      // 彩度を抑え・明度を上げて「透明感ある航空写真」に
      satPaneEl.style.filter = 'saturate(0.55) brightness(1.22) contrast(0.92)'

      // Esri World Imagery — 高品質衛星写真（完全無料・APIキー不要）
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri — Source: Esri, Maxar, GeoEye, Earthstar Geographics',
        maxZoom: 19,
        pane: 'satellitePane',
      }).addTo(map)

      // ラベルペイン — フィルターなしでクリアに表示
      map.createPane('labelPane')
      const labelPaneEl = map.getPane('labelPane')!
      labelPaneEl.style.zIndex = '450'

      // 地名・道路ラベルを衛星写真の上に重ねる
      L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: '',
        maxZoom: 19,
        opacity: 0.85,
        pane: 'labelPane',
      }).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      map.on('click', (e) => {
        onMapClick?.(e.latlng.lat, e.latlng.lng)
      })

      map.on('moveend', () => {
        const c = map.getCenter()
        onMoveEnd?.(c.lat, c.lng, map.getZoom())
      })

      mapRef.current = map
    }

    initMap().catch(console.error)

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      initializedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部からの flyTo（検索・現在地ボタン）
  useEffect(() => {
    if (!mapRef.current || !flyToTarget) return
    mapRef.current.flyTo([flyToTarget.lat, flyToTarget.lng], flyToTarget.zoom ?? 14, { duration: 1.2 })
    onFlyToHandled?.()
  }, [flyToTarget, onFlyToHandled])

  // center prop 変化時のフライ（初回ジオロケーション解決）
  const prevCenterRef = useRef<[number, number]>(center)
  useEffect(() => {
    if (!mapRef.current) return
    const [lat, lng] = center
    const [pLat, pLng] = prevCenterRef.current
    if (Math.abs(lat - pLat) > 0.0001 || Math.abs(lng - pLng) > 0.0001) {
      mapRef.current.flyTo([lat, lng], zoom, { duration: 1 })
      prevCenterRef.current = center
    }
  }, [center, zoom])

  // マーカー更新 — 写真サムネイルを地図に「置く」
  useEffect(() => {
    if (!mapRef.current) return

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default
      const map = mapRef.current
      if (!map) return

      const currentIds = new Set(photos.map(p => p.id))

      for (const [id, marker] of Object.entries(markersRef.current)) {
        if (!currentIds.has(id)) {
          marker.remove()
          delete markersRef.current[id]
        }
      }

      for (const photo of photos) {
        if (photo.lat == null || photo.lng == null) continue
        if (markersRef.current[photo.id]) continue

        const imgUrl = getPhotoUrl(photo.storage_path)
        const color = photo.layer?.color || '#6366f1'
        const takenDate = photo.taken_at
          ? new Date(photo.taken_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
          : ''

        // 写真が地図上に「佇む」サムネイルマーカー
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              width:52px;height:52px;
              border-radius:5px;
              overflow:hidden;
              border:2.5px solid rgba(255,255,255,0.95);
              box-shadow:0 4px 16px rgba(0,0,0,0.22),0 1px 4px rgba(0,0,0,0.14);
              background:#d1d5db;
              cursor:pointer;
            ">
              <img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy"/>
            </div>
          `,
          iconSize: [52, 52],
          iconAnchor: [26, 26],
          popupAnchor: [0, -32],
        })

        const marker = L.marker([photo.lat, photo.lng], { icon })

        marker.bindPopup(`
          <div style="width:220px;overflow:hidden;border-radius:12px;background:#13131f;">
            <div style="position:relative;">
              <img src="${imgUrl}" alt="" style="width:100%;height:140px;object-fit:cover;display:block;cursor:pointer;"
                onclick="window.__pryPhotoClick&&window.__pryPhotoClick('${photo.id}')"/>
            </div>
            <div style="padding:10px 12px;">
              <p style="font-size:13px;font-weight:600;color:white;margin:0 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${photo.title || photo.filename}
              </p>
              ${takenDate ? `<p style="font-size:11px;color:rgba(255,255,255,0.4);margin:0 0 2px;">${takenDate}</p>` : ''}
              <p style="font-size:11px;color:rgba(255,255,255,0.3);margin:0;">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:4px;vertical-align:middle;"></span>
                ${photo.layer?.name || ''}
              </p>
            </div>
          </div>
        `, { maxWidth: 240, minWidth: 220 })

        marker.addTo(map)
        markersRef.current[photo.id] = marker
      }
    }

    ;(window as unknown as Record<string, unknown>).__pryPhotoClick = (id: string) => {
      const photo = photos.find(p => p.id === id)
      if (photo && onPhotoClick) onPhotoClick(photo)
    }

    updateMarkers().catch(console.error)
  }, [photos, onPhotoClick, getPhotoUrl])

  // 配置中の仮ピン
  useEffect(() => {
    if (!mapRef.current) return

    const update = async () => {
      const L = (await import('leaflet')).default
      const map = mapRef.current
      if (!map) return

      pendingMarkerRef.current?.remove()
      pendingMarkerRef.current = null

      if (pendingPin) {
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              width:22px;height:22px;
              border-radius:4px;
              background:white;
              border:2.5px solid #6366f1;
              box-shadow:0 0 0 5px rgba(99,102,241,0.25),0 2px 10px rgba(0,0,0,0.3);
            "></div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        })
        pendingMarkerRef.current = L.marker([pendingPin.lat, pendingPin.lng], { icon }).addTo(map)
      }
    }

    update().catch(console.error)
  }, [pendingPin])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ cursor: pinMode ? 'crosshair' : undefined }}
    />
  )
}

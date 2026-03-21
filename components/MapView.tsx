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
  onPostAtLocation?: (lat: number, lng: number) => void
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
  onPostAtLocation,
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

      // ── レイヤ構成（下から順） ──────────────────────────────────────
      // 1. 衛星写真ベース (Esri World Imagery)
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
          maxZoom: 19,
        }
      ).addTo(map)

      // 2. 交通・道路レイヤ (Esri Reference/World_Transportation)
      //    衛星上に道路・鉄道路線を重ねる専用タイル（透明背景）
      map.createPane('transportPane')
      const transportPaneEl = map.getPane('transportPane')!
      transportPaneEl.style.zIndex = '300'

      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 0.8, pane: 'transportPane' }
      ).addTo(map)

      // 3. 地名・POIレイヤ (Esri Reference/World_Boundaries_and_Places)
      //    駅名・施設名・行政区域を透明背景で重ねる
      map.createPane('labelPane')
      const labelPaneEl = map.getPane('labelPane')!
      labelPaneEl.style.zIndex = '400'

      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 0.9, pane: 'labelPane' }
      ).addTo(map)

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

        // popup — ファイル名なし、日付・レイヤ・コメントのみ
        const desc = photo.description
          ? `<p style="font-size:11px;color:rgba(255,255,255,0.45);margin:4px 0 0;line-height:1.4;">${photo.description}</p>`
          : ''
        marker.bindPopup(`
          <div style="width:210px;overflow:hidden;border-radius:12px;background:#13131f;">
            <img src="${imgUrl}" alt="" style="width:100%;height:130px;object-fit:cover;display:block;cursor:pointer;"
              onclick="window.__pryPhotoClick&&window.__pryPhotoClick('${photo.id}')"/>
            <div style="padding:9px 11px 10px;">
              <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0;"></span>
                <span style="font-size:11px;color:rgba(255,255,255,0.35);">${photo.layer?.name || ''}</span>
                ${takenDate ? `<span style="font-size:11px;color:rgba(255,255,255,0.25);margin-left:auto;">${takenDate}</span>` : ''}
              </div>
              ${desc}
              <button
                onclick="event.stopPropagation();window.__pryPostAt&&window.__pryPostAt(${photo.lat},${photo.lng})"
                style="
                  margin-top:8px;width:100%;padding:5px 0;
                  background:rgba(255,255,255,0.06);
                  border:1px solid rgba(255,255,255,0.1);
                  border-radius:6px;
                  font-size:11px;color:rgba(255,255,255,0.5);
                  cursor:pointer;letter-spacing:0.02em;
                  transition:background 0.15s;
                "
                onmouseover="this.style.background='rgba(255,255,255,0.11)'"
                onmouseout="this.style.background='rgba(255,255,255,0.06)'"
              >＋ この場所に投稿</button>
            </div>
          </div>
        `, { maxWidth: 230, minWidth: 210, className: 'pry-popup' })

        marker.addTo(map)
        markersRef.current[photo.id] = marker
      }
    }

    ;(window as unknown as Record<string, unknown>).__pryPhotoClick = (id: string) => {
      const photo = photos.find(p => p.id === id)
      if (photo && onPhotoClick) onPhotoClick(photo)
    }
    ;(window as unknown as Record<string, unknown>).__pryPostAt = (lat: number, lng: number) => {
      onPostAtLocation?.(lat, lng)
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

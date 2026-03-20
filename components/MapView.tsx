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
}

export default function MapView({
  photos,
  onMapClick,
  onPhotoClick,
  center = [35.6812, 139.7671],
  zoom = 12,
  onMoveEnd,
  pendingPin,
}: MapViewProps) {
  const mapRef = useRef<LeafletMap | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<Record<string, L.Marker>>({})
  const pendingMarkerRef = useRef<L.Marker | null>(null)
  const supabase = createClient()

  const getPhotoUrl = useCallback((storagePath: string) => {
    const { data } = supabase.storage.from('photos').getPublicUrl(storagePath)
    return data.publicUrl
  }, [supabase])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const initMap = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      const map = L.map(containerRef.current!, {
        center,
        zoom,
        zoomControl: false,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      // Zoom control (bottom right)
      L.control.zoom({ position: 'bottomright' }).addTo(map)

      if (onMapClick) {
        map.on('click', (e) => {
          onMapClick(e.latlng.lat, e.latlng.lng)
        })
      }

      if (onMoveEnd) {
        map.on('moveend', () => {
          const c = map.getCenter()
          onMoveEnd(c.lat, c.lng, map.getZoom())
        })
      }

      mapRef.current = map
    }

    initMap()

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update markers when photos change
  useEffect(() => {
    if (!mapRef.current) return

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default
      const map = mapRef.current!

      const currentIds = new Set(photos.map(p => p.id))

      // Remove stale markers
      for (const [id, marker] of Object.entries(markersRef.current)) {
        if (!currentIds.has(id)) {
          marker.remove()
          delete markersRef.current[id]
        }
      }

      // Add new markers
      for (const photo of photos) {
        if (photo.lat === null || photo.lng === null) continue
        if (markersRef.current[photo.id]) continue

        const color = photo.layer.color || '#3B82F6'

        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              width: 28px; height: 28px;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              background: ${color};
              border: 2px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            "></div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -32],
        })

        const marker = L.marker([photo.lat, photo.lng], { icon })

        const imgUrl = getPhotoUrl(photo.storage_path)
        const takenDate = photo.taken_at
          ? new Date(photo.taken_at).toLocaleDateString('ja-JP')
          : ''

        marker.bindPopup(`
          <div style="width: 200px; padding: 0; overflow: hidden; border-radius: 10px;">
            <img
              src="${imgUrl}"
              alt="${photo.title || photo.filename}"
              style="width: 100%; height: 130px; object-fit: cover; display: block; cursor: pointer;"
              onclick="window.__pryPhotoClick && window.__pryPhotoClick('${photo.id}')"
            />
            <div style="padding: 10px 12px;">
              <p style="font-size: 13px; font-weight: 600; color: white; margin: 0 0 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${photo.title || photo.filename}
              </p>
              ${takenDate ? `<p style="font-size: 11px; color: rgba(255,255,255,0.4); margin: 0;">${takenDate}</p>` : ''}
              <p style="font-size: 11px; color: rgba(255,255,255,0.3); margin: 4px 0 0 0;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color}; margin-right: 4px;"></span>
                ${photo.layer.name}
              </p>
            </div>
          </div>
        `, {
          maxWidth: 220,
          minWidth: 200,
        })

        marker.addTo(map)
        markersRef.current[photo.id] = marker
      }
    }

    // Expose click handler globally
    ;(window as unknown as Record<string, unknown>).__pryPhotoClick = (id: string) => {
      const photo = photos.find(p => p.id === id)
      if (photo && onPhotoClick) onPhotoClick(photo)
    }

    updateMarkers()
  }, [photos, onPhotoClick, getPhotoUrl])

  // Pending pin (for upload mode)
  useEffect(() => {
    if (!mapRef.current) return

    const updatePendingPin = async () => {
      const L = (await import('leaflet')).default
      const map = mapRef.current!

      if (pendingMarkerRef.current) {
        pendingMarkerRef.current.remove()
        pendingMarkerRef.current = null
      }

      if (pendingPin) {
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              width: 20px; height: 20px;
              border-radius: 50%;
              background: white;
              border: 3px solid #3B82F6;
              box-shadow: 0 0 0 4px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.4);
            "></div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        })

        pendingMarkerRef.current = L.marker([pendingPin.lat, pendingPin.lng], { icon })
          .addTo(map)
      }
    }

    updatePendingPin()
  }, [pendingPin])

  return <div ref={containerRef} className="w-full h-full" />
}

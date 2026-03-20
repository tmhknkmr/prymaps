import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/client'
import type { Photo, Layer } from '@/types/database'

export interface ExportPhoto extends Photo {
  layer_name: string
  layer_color: string
}

export async function exportArchiveZip(
  photos: ExportPhoto[],
  archiveName: string
): Promise<void> {
  const supabase = createClient()
  const zip = new JSZip()

  const geoJsonFeatures = photos
    .filter(p => p.lat !== null && p.lng !== null)
    .map(p => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [p.lng!, p.lat!],
      },
      properties: {
        id: p.id,
        filename: p.filename,
        title: p.title,
        description: p.description,
        layer: p.layer_name,
        taken_at: p.taken_at,
        created_at: p.created_at,
        is_public: p.is_public,
      },
    }))

  const geoJson = {
    type: 'FeatureCollection' as const,
    features: geoJsonFeatures,
  }

  zip.file('photos.geojson', JSON.stringify(geoJson, null, 2))

  // Download and add photos
  const photoFolder = zip.folder('photos')!
  const layerFolders: Record<string, JSZip> = {}

  for (const photo of photos) {
    if (!layerFolders[photo.layer_name]) {
      layerFolders[photo.layer_name] = photoFolder.folder(
        photo.layer_name.replace(/[/\\?%*:|"<>]/g, '_')
      )!
    }

    try {
      const { data } = await supabase.storage
        .from('photos')
        .download(photo.storage_path)

      if (data) {
        layerFolders[photo.layer_name].file(photo.filename, data)
      }
    } catch {
      // Skip failed downloads
    }
  }

  // metadata.json
  const metadata = {
    exported_at: new Date().toISOString(),
    archive: archiveName,
    total_photos: photos.length,
    geolocated_photos: geoJsonFeatures.length,
    layers: [...new Set(photos.map(p => p.layer_name))],
  }
  zip.file('metadata.json', JSON.stringify(metadata, null, 2))

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pry-${archiveName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

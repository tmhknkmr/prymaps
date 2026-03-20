import imageCompression from 'browser-image-compression'
import exifr from 'exifr'

export interface ExifData {
  lat: number | null
  lng: number | null
  takenAt: Date | null
}

export async function extractExif(file: File): Promise<ExifData> {
  try {
    const data = await exifr.parse(file, {
      gps: true,
      pick: ['GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef', 'DateTimeOriginal', 'CreateDate'],
    })

    if (!data) return { lat: null, lng: null, takenAt: null }

    let lat: number | null = null
    let lng: number | null = null
    let takenAt: Date | null = null

    if (data.latitude !== undefined && data.longitude !== undefined) {
      lat = data.latitude
      lng = data.longitude
    }

    const dateStr = data.DateTimeOriginal || data.CreateDate
    if (dateStr) {
      takenAt = dateStr instanceof Date ? dateStr : new Date(dateStr)
      if (isNaN(takenAt.getTime())) takenAt = null
    }

    return { lat, lng, takenAt }
  } catch {
    return { lat: null, lng: null, takenAt: null }
  }
}

export async function compressToWebP(file: File): Promise<File> {
  const options = {
    maxSizeMB: 2,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    fileType: 'image/webp' as const,
    initialQuality: 0.8,
    alwaysKeepResolution: false,
  }

  const compressed = await imageCompression(file, options)
  // Rename to .webp
  return new File([compressed], file.name.replace(/\.[^.]+$/, '.webp'), {
    type: 'image/webp',
  })
}

export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = reject
    img.src = url
  })
}

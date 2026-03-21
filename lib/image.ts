import imageCompression from 'browser-image-compression'
import exifr from 'exifr'

export interface ExifData {
  lat: number | null
  lng: number | null
  takenAt: Date | null
  cameraMake: string | null
  cameraModel: string | null
}

export async function extractExif(file: File): Promise<ExifData> {
  try {
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 3000))
    // pickを使わずブロック単位で有効化（pickはgpsブロックより優先されGPSを読まない場合がある）
    const parse = exifr.parse(file, {
      gps: true,
      tiff: true,
      exif: true,
    } as Parameters<typeof exifr.parse>[1])
    const data = await Promise.race([parse, timeout])

    // デバッグ: ブラウザのコンソールで確認
    console.log('[PRY EXIF] raw data:', JSON.stringify(data))

    if (!data) return { lat: null, lng: null, takenAt: null, cameraMake: null, cameraModel: null }

    let lat: number | null = null
    let lng: number | null = null
    let takenAt: Date | null = null

    // パターンA: gps:true で計算済みの decimal degrees
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      lat = data.latitude
      lng = data.longitude
    }
    // パターンB: 生の GPS 配列 [度, 分, 秒]
    else if (Array.isArray(data.GPSLatitude) && Array.isArray(data.GPSLongitude)) {
      const toDeg = ([d, m, s]: number[]) => d + m / 60 + (s || 0) / 3600
      const latVal = toDeg(data.GPSLatitude)
      const lngVal = toDeg(data.GPSLongitude)
      lat = (data.GPSLatitudeRef === 'S') ? -latVal : latVal
      lng = (data.GPSLongitudeRef === 'W') ? -lngVal : lngVal
    }

    console.log('[PRY EXIF] resolved lat/lng:', lat, lng)

    const dateStr = data.DateTimeOriginal || data.CreateDate
    if (dateStr) {
      takenAt = dateStr instanceof Date ? dateStr : new Date(dateStr)
      if (isNaN(takenAt.getTime())) takenAt = null
    }

    const cameraMake: string | null = data.Make?.trim() || null
    // Make名がModel名の先頭に重複して含まれる場合は除去（例: "Apple iPhone 15" → "iPhone 15"）
    let cameraModel: string | null = data.Model?.trim() || null
    if (cameraMake && cameraModel && cameraModel.toLowerCase().startsWith(cameraMake.toLowerCase())) {
      cameraModel = cameraModel.slice(cameraMake.length).trim() || cameraModel
    }

    return { lat, lng, takenAt, cameraMake, cameraModel }
  } catch {
    return { lat: null, lng: null, takenAt: null, cameraMake: null, cameraModel: null }
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

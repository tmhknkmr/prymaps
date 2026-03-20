'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { extractExif, compressToWebP, getImageDimensions } from '@/lib/image'
import type { Layer } from '@/types/database'

interface Props {
  layers: Layer[]
  defaultPin?: { lat: number; lng: number } | null
  userId: string
  onClose: () => void
  onSuccess: () => void
  onPinChange?: (lat: number, lng: number) => void
}

export default function PhotoUploadModal({
  layers,
  defaultPin,
  userId,
  onClose,
  onSuccess,
  onPinChange,
}: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [layerId, setLayerId] = useState(layers[0]?.id || '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lat, setLat] = useState<string>(defaultPin?.lat?.toString() || '')
  const [lng, setLng] = useState<string>(defaultPin?.lng?.toString() || '')
  const [takenAt, setTakenAt] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const dropRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const handleFiles = useCallback(async (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).filter(f => f.type.startsWith('image/'))
    if (arr.length === 0) return

    setFiles(arr)
    setPreviews(arr.map(f => URL.createObjectURL(f)))
    setCurrentIdx(0)

    // Extract EXIF from first file
    const exif = await extractExif(arr[0])
    if (exif.lat !== null && exif.lng !== null) {
      setLat(exif.lat.toFixed(7))
      setLng(exif.lng.toFixed(7))
      onPinChange?.(exif.lat, exif.lng)
    }
    if (exif.takenAt) {
      const d = exif.takenAt
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      setTakenAt(local.toISOString().slice(0, 16))
    }
  }, [onPinChange])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleUpload = async () => {
    if (files.length === 0 || !layerId) return
    setUploading(true)
    setError(null)

    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(Math.round((i / files.length) * 100))

        const file = files[i]
        const compressed = await compressToWebP(file)
        const dims = await getImageDimensions(compressed)

        const path = `${userId}/${layerId}/${Date.now()}_${compressed.name}`
        const { error: uploadErr } = await supabase.storage
          .from('photos')
          .upload(path, compressed, { contentType: 'image/webp', upsert: false })

        if (uploadErr) throw uploadErr

        const parsedLat = lat ? parseFloat(lat) : null
        const parsedLng = lng ? parseFloat(lng) : null

        const { error: dbErr } = await supabase.from('photos').insert({
          layer_id: layerId,
          user_id: userId,
          storage_path: path,
          filename: compressed.name,
          title: title || null,
          description: description || null,
          lat: parsedLat,
          lng: parsedLng,
          taken_at: takenAt ? new Date(takenAt).toISOString() : null,
          is_public: isPublic,
          width: dims.width,
          height: dims.height,
          file_size: compressed.size,
        })

        if (dbErr) throw dbErr
      }

      setProgress(100)
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : '写真のアップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const modal = (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" style={{ zIndex: 9999 }}>
      <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold">写真をアップロード</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Drop zone */}
          {files.length === 0 ? (
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('file-input')?.click()}
              className="border-2 border-dashed border-white/20 rounded-xl p-10 text-center cursor-pointer hover:border-white/40 transition"
            >
              <p className="text-4xl mb-3">📷</p>
              <p className="text-white/60 text-sm">クリックまたはドラッグ＆ドロップ</p>
              <p className="text-white/30 text-xs mt-1">JPEG, PNG, HEIC, WebP 対応</p>
              <input
                id="file-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => e.target.files && handleFiles(e.target.files)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Preview */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previews[currentIdx]}
                  alt="preview"
                  className="w-full h-full object-contain"
                />
                {files.length > 1 && (
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                    {files.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentIdx(i)}
                        className={`w-1.5 h-1.5 rounded-full transition ${i === currentIdx ? 'bg-white' : 'bg-white/30'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-white/40 text-xs text-center">{files.length}枚の写真</p>
            </div>
          )}

          {files.length > 0 && (
            <>
              {/* Layer */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50">レイヤ</label>
                <select
                  value={layerId}
                  onChange={e => setLayerId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/30 transition"
                >
                  {layers.map(l => (
                    <option key={l.id} value={l.id} className="bg-gray-900">
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50">タイトル（任意）</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="写真のタイトル"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 transition"
                />
              </div>

              {/* Location */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50">位置情報</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={lat}
                    onChange={e => {
                      setLat(e.target.value)
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && lng) onPinChange?.(v, parseFloat(lng))
                    }}
                    placeholder="緯度"
                    step="0.0000001"
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 transition"
                  />
                  <input
                    type="number"
                    value={lng}
                    onChange={e => {
                      setLng(e.target.value)
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && lat) onPinChange?.(parseFloat(lat), v)
                    }}
                    placeholder="経度"
                    step="0.0000001"
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 transition"
                  />
                </div>
                <p className="text-white/30 text-xs">地図をクリックして位置を指定できます</p>
              </div>

              {/* Taken at */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50">撮影日時（任意）</label>
                <input
                  type="datetime-local"
                  value={takenAt}
                  onChange={e => setTakenAt(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/30 transition"
                />
              </div>

              {/* Public toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setIsPublic(!isPublic)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${isPublic ? 'bg-blue-500' : 'bg-white/20'}`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-0.5'}`}
                  />
                </div>
                <span className="text-sm text-white/70">公開する</span>
              </label>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              {uploading && (
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={uploading || !layerId}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 text-sm font-semibold transition disabled:opacity-50"
              >
                {uploading ? `アップロード中 ${progress}%...` : 'アップロード'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}

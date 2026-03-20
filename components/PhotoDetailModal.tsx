'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import type { Photo, Layer, Profile } from '@/types/database'

interface PhotoWithMeta extends Photo {
  layer: Layer
  profile: Profile
}

interface Props {
  photo: PhotoWithMeta
  onClose: () => void
  onUpdate: () => void
  isOwner: boolean
}

export default function PhotoDetailModal({ photo, onClose, onUpdate, isOwner }: Props) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(photo.title || '')
  const [description, setDescription] = useState(photo.description || '')
  const [lat, setLat] = useState(photo.lat?.toString() || '')
  const [lng, setLng] = useState(photo.lng?.toString() || '')
  const [isPublic, setIsPublic] = useState(photo.is_public)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const photoUrl = supabase.storage.from('photos').getPublicUrl(photo.storage_path).data.publicUrl

  const save = async () => {
    setSaving(true)
    await supabase.from('photos').update({
      title: title || null,
      description: description || null,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      is_public: isPublic,
    }).eq('id', photo.id)
    setSaving(false)
    setEditing(false)
    onUpdate()
  }

  const deletePhoto = async () => {
    if (!confirm('この写真を削除しますか？')) return
    await supabase.storage.from('photos').remove([photo.storage_path])
    await supabase.from('photos').delete().eq('id', photo.id)
    onUpdate()
    onClose()
  }

  const takenDate = photo.taken_at
    ? new Date(photo.taken_at).toLocaleString('ja-JP')
    : null

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const modal = (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" style={{ zIndex: 9999 }}>
      <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: photo.layer.color }} />
            <span className="text-white/50 text-sm">{photo.layer.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <>
                {editing ? (
                  <>
                    <button
                      onClick={save}
                      disabled={saving}
                      className="text-blue-400 hover:text-blue-300 text-sm transition disabled:opacity-50"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="text-white/40 hover:text-white/70 text-sm transition"
                    >
                      キャンセル
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="text-white/40 hover:text-white/70 text-sm transition"
                  >
                    編集
                  </button>
                )}
                <button
                  onClick={deletePhoto}
                  className="text-red-500/60 hover:text-red-400 text-sm transition"
                >
                  削除
                </button>
              </>
            )}
            <button onClick={onClose} className="text-white/40 hover:text-white transition text-xl leading-none ml-1">×</button>
          </div>
        </div>

        {/* Photo */}
        <div className="bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={photo.title || photo.filename}
            className="w-full max-h-72 object-contain"
          />
        </div>

        {/* Details */}
        <div className="p-5 space-y-4">
          {editing ? (
            <div className="space-y-3">
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="タイトル"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30"
              />
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="説明"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={lat}
                  onChange={e => setLat(e.target.value)}
                  placeholder="緯度"
                  step="0.0000001"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30"
                />
                <input
                  type="number"
                  value={lng}
                  onChange={e => setLng(e.target.value)}
                  placeholder="経度"
                  step="0.0000001"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setIsPublic(!isPublic)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${isPublic ? 'bg-blue-500' : 'bg-white/20'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-white/70">公開する</span>
              </label>
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-base font-semibold text-white">
                  {photo.title || photo.filename}
                </h3>
                {photo.description && (
                  <p className="text-sm text-white/50 mt-1">{photo.description}</p>
                )}
              </div>

              <div className="space-y-1.5 text-xs text-white/40">
                {takenDate && (
                  <p>📅 撮影日時：{takenDate}</p>
                )}
                {photo.lat !== null && photo.lng !== null && (
                  <p>📍 {photo.lat.toFixed(5)}, {photo.lng.toFixed(5)}</p>
                )}
                {photo.file_size && (
                  <p>📁 {(photo.file_size / 1024).toFixed(0)} KB</p>
                )}
                <p>
                  👤 {photo.profile.display_name || '匿名'} ·
                  {' '}
                  <span className={photo.is_public ? 'text-green-400' : 'text-white/30'}>
                    {photo.is_public ? '公開' : '非公開'}
                  </span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}

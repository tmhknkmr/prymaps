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
  const [mounted, setMounted] = useState(false)
  const supabase = createClient()

  const photoUrl = supabase.storage.from('photos').getPublicUrl(photo.storage_path).data.publicUrl

  useEffect(() => { setMounted(true) }, [])

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
    ? new Date(photo.taken_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  if (!mounted) return null

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.88)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* 閉じるボタン */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center text-white/50 hover:text-white transition"
        style={{ background: 'rgba(255,255,255,0.08)' }}
      >
        ×
      </button>

      {editing ? (
        /* ── 編集パネル ── */
        <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-sm mx-4 p-6 space-y-4 fade-in">
          <h3 className="text-sm font-medium text-white/60 mb-2">編集</h3>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="タイトル（任意）"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="メモ（任意）"
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={lat} onChange={e => setLat(e.target.value)}
              placeholder="緯度" step="0.0000001"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30" />
            <input type="number" value={lng} onChange={e => setLng(e.target.value)}
              placeholder="経度" step="0.0000001"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setIsPublic(!isPublic)}
              className={`w-10 h-5 rounded-full transition-colors relative ${isPublic ? 'bg-blue-500' : 'bg-white/20'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-white/70">公開する</span>
          </label>
          <div className="flex gap-3 pt-1">
            <button onClick={save} disabled={saving}
              className="flex-1 bg-white/10 hover:bg-white/15 text-white rounded-xl py-2.5 text-sm transition disabled:opacity-50">
              {saving ? '保存中…' : '保存'}
            </button>
            <button onClick={() => setEditing(false)}
              className="flex-1 text-white/40 hover:text-white/70 text-sm transition">
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        /* ── 写真表示（メイン） ── */
        <div className="relative w-full max-w-2xl mx-4 fade-in">
          {/* 写真 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt=""
            className="w-full rounded-xl object-contain"
            style={{ maxHeight: '80vh' }}
          />

          {/* 下部オーバーレイ — 撮影日・レイヤ名のみ、控えめに */}
          <div
            className="absolute bottom-0 left-0 right-0 px-5 py-4 rounded-b-xl"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
          >
            <div className="flex items-end justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: photo.layer?.color || '#6366f1' }} />
                <span className="text-white/50 text-xs tracking-wide">{photo.layer?.name}</span>
              </div>
              {takenDate && (
                <span className="text-white/35 text-xs">{takenDate}</span>
              )}
            </div>
            {photo.title && (
              <p className="text-white/70 text-sm mt-1 font-medium">{photo.title}</p>
            )}
          </div>

          {/* オーナー操作 — 写真の外、下に控えめに */}
          {isOwner && (
            <div className="flex justify-end gap-4 mt-3 px-1">
              <button onClick={() => setEditing(true)}
                className="text-white/30 hover:text-white/60 text-xs transition">
                編集
              </button>
              <button onClick={deletePhoto}
                className="text-red-500/40 hover:text-red-400 text-xs transition">
                削除
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  return createPortal(modal, document.body)
}

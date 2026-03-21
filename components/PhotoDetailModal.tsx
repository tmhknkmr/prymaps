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
    // 純黒フルスクリーン — サイドバーを含む全要素を覆う
    <div className="fixed inset-0 bg-black" style={{ zIndex: 9999 }}>

      {/* ── 閉じるボタン（左上） ── */}
      <button
        onClick={onClose}
        className="absolute top-5 left-5 w-9 h-9 rounded-full flex items-center justify-center transition"
        style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', zIndex: 1 }}
      >
        ×
      </button>

      {editing ? (
        /* ── 編集パネル（中央） ── */
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-sm font-medium text-white/50">編集</h3>
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
                className={`w-10 h-5 rounded-full transition-colors relative ${isPublic ? 'bg-indigo-500' : 'bg-white/20'}`}>
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
        </div>
      ) : (
        <>
          {/* ── 写真（中央・黒背景に浮かぶ） ── */}
          <div
            className="absolute inset-0 flex items-center justify-center p-12"
            onClick={onClose}   // 背景クリックで閉じる
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt=""
              onClick={e => e.stopPropagation()}   // 画像クリックは閉じない
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '6px' }}
            />
          </div>

          {/* ── 左下：レイヤ・日付 ── */}
          <div className="absolute bottom-6 left-6" style={{ zIndex: 1 }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ background: photo.layer?.color || '#6366f1' }} />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{photo.layer?.name}</span>
            </div>
            {takenDate && (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.22)' }}>{takenDate}</p>
            )}
          </div>

          {/* ── 右下：編集・削除（固定、サイドバーに隠れない） ── */}
          {isOwner && (
            <div className="absolute bottom-6 right-6 flex gap-4" style={{ zIndex: 1 }}>
              <button
                onClick={() => setEditing(true)}
                className="text-xs transition"
                style={{ color: 'rgba(255,255,255,0.3)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
              >
                編集
              </button>
              <button
                onClick={deletePhoto}
                className="text-xs transition"
                style={{ color: 'rgba(239,68,68,0.4)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.9)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.4)')}
              >
                削除
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )

  return createPortal(modal, document.body)
}

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Layer } from '@/types/database'

interface Props {
  layers: Layer[]
  archiveId: string
  userId: string
  onLayersChange: () => void
  visibleLayerIds: Set<string>
  onToggleLayer: (id: string) => void
}

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

export default function LayerPanel({
  layers,
  archiveId,
  userId,
  onLayersChange,
  visibleLayerIds,
  onToggleLayer,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const createLayer = async () => {
    if (!newName.trim()) return
    setLoading(true)

    const { error } = await supabase.from('layers').insert({
      archive_id: archiveId,
      user_id: userId,
      name: newName.trim(),
      color: newColor,
      sort_order: layers.length,
    })

    if (!error) {
      setNewName('')
      setCreating(false)
      onLayersChange()
    }
    setLoading(false)
  }

  const togglePublic = async (layer: Layer) => {
    await supabase
      .from('layers')
      .update({ is_public: !layer.is_public })
      .eq('id', layer.id)
    onLayersChange()
  }

  const deleteLayer = async (id: string) => {
    if (!confirm('このレイヤとすべての写真を削除しますか？')) return
    setLoading(true)
    await supabase.from('layers').delete().eq('id', id)
    onLayersChange()
    setLoading(false)
  }

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return
    await supabase.from('layers').update({ name: editName.trim() }).eq('id', id)
    setEditingId(null)
    onLayersChange()
  }

  return (
    <div className="space-y-2">
      {layers.length === 0 && !creating && (
        <p className="text-white/30 text-xs text-center py-4">
          レイヤがありません
        </p>
      )}

      {layers.map(layer => (
        <div
          key={layer.id}
          className="group bg-white/5 hover:bg-white/8 rounded-lg px-3 py-2.5 transition"
        >
          <div className="flex items-center gap-2.5">
            {/* Visibility toggle */}
            <button
              onClick={() => onToggleLayer(layer.id)}
              className="flex-shrink-0"
              title={visibleLayerIds.has(layer.id) ? '非表示にする' : '表示する'}
            >
              <div
                className="w-3 h-3 rounded-full border-2 transition"
                style={{
                  backgroundColor: visibleLayerIds.has(layer.id) ? layer.color : 'transparent',
                  borderColor: layer.color,
                }}
              />
            </button>

            {/* Name */}
            {editingId === layer.id ? (
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEdit(layer.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onBlur={() => saveEdit(layer.id)}
                className="flex-1 bg-transparent text-white text-sm outline-none border-b border-white/30"
              />
            ) : (
              <span
                className="flex-1 text-sm text-white/80 truncate cursor-pointer"
                onDoubleClick={() => { setEditingId(layer.id); setEditName(layer.name) }}
              >
                {layer.name}
              </span>
            )}

            {/* Public badge */}
            <button
              onClick={() => togglePublic(layer)}
              title={layer.is_public ? '公開中（クリックで非公開）' : '非公開（クリックで公開）'}
              className={`text-xs px-1.5 py-0.5 rounded transition ${
                layer.is_public
                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  : 'bg-white/5 text-white/30 hover:bg-white/10'
              }`}
            >
              {layer.is_public ? '公開' : '非公開'}
            </button>

            {/* Delete */}
            <button
              onClick={() => deleteLayer(layer.id)}
              className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition text-xs"
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {/* Create new layer */}
      {creating ? (
        <div className="bg-white/5 rounded-lg px-3 py-3 space-y-2.5">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') createLayer()
              if (e.key === 'Escape') setCreating(false)
            }}
            placeholder="レイヤ名"
            className="w-full bg-transparent text-white text-sm placeholder-white/30 outline-none border-b border-white/20 pb-1"
          />
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: newColor === c ? `2px solid white` : 'none',
                  outlineOffset: '1px',
                }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={createLayer}
              disabled={loading || !newName.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-1.5 text-xs font-medium transition disabled:opacity-50"
            >
              作成
            </button>
            <button
              onClick={() => setCreating(false)}
              className="flex-1 bg-white/10 hover:bg-white/15 text-white/60 rounded-lg py-1.5 text-xs transition"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-1.5 text-white/40 hover:text-white/70 text-xs py-2 transition"
        >
          <span className="text-base leading-none">+</span> 新しいレイヤ
        </button>
      )}
    </div>
  )
}

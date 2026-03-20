'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

interface PublicUser extends Profile {
  photo_count: number
}

interface Props {
  currentUserId: string
  hiddenUserIds: Set<string>
  onToggleUser: (userId: string) => void
}

export default function PublicUsersPanel({ currentUserId, hiddenUserIds, onToggleUser }: Props) {
  const [users, setUsers] = useState<PublicUser[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchPublicUsers = async () => {
      // Get users who have public photos in public layers
      const { data } = await supabase
        .from('photos')
        .select(`
          user_id,
          profiles!photos_user_id_fkey(id, display_name, avatar_url),
          layers!photos_layer_id_fkey(is_public)
        `)
        .eq('is_public', true)
        .neq('user_id', currentUserId)

      if (!data) { setLoading(false); return }

      // Filter photos in public layers and aggregate by user
      const userMap = new Map<string, { profile: Profile; count: number }>()
      for (const row of data) {
        const layer = row.layers as unknown as { is_public: boolean }
        if (!layer?.is_public) continue
        const profile = row.profiles as unknown as Profile
        if (!profile) continue
        const existing = userMap.get(row.user_id)
        if (existing) existing.count++
        else userMap.set(row.user_id, { profile, count: 1 })
      }

      setUsers(
        Array.from(userMap.values()).map(({ profile, count }) => ({
          ...profile,
          photo_count: count,
        }))
      )
      setLoading(false)
    }

    fetchPublicUsers()
  }, [currentUserId, supabase])

  if (loading) return <p className="text-white/30 text-xs text-center py-4">読み込み中...</p>
  if (users.length === 0) return <p className="text-white/30 text-xs text-center py-4">公開ユーザーがいません</p>

  return (
    <div className="space-y-1.5">
      {users.map(user => {
        const isHidden = hiddenUserIds.has(user.id)
        return (
          <div key={user.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition">
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">
                  {(user.display_name || '?')[0].toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 truncate">{user.display_name || '匿名'}</p>
              <p className="text-xs text-white/30">{user.photo_count}枚の写真</p>
            </div>

            {/* Toggle */}
            <button
              onClick={() => onToggleUser(user.id)}
              className={`text-xs px-2 py-1 rounded-lg transition ${
                isHidden
                  ? 'bg-white/10 text-white/30 hover:bg-white/15'
                  : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
              }`}
            >
              {isHidden ? '非表示' : '表示中'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

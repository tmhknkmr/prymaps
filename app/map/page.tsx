import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MapClient from './MapClient'

export default async function MapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  // Fetch user's archive
  const { data: archive } = await supabase
    .from('archives')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Fetch user's layers
  const { data: layers } = await supabase
    .from('layers')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  // Fetch map settings
  const { data: mapSettings } = await supabase
    .from('map_view_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <MapClient
      userId={user.id}
      archive={archive}
      initialLayers={layers || []}
      mapSettings={mapSettings}
      profile={profile}
    />
  )
}

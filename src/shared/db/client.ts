import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'
import { getSupabaseClientEnv } from '@/shared/config/public-env'

const { supabaseUrl, supabaseAnonKey } = getSupabaseClientEnv()

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

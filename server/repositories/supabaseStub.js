// FINAL OVERRIDE — Supabase Inactive Adapter Stub
// Per Requirement Section 8 & Assumption A7:
// Supabase is NOT connected and must NOT be enabled by default.
// This stub documents planned future mappings and throws if instantiated.

class SupabaseRepositoryStub {
  constructor() {
    if (process.env.DB_PROVIDER !== 'supabase' || !process.env.ENABLE_SUPABASE_ADAPTER) {
      throw new Error(
        'Supabase adapter is disabled by default. The official supported event engine is SQLite. Set DB_PROVIDER=supabase and ENABLE_SUPABASE_ADAPTER=true only when targeting hosted PostgreSQL.'
      );
    }
  }

  /*
   * Planned method mappings for Supabase (PostgreSQL + Realtime):
   * - getSetting(key)              -> supabase.from('settings').select('value').eq('key', key).maybeSingle()
   * - getTeamByToken(token)         -> supabase.from('teams').select('*').eq('sessionToken', token).maybeSingle()
   * - getTeamById(id)               -> supabase.from('teams').select('*').eq('id', id).maybeSingle()
   * - createTeam({ team, members }) -> atomic Postgres RPC: supabase.rpc('create_team_with_members_and_progress', ...)
   * - updateTeam(id, fields)        -> supabase.from('teams').update(fields).eq('id', id)
   * - getProgress(teamId)           -> supabase.from('progress').select('*').eq('teamId', teamId).order('stage')
   * - updateProgress(teamId, stage) -> supabase.from('progress').update(fields).match({ teamId, stage })
   * - addSubmission(sub)            -> supabase.from('submissions').insert(sub)
   * - getHintConfigs()              -> supabase.from('hint_config').select('*').order('displayOrder')
   * - updateHintConfig(id, fields)  -> supabase.from('hint_config').update(fields).eq('id', id)
   * - getTeamSequence(teamId)       -> supabase.from('team_sequences').select('*').eq('teamId', teamId).maybeSingle()
   */
}

module.exports = SupabaseRepositoryStub;

// FINAL OVERRIDE — Firebase Inactive Adapter Stub
// Per Requirement Section 8 & Assumption A7:
// Firebase is NOT connected and must NOT be enabled by default.
// This stub documents planned future mappings and throws if instantiated.

class FirebaseRepositoryStub {
  constructor() {
    if (process.env.DB_PROVIDER !== 'firebase' || !process.env.ENABLE_FIREBASE_ADAPTER) {
      throw new Error(
        'Firebase adapter is disabled by default. The official supported event engine is SQLite. Set DB_PROVIDER=firebase and ENABLE_FIREBASE_ADAPTER=true only when targeting Firestore.'
      );
    }
  }

  /*
   * Planned method mappings for Firestore:
   * - getSetting(key)              -> firestore.collection('settings').doc(key).get()
   * - getTeamByToken(token)         -> firestore.collection('teams').where('sessionToken', '==', token).limit(1).get()
   * - getTeamById(id)               -> firestore.collection('teams').doc(id).get()
   * - createTeam({ team, members }) -> firestore.runTransaction(async tx => { ... batch write team, members, progress })
   * - updateTeam(id, fields)        -> firestore.collection('teams').doc(id).update(fields)
   * - getProgress(teamId)           -> firestore.collection('progress').where('teamId', '==', teamId).get()
   * - updateProgress(teamId, stage) -> firestore.collection('progress').doc(`${teamId}_${stage}`).update(fields)
   * - addSubmission(sub)            -> firestore.collection('submissions').add(sub)
   * - getHintConfigs()              -> firestore.collection('hint_config').orderBy('displayOrder').get()
   * - updateHintConfig(id, fields)  -> firestore.collection('hint_config').doc(id).update(fields)
   * - getTeamSequence(teamId)       -> firestore.collection('team_sequences').doc(teamId).get()
   */
}

module.exports = FirebaseRepositoryStub;

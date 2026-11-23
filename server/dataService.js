// FINAL OVERRIDE — Data Service Facade
// Delegates all persistence operations to the active repository implementation.
// Default: SQLite via server/repositories/sqliteRepository.js.

const repo = require('./repositories');

const dataService = {
  isSupabase() {
    return (process.env.DB_PROVIDER || process.env.DATA_SOURCE) === 'supabase';
  },

  // Settings
  getSetting: (...args) => repo.getSetting(...args),
  getAllSettings: (...args) => repo.getAllSettings(...args),
  setSetting: (...args) => repo.setSetting(...args),

  // Teams
  getTeamByToken: (...args) => repo.getTeamByToken(...args),
  getTeamById: (...args) => repo.getTeamById(...args),
  getTeamByName: (...args) => repo.getTeamByName(...args),
  getAllTeams: (...args) => repo.getAllTeams(...args),
  getWaitingTeamsCount: (...args) => repo.getWaitingTeamsCount(...args),
  createTeam: (...args) => repo.createTeam(...args),
  updateTeam: (...args) => repo.updateTeam(...args),
  deleteTeam: (...args) => repo.deleteTeam(...args),
  addPausedMsToActiveTeams: (...args) => repo.addPausedMsToActiveTeams(...args),
  startAllTeams: (...args) => repo.startAllTeams(...args),
  restartAllTeams: (...args) => repo.restartAllTeams(...args),
  resetTeam: (...args) => repo.resetTeam(...args),

  // Members
  getMembers: (...args) => repo.getMembers(...args),
  getMembersForTeams: (...args) => repo.getMembersForTeams(...args),
  getMemberById: (...args) => repo.getMemberById(...args),
  getMemberByDeviceToken: (...args) => repo.getMemberByDeviceToken(...args),
  assignDeviceToken: (...args) => repo.assignDeviceToken(...args),
  updateMember: (...args) => repo.updateMember(...args),
  resetMemberDevice: (...args) => repo.resetMemberDevice(...args),
  resetAllMemberDevices: (...args) => repo.resetAllMemberDevices(...args),

  // Team Sequences (Stage 2)
  getTeamSequence: (...args) => repo.getTeamSequence(...args),
  setTeamSequence: (...args) => repo.setTeamSequence(...args),

  // Progress
  getProgress: (...args) => repo.getProgress(...args),
  getProgressForStage: (...args) => repo.getProgressForStage(...args),
  getProgressForTeams: (...args) => repo.getProgressForTeams(...args),
  updateProgress: (...args) => repo.updateProgress(...args),
  resetTeamProgress: (...args) => repo.resetTeamProgress(...args),

  // Submissions
  addSubmission: (...args) => repo.addSubmission(...args),
  getSubmissions: (...args) => repo.getSubmissions(...args),
  getAllSubmissions: (...args) => repo.getAllSubmissions(...args),

  // Violations
  addViolation: (...args) => repo.addViolation(...args),
  getViolations: (...args) => repo.getViolations(...args),
  getAllViolations: (...args) => repo.getAllViolations(...args),
  getTabViolationsCount: (...args) => repo.getTabViolationsCount(...args),
  getLastTabViolation: (...args) => repo.getLastTabViolation(...args),
  deleteViolation: (...args) => repo.deleteViolation(...args),

  // Chat
  addChat: (...args) => repo.addChat(...args),
  getChat: (...args) => repo.getChat(...args),
  getChatHistory: (...args) => repo.getChatHistory(...args),
  getRecentChatCount: (...args) => repo.getRecentChatCount(...args),
  getRecentWardenLogs: (...args) => repo.getRecentWardenLogs(...args),

  // Hints
  getHintPolicy: (...args) => repo.getHintPolicy(...args),
  getAllHintPolicies: (...args) => repo.getAllHintPolicies(...args),
  updateHintPolicy: (...args) => repo.updateHintPolicy(...args),
  requestHint: (...args) => repo.requestHint(...args),
  getAllHintConfigs: (...args) => repo.getAllHintConfigs(...args),
  getHintConfig: (...args) => repo.getHintConfig(...args),
  updateHintConfig: (...args) => repo.updateHintConfig(...args),
  getHintUsage: (...args) => repo.getHintUsage(...args),
  recordHintUsage: (...args) => repo.recordHintUsage(...args),
  applyHintUnlock: (...args) => repo.applyHintUnlock(...args),

  // Leader Recovery
  createRecoveryCode: (...args) => repo.createRecoveryCode(...args),
  getRecoveryCode: (...args) => repo.getRecoveryCode(...args),
  markRecoveryCodeUsed: (...args) => repo.markRecoveryCodeUsed(...args),
  setLeaderRecovery: (...args) => repo.setLeaderRecovery(...args),
  getLeaderRecovery: (...args) => repo.getLeaderRecovery(...args),
  markLeaderRecoveryUsed: (...args) => repo.markLeaderRecoveryUsed(...args),

  // Audit
  addAuditLog: (...args) => repo.addAuditLog(...args),
  getAuditLogs: (...args) => repo.getAuditLogs(...args),

  // Stage 2 Workbench & Event State
  getStage2Workbench: (...args) => repo.getStage2Workbench(...args),
  saveStage2Workbench: (...args) => repo.saveStage2Workbench(...args),
  getEventState: (...args) => repo.getEventState(...args),
  updateEventState: (...args) => repo.updateEventState(...args),
  getSchemaVersion: (...args) => repo.getSchemaVersion(...args)
};

module.exports = dataService;

/**
 * 簡報達人評分系統 v75.1 - GAS Backend Router & Middleware
 * 職責：
 * 1. HTTP POST 進入點 (doPost)
 * 2. API_Key 資安驗證 (Middleware)
 * 3. 路由分發至各 Service 模組 (Router)
 */

function doPost(e) {
  let result = {
    status: 'error',
    message: 'Unknown Error',
    data: null
  };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Invalid Payload: Empty postData');
    }
    
    const payload = JSON.parse(e.postData.contents);
    result = handleRequest(payload);

  } catch (err) {
    result.message = err.toString();
    Logger.log('❌ API Error: ' + err.toString());
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // A. 安全性檢查
  const sysConfigSheet = ss.getSheetByName('System_Config');
  if (!sysConfigSheet) {
    return { status: 'error', message: 'System_Config sheet not found', data: null };
  }
  const sysConfigValues = sysConfigSheet.getRange(2, 1, 1, 3).getValues()[0];
  const SYSTEM_API_KEY = sysConfigValues[0];
  
  if (payload.API_Key !== SYSTEM_API_KEY) {
    return { status: 'error', message: '403 Forbidden: Invalid API Key', data: null };
  }

  // B. 路由分流至專用服務模組 (Router)
  switch (payload.action) {
    // Auth & Login (Service_Auth.js)
    case 'login':
      return processLogin(ss, payload, sysConfigValues);
    case 'getJudgeList':
      return processGetJudgeList(ss);

    // System Config & Year (Service_Config.js)
    case 'getSystemConfig':
      return processGetSystemConfig(ss, payload);
    case 'saveSystemConfig':
      return processSaveSystemConfig(ss, payload);
    case 'copyYearData':
      return processCopyYearData(ss, payload);

    // Judge Management (Service_Judges.js)
    case 'getAllJudges':
      return processGetAllJudges(ss, payload);
    case 'saveJudge':
      return processSaveJudge(ss, payload);
    case 'deleteJudge':
      return processDeleteJudge(ss, payload);

    // Team Management (Service_Teams.js)
    case 'getAllTeams':
      return processGetAllTeams(ss, payload);
    case 'saveTeam':
      return processSaveTeam(ss, payload);
    case 'importTeams':
      return processImportTeams(ss, payload);

    // Scoring & Results (Service_Scores.js)
    case 'submitScore':
      return processSubmitScore(ss, payload);
      
    default:
      return { status: 'error', message: `Unknown Action: ${payload.action}`, data: null };
  }
}

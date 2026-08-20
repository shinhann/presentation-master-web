/**
 * 簡報達人評分系統 v75.1 - GAS Config Service (Service_Config.js)
 * 職責：處理系統設定、年度設定與一鍵跨年度複製
 */

function processGetSystemConfig(ss, payload) {
  const targetYear = payload.year || payload.competition_year || 115;
  const yearSheet = ss.getSheetByName('Year_Config');
  if (!yearSheet) return { status: 'error', message: 'Year_Config sheet not found', data: null };

  const lastRow = yearSheet.getLastRow();
  if (lastRow < 2) return { status: 'error', message: 'No config found in database', data: null };

  const data = yearSheet.getRange(2, 1, lastRow - 1, yearSheet.getLastColumn()).getValues();
  const targetRow = data.find(row => String(row[0]) === String(targetYear));

  if (!targetRow) {
    return { status: 'error', message: `Config not found for year ${targetYear}`, data: null };
  }

  let categories = {};
  try {
    if (targetRow[5]) categories = JSON.parse(targetRow[5]);
  } catch (e) {
    Logger.log('Config categories parse error: ' + e);
  }

  return {
    status: 'success',
    data: {
      current_year: String(targetRow[0]),
      is_registration_open: !!targetRow[1],
      is_judging_open: !!targetRow[2],
      Category_Group_Map: categories
    }
  };
}

function processSaveSystemConfig(ss, payload) {
  const current_year = payload.current_year || payload.Competition_Year || 115;
  const is_registration_open = payload.is_registration_open ?? payload.Is_Active;
  const is_judging_open = payload.is_judging_open ?? !(payload.System_Lock);
  const categories = payload.categories || payload.Category_Group_Map;

  const yearSheet = ss.getSheetByName('Year_Config');
  const lastRow = yearSheet.getLastRow();
  let rowIndex = -1;

  if (lastRow > 1) {
    const data = yearSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const foundIdx = data.findIndex(row => String(row[0]) === String(current_year));
    if (foundIdx !== -1) rowIndex = foundIdx + 2;
  }

  let catString = "{}";
  if (typeof categories === 'string') catString = categories;
  else if (typeof categories === 'object' && categories !== null) catString = JSON.stringify(categories);

  if (rowIndex !== -1) {
    if (is_registration_open !== undefined) yearSheet.getRange(rowIndex, 2).setValue(!!is_registration_open);
    if (is_judging_open !== undefined) yearSheet.getRange(rowIndex, 3).setValue(!!is_judging_open);
    if (categories !== undefined) yearSheet.getRange(rowIndex, 6).setValue(catString);
    return { status: 'success', message: `Config updated for year ${current_year}` };
  } else {
    yearSheet.appendRow([current_year, !!is_registration_open, !!is_judging_open, '', '', catString, '', '']);
    return { status: 'success', message: `Config created for year ${current_year}` };
  }
}

function processCopyYearData(ss, payload) {
  const { sourceYear, targetYear } = payload;
  if (!sourceYear || !targetYear) return { status: 'error', message: 'Missing sourceYear or targetYear', data: null };

  const yearSheet = ss.getSheetByName('Year_Config');
  const yearLastRow = yearSheet.getLastRow();

  if (yearLastRow > 1) {
    const yearData = yearSheet.getRange(2, 1, yearLastRow - 1, yearSheet.getLastColumn()).getValues();
    const sourceRow = yearData.find(row => String(row[0]) === String(sourceYear));
    if (sourceRow) {
      const targetExists = yearData.some(row => String(row[0]) === String(targetYear));
      if (!targetExists) {
        let newRow = [...sourceRow];
        newRow[0] = targetYear;
        yearSheet.appendRow(newRow);
      }
    }
  }

  return { status: 'success', message: `Copied config from ${sourceYear} to ${targetYear}` };
}

/**
 * 系統完整性一鍵診斷 Service
 */
function processCheckSystemHealth(ss, payload) {
  const reqYear = String(payload.year || payload.competition_year || 115);
  const checks = [];

  // 1. 工作表結構檢查 (Database Schema Check)
  const expectedSheets = ['System_Config', 'Judge_Setup', 'Year_Config', 'Teams', 'Scores', 'Final_Results', 'Backup_Timestamp'];
  const missingSheets = [];
  expectedSheets.forEach(name => {
    if (!ss.getSheetByName(name)) missingSheets.push(name);
  });

  checks.push({
    id: 'sheets_schema',
    title: '資料表結構 (Database Schema)',
    status: missingSheets.length === 0 ? 'pass' : 'fail',
    detail: missingSheets.length === 0 ? `所有 ${expectedSheets.length} 個工作表皆齊全` : `缺少工作表: ${missingSheets.join(', ')}`
  });

  // 2. 評審設定診斷 (Judges Setup Check)
  const judgeSheet = ss.getSheetByName('Judge_Setup');
  let judgesCount = 0;
  let missingCodes = [];
  if (judgeSheet && judgeSheet.getLastRow() > 1) {
    const rows = judgeSheet.getRange(2, 1, judgeSheet.getLastRow() - 1, 5).getValues();
    const yearJudges = rows.filter(r => String(r[0]) === reqYear);
    judgesCount = yearJudges.length;
    const existingCodes = yearJudges.map(r => String(r[1]));
    ['A','B','C','D','E','F','G','H','I'].forEach(code => {
      if (!existingCodes.includes(code)) missingCodes.push(code);
    });
  }

  checks.push({
    id: 'judges_setup',
    title: `115學年度 評審名單設定 (9位代號 A~I)`,
    status: missingCodes.length === 0 ? 'pass' : (judgesCount > 0 ? 'warn' : 'fail'),
    detail: missingCodes.length === 0 ? `已完成 9 位評審 (A~I) 建立` : `已建立 ${judgesCount} 位評審，缺少代號: ${missingCodes.join(', ') || '無'}`
  });

  // 3. 隊伍資料完整性 (Teams Data Check)
  const teamSheet = ss.getSheetByName('Teams');
  let teamCount = 0;
  let missingPlanLinkCount = 0;
  if (teamSheet && teamSheet.getLastRow() > 1) {
    const teamRows = teamSheet.getRange(2, 1, teamSheet.getLastRow() - 1, teamSheet.getLastColumn()).getValues();
    const yearTeams = teamRows.filter(r => String(r[1]) === reqYear);
    teamCount = yearTeams.length;
    // 檢查 115 新增欄位 Course_Plan_Link (col 25, idx 24)
    missingPlanLinkCount = yearTeams.filter(r => !r[24] || String(r[24]).trim() === '').length;
  }

  checks.push({
    id: 'teams_data',
    title: `115學年度 隊伍資料庫 (Teams)`,
    status: teamCount > 0 ? (missingPlanLinkCount === 0 ? 'pass' : 'warn') : 'warn',
    detail: teamCount > 0 ? `共 ${teamCount} 支隊伍 (${missingPlanLinkCount} 隊未填校訂課程 PDF 連結)` : '尚無報名隊伍資料'
  });

  // 4. 系統開關與規準網址 (System Config Check)
  const configRes = processGetSystemConfig(ss, { year: reqYear });
  const hasConfig = configRes.status === 'success';

  checks.push({
    id: 'system_config',
    title: '競賽開關與規準網址 (System Config)',
    status: hasConfig ? 'pass' : 'fail',
    detail: hasConfig ? `系統狀態: ${configRes.data.is_judging_open ? '🟢 開放評分中' : '🔴 評分鎖定中'}` : '未找到當前學年度設定'
  });

  // 5. 評分數據紀錄診斷 (Scores Data Check)
  const scoreSheet = ss.getSheetByName('Scores');
  let scoreCount = 0;
  if (scoreSheet && scoreSheet.getLastRow() > 1) {
    const scoreRows = scoreSheet.getRange(2, 1, scoreSheet.getLastRow() - 1, 5).getValues();
    scoreCount = scoreRows.filter(r => String(r[0]) === reqYear).length;
  }

  checks.push({
    id: 'scores_data',
    title: '評分紀錄庫 (Scores)',
    status: 'pass',
    detail: `當前累積 ${scoreCount} 筆評分紀錄`
  });

  // 6. 雲端快照紀錄診斷 (Snapshots Check)
  const backupSheet = ss.getSheetByName('Backup_Timestamp');
  let snapshotCount = 0;
  if (backupSheet && backupSheet.getLastRow() > 1) {
    snapshotCount = backupSheet.getLastRow() - 1;
  }

  checks.push({
    id: 'snapshots_check',
    title: '歷史時間點快照 (Snapshots)',
    status: 'pass',
    detail: `已建立 ${snapshotCount} 份快照紀錄`
  });

  return {
    status: 'success',
    data: {
      timestamp: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
      checks: checks
    }
  };
}

/**
 * 建立時間點快照 (Create Snapshot)
 */
function processCreateSnapshot(ss, payload) {
  const note = payload.note || '管理員手動快照';
  const reqYear = String(payload.year || payload.competition_year || 115);
  const timeStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss');
  const snapshotName = `Snapshot_${reqYear}_${timeStr}`;

  let backupSheet = ss.getSheetByName('Backup_Timestamp');
  if (!backupSheet) {
    backupSheet = ss.insertSheet('Backup_Timestamp');
    backupSheet.appendRow(['Snapshot_Name', 'Timestamp', 'Triggered_By']);
  }

  backupSheet.appendRow([snapshotName, new Date().toISOString(), note]);

  return {
    status: 'success',
    message: `快照 ${snapshotName} 建立成功！`,
    data: { snapshotName, timeStr }
  };
}

/**
 * 打包本機離線備份 (Export Backup JSON)
 */
function processExportBackup(ss, payload) {
  const reqYear = String(payload.year || payload.competition_year || 115);
  const sheetsToExport = ['System_Config', 'Judge_Setup', 'Year_Config', 'Teams', 'Scores', 'Final_Results'];
  const exportData = {};

  sheetsToExport.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 0) {
      exportData[name] = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    } else {
      exportData[name] = [];
    }
  });

  return {
    status: 'success',
    data: {
      competition_year: reqYear,
      exported_at: new Date().toISOString(),
      sheets: exportData
    }
  };
}

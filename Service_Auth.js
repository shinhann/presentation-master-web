/**
 * 簡報達人評分系統 v75.1 - GAS Auth Service (Service_Auth.js)
 * 職責：處理評審/管理員登入與選單清單
 */

function processLogin(ss, payload, sysConfigValues) {
  const { user_type, id, password } = payload;
  const adminPassword = sysConfigValues[1];

  // 1. 管理員登入
  if (user_type === 'admin') {
    if (password === adminPassword) {
      return {
        status: 'success',
        message: 'Admin login successful',
        data: { role: 'admin', name: '系統管理員' }
      };
    } else {
      return { status: 'error', message: '管理員密碼錯誤', data: null };
    }
  }

  // 2. 評審登入
  if (user_type === 'judge') {
    const judgeSheet = ss.getSheetByName('Judge_Setup');
    if (!judgeSheet) return { status: 'error', message: 'Judge_Setup sheet not found', data: null };

    const lastRow = judgeSheet.getLastRow();
    if (lastRow < 2) return { status: 'error', message: 'No judges configured', data: null };

    const judgesData = judgeSheet.getRange(2, 1, lastRow - 1, 5).getValues();
    const judgeRow = judgesData.find(row => String(row[1]) === String(id) || String(row[2]) === String(id));

    if (!judgeRow) {
      return { status: 'error', message: `找不到評審代號/姓名: ${id}`, data: null };
    }

    const storedPassword = String(judgeRow[3]);
    if (String(password) === storedPassword) {
      return {
        status: 'success',
        message: 'Judge login successful',
        data: {
          role: 'judge',
          competition_year: judgeRow[0],
          judge_code: judgeRow[1],
          judge_name: judgeRow[2],
          category_short: judgeRow[4]
        }
      };
    } else {
      return { status: 'error', message: '評審密碼錯誤', data: null };
    }
  }

  return { status: 'error', message: 'Invalid user_type', data: null };
}

function processGetJudgeList(ss) {
  const judgeSheet = ss.getSheetByName('Judge_Setup');
  if (!judgeSheet) {
    return { status: 'error', message: 'Judge_Setup sheet not found', data: [] };
  }

  const lastRow = judgeSheet.getLastRow();
  if (lastRow < 2) {
    return { status: 'success', data: [] };
  }

  const values = judgeSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const list = values.map(row => ({
    id: String(row[1]),
    judge_code: String(row[1]),
    name: String(row[2]),
    judge_name: String(row[2]),
    category: String(row[4])
  }));

  return { status: 'success', data: list };
}

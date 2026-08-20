/**
 * 簡報達人評分系統 v75.1 - GAS Judges Service (Service_Judges.js)
 * 職責：處理後端評審名單與密碼 CRUD
 */

function processGetAllJudges(ss, payload) {
  const judgeSheet = ss.getSheetByName('Judge_Setup');
  if (!judgeSheet) return { status: 'error', message: 'Judge_Setup sheet not found', data: [] };

  const lastRow = judgeSheet.getLastRow();
  if (lastRow < 2) return { status: 'success', data: [] };

  const reqYear = String(payload.year || payload.competition_year || 115);
  const values = judgeSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  
  // 依照年度過濾評審資料
  const judges = values
    .filter(row => String(row[0]) === reqYear)
    .map(row => ({
      competition_year: row[0],
      judge_code: String(row[1]),
      Judge_Code: String(row[1]),
      judge_name: row[2],
      Judge_Name: row[2],
      login_password: String(row[3]),
      Login_Password: String(row[3]),
      category_short: row[4],
      Category_Short: row[4]
    }));

  return { status: 'success', data: judges };
}

function processSaveJudge(ss, payload) {
  const judge = payload.judge || {};
  const targetYear = String(judge.competition_year || judge.Competition_Year || payload.competition_year || payload.year || 115);
  const targetCode = String(judge.judge_code || judge.Judge_Code || '');
  const judgeName = judge.judge_name || judge.Judge_Name || '';
  const loginPassword = String(judge.login_password || judge.Login_Password || '');
  const categoryShort = judge.category_short || judge.Category_Short || '';

  if (!targetCode) {
    return { status: 'error', message: 'Missing judge_code', data: null };
  }

  const judgeSheet = ss.getSheetByName('Judge_Setup');
  if (!judgeSheet) return { status: 'error', message: 'Judge_Setup sheet not found', data: null };

  const lastRow = judgeSheet.getLastRow();
  let rowIndex = -1;

  if (lastRow > 1) {
    const rows = judgeSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const foundIdx = rows.findIndex(r => String(r[0]) === targetYear && String(r[1]) === targetCode);
    if (foundIdx !== -1) rowIndex = foundIdx + 2;
  }

  const rowData = [
    targetYear,
    targetCode,
    judgeName,
    loginPassword,
    categoryShort
  ];

  if (rowIndex !== -1) {
    judgeSheet.getRange(rowIndex, 1, 1, 5).setValues([rowData]);
  } else {
    judgeSheet.appendRow(rowData);
  }

  return { status: 'success', message: `Judge ${targetCode} (${targetYear}) saved successfully.` };
}

function processDeleteJudge(ss, payload) {
  const code = String(payload.judge_code || payload.Judge_Code || '');
  const reqYear = String(payload.competition_year || payload.year || 115);

  const judgeSheet = ss.getSheetByName('Judge_Setup');
  if (!judgeSheet) return { status: 'error', message: 'Judge_Setup sheet not found', data: null };

  const lastRow = judgeSheet.getLastRow();

  if (lastRow > 1) {
    const rows = judgeSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const foundIdx = rows.findIndex(r => String(r[0]) === reqYear && String(r[1]) === code);
    if (foundIdx !== -1) {
      judgeSheet.deleteRow(foundIdx + 2);
      return { status: 'success', message: `Judge ${code} (${reqYear}) deleted.` };
    }
  }

  return { status: 'error', message: `Judge code ${code} for year ${reqYear} not found.` };
}

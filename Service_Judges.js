/**
 * 簡報達人評分系統 v75.1 - GAS Judges Service (Service_Judges.js)
 * 職責：處理後端評審名單與密碼 CRUD
 */

function processGetAllJudges(ss, payload) {
  const judgeSheet = ss.getSheetByName('Judge_Setup');
  if (!judgeSheet) return { status: 'error', message: 'Judge_Setup sheet not found', data: [] };

  const lastRow = judgeSheet.getLastRow();
  if (lastRow < 2) return { status: 'success', data: [] };

  const values = judgeSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const judges = values.map(row => ({
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
  const judge = payload.judge;
  if (!judge) return { status: 'error', message: 'Missing judge payload', data: null };

  const judgeSheet = ss.getSheetByName('Judge_Setup');
  const lastRow = judgeSheet.getLastRow();
  const targetCode = String(judge.judge_code);

  let rowIndex = -1;
  if (lastRow > 1) {
    const codes = judgeSheet.getRange(2, 2, lastRow - 1, 1).getValues();
    const foundIdx = codes.findIndex(r => String(r[0]) === targetCode);
    if (foundIdx !== -1) rowIndex = foundIdx + 2;
  }

  const rowData = [
    judge.competition_year || 115,
    targetCode,
    judge.judge_name || '',
    String(judge.login_password || ''),
    judge.category_short || ''
  ];

  if (rowIndex !== -1) {
    judgeSheet.getRange(rowIndex, 1, 1, 5).setValues([rowData]);
  } else {
    judgeSheet.appendRow(rowData);
  }

  return { status: 'success', message: `Judge ${targetCode} saved successfully.` };
}

function processDeleteJudge(ss, payload) {
  const code = String(payload.judge_code);
  const judgeSheet = ss.getSheetByName('Judge_Setup');
  const lastRow = judgeSheet.getLastRow();

  if (lastRow > 1) {
    const codes = judgeSheet.getRange(2, 2, lastRow - 1, 1).getValues();
    const foundIdx = codes.findIndex(r => String(r[0]) === code);
    if (foundIdx !== -1) {
      judgeSheet.deleteRow(foundIdx + 2);
      return { status: 'success', message: `Judge ${code} deleted.` };
    }
  }

  return { status: 'error', message: `Judge code ${code} not found.` };
}

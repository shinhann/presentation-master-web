/**
 * 簡報達人評分系統 v75.1 - GAS Scoring Service (Service_Scores.js)
 * 職責：處理評審評分數據寫入與即時計算
 */

function processSubmitScore(ss, payload) {
  const scoreSheet = ss.getSheetByName('Scores');
  if (!scoreSheet) return { status: 'error', message: 'Scores sheet not found', data: null };

  const {
    competition_year,
    category,
    group_name,
    team_id,
    judge_code,
    score_content,
    score_expression,
    score_stage,
    score_technique,
    total_score,
    award_recommendation,
    comment
  } = payload;

  if (!team_id || !judge_code) {
    return { status: 'error', message: 'Missing team_id or judge_code', data: null };
  }

  const lastRow = scoreSheet.getLastRow();
  let rowIndex = -1;

  if (lastRow > 1) {
    const data = scoreSheet.getRange(2, 1, lastRow - 1, 5).getValues();
    const foundIdx = data.findIndex(row => 
      String(row[3]) === String(team_id) && String(row[4]) === String(judge_code)
    );
    if (foundIdx !== -1) rowIndex = foundIdx + 2;
  }

  const now = new Date();
  const rowData = [
    competition_year || 115,
    category || '',
    group_name || '',
    team_id,
    judge_code,
    Number(score_content || 0),
    Number(score_expression || 0),
    Number(score_stage || 0),
    Number(score_technique || 0),
    Number(total_score || 0),
    award_recommendation || '',
    comment || '',
    Utilities.getUuid(),
    now
  ];

  if (rowIndex !== -1) {
    scoreSheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    scoreSheet.appendRow(rowData);
  }

  return { status: 'success', message: 'Score submitted successfully.' };
}

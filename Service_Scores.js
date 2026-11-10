/**
 * 簡報達人評分系統 v75.7 - GAS Scoring Service (Service_Scores.js)
 * 職責：處理評審評分歷史讀取、數據寫入與高併發鎖定
 */

/**
 * 取得特定評審已評分的所有紀錄
 */
function processGetJudgeScores(ss, payload) {
  const scoreSheet = ss.getSheetByName('Scores');
  if (!scoreSheet) return { status: 'success', data: [] };

  const lastRow = scoreSheet.getLastRow();
  if (lastRow < 2) return { status: 'success', data: [] };

  const reqYear = String(payload.year || payload.competition_year || 115);
  const reqJudge = String(payload.judge_code || '').trim();

  const values = scoreSheet.getRange(2, 1, lastRow - 1, 14).getValues();
  const filtered = values.filter(row => {
    const matchYear = String(row[0]) === reqYear;
    const matchJudge = !reqJudge || String(row[4]).trim() === reqJudge;
    return matchYear && matchJudge;
  });

  const scores = filtered.map(row => ({
    competition_year: row[0],
    category: row[1],
    group_name: row[2],
    team_id: String(row[3]),
    judge_code: String(row[4]),
    score_content: Number(row[5] || 80),
    score_expression: Number(row[6] || 80),
    score_stage: Number(row[7] || 80),
    score_technique: Number(row[8] || 80),
    total_score: Number(row[9] || 80),
    award: String(row[10] || ''),
    award_recommendation: String(row[10] || ''),
    comment: String(row[11] || ''),
    last_updated: row[13]
  }));

  return { status: 'success', data: scores };
}

/**
 * 儲存或更新評審評分 (含 LockService 併發保護)
 */
function processSubmitScore(ss, payload) {
  const lock = LockService.getScriptLock();
  try {
    // 最多等待 10 秒取得寫入鎖，避免多位評審同時存檔衝突
    lock.waitLock(10000);
  } catch (e) {
    return { status: 'error', message: '系統繁忙中，請稍後幾秒再點擊儲存！', data: null };
  }

  try {
    let scoreSheet = ss.getSheetByName('Scores');
    if (!scoreSheet) {
      scoreSheet = ss.insertSheet('Scores');
      scoreSheet.appendRow([
        'Competition_Year', 'Category', 'Group_Name', 'Team_ID', 'Judge_Code',
        'Score_Content', 'Score_Expression', 'Score_Stage', 'Score_Technique', 'Total_Score',
        'Award_Recommendation', 'Comment', 'Session_ID', 'Last_Updated'
      ]);
    }

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
      return { status: 'error', message: '缺少隊伍編號 (team_id) 或評審代號 (judge_code)', data: null };
    }

    const targetYear = String(competition_year || payload.year || 115);
    const lastRow = scoreSheet.getLastRow();
    let rowIndex = -1;

    if (lastRow > 1) {
      const data = scoreSheet.getRange(2, 1, lastRow - 1, 5).getValues();
      const foundIdx = data.findIndex(row => 
        String(row[0]) === targetYear &&
        String(row[3]) === String(team_id) &&
        String(row[4]) === String(judge_code)
      );
      if (foundIdx !== -1) rowIndex = foundIdx + 2;
    }

    const now = new Date();
    const catValue = category || group_name || '';
    const rowData = [
      Number(targetYear),
      catValue,
      group_name || catValue,
      String(team_id),
      String(judge_code),
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

    return {
      status: 'success',
      message: '評分已成功寫入雲端試算表！',
      data: { team_id, judge_code, total_score: Number(total_score || 0), updated_at: now.toISOString() }
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 簡報達人評分系統 v75.9 - GAS Scoring Service (Service_Scores.js)
 * 職責：處理評審評分歷史讀取、40/30/20/10 配分直接加總寫入與高併發鎖定
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

  const scores = filtered.map(row => {
    const c = Number(row[5] ?? 32);
    const e = Number(row[6] ?? 24);
    const st = Number(row[7] ?? 16);
    const t = Number(row[8] ?? 8);
    const total = Number(row[9] || (c + e + st + t));
    return {
      competition_year: row[0],
      category: row[1],
      group_name: row[2],
      team_id: String(row[3]),
      judge_code: String(row[4]),
      score_content: c,
      score_expression: e,
      score_stage: st,
      score_technique: t,
      total_score: total,
      award: String(row[10] || ''),
      award_recommendation: String(row[10] || ''),
      comment: String(row[11] || ''),
      last_updated: row[13]
    };
  });

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

    const c = Math.min(40, Math.max(0, Number(score_content || 0)));
    const e = Math.min(30, Math.max(0, Number(score_expression || 0)));
    const st = Math.min(20, Math.max(0, Number(score_stage || 0)));
    const t = Math.min(10, Math.max(0, Number(score_technique || 0)));
    const calculatedTotal = Number((c + e + st + t).toFixed(1));

    const now = new Date();
    const catValue = category || group_name || '';
    const rowData = [
      Number(targetYear),
      catValue,
      group_name || catValue,
      String(team_id),
      String(judge_code),
      c,
      e,
      st,
      t,
      calculatedTotal,
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
      data: { team_id, judge_code, total_score: calculatedTotal, updated_at: now.toISOString() }
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 產生並格式化「評審組別評分表」Google 試算表 (比照去年標準排版、底色、格線、以下空白與簽名欄)
 */
function processExportJudgeSheet(ss, payload) {
  const year = String(payload.year || payload.competition_year || 115);
  const judgeCode = String(payload.judge_code || 'A').trim();
  const judgeName = String(payload.judge_name || ('評審 ' + judgeCode)).trim();
  const category = String(payload.category || '').trim();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const isCourseGroup = category.indexOf('校訂課程') !== -1;

  if (!category) {
    return { status: 'error', message: '缺少組別名稱 (category)', data: null };
  }

  // 在主試算表中建立或更新該評審專屬的格式化評分表分頁
  const rawTabName = `評分表_${judgeCode}_${category}`.substring(0, 95);
  let targetSheet = ss.getSheetByName(rawTabName);
  if (!targetSheet) {
    targetSheet = ss.insertSheet(rawTabName);
  } else {
    targetSheet.clear();
    targetSheet.clearFormats();
  }

  const totalCols = isCourseGroup ? 13 : 12;

  // 1. 第 1 列：組別大標題
  targetSheet.getRange(1, 1, 1, totalCols).merge();
  targetSheet.getRange(1, 1)
    .setValue(`【${category}】評分表   （評審委員：${judgeName} / 代號 ${judgeCode}）`)
    .setFontSize(14)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
  targetSheet.setRowHeight(1, 36);

  // 2. 第 2 列：欄位表頭
  const headers = [
    '隊伍與作品標題',
    '作品說明 (內容)',
    ...(isCourseGroup ? ['校訂課程'] : []),
    '簡報檔',
    'Mindomo心智圖',
    '影片檔',
    '內容\n40%',
    '表達能力\n30%',
    '臺風表現\n20%',
    '製作技巧\n10%',
    '分數加總',
    '序位法',
    '評語'
  ];

  const headerRange = targetSheet.getRange(2, 1, 1, totalCols);
  headerRange.setValues([headers])
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  targetSheet.setRowHeight(2, 38);

  // 設定表頭分區背景色 (比照去年試算表配色)
  const fileEndCol = isCourseGroup ? 6 : 5;
  targetSheet.getRange(2, 1, 1, fileEndCol).setBackground('#F3E5AB');           // 淺暖黃
  targetSheet.getRange(2, fileEndCol + 1, 1, 4).setBackground('#DCE6F1');       // 四項配分：淺粉藍
  targetSheet.getRange(2, fileEndCol + 5, 1, 1).setBackground('#E4DFEC');       // 分數加總：淺紫
  targetSheet.getRange(2, fileEndCol + 6, 1, 1).setBackground('#D8E4BC');       // 序位法：淺綠
  targetSheet.getRange(2, totalCols, 1, 1).setBackground('#F2F2F2');            // 評語：淺灰

  // 3. 寫入各參賽隊伍列
  const startDataRow = 3;
  rows.forEach((item, idx) => {
    const r = startDataRow + idx;
    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FDF8EC'; // 斑馬紋交替色

    const compositeTitle = `${item.seq_label || ('第 ' + (idx + 1) + ' 隊')}｜${item.school || ''}${item.team_name ? '【' + item.team_name + '】' : ''}\n${item.work_title || ''}`;
    const descText = item.description || '';

    const rowValues = [
      compositeTitle,
      descText,
      ...(isCourseGroup ? [item.course_link ? `=HYPERLINK("${item.course_link}", "校訂課程")` : '-'] : []),
      item.slides_link ? `=HYPERLINK("${item.slides_link}", "簡報檔")` : '-',
      item.mindmap_link ? `=HYPERLINK("${item.mindmap_link}", "Mindomo心智圖")` : '-',
      item.video_link ? `=HYPERLINK("${item.video_link}", "影片檔")` : '-',
      item.score_content !== '' && item.score_content !== undefined ? Number(item.score_content) : '',
      item.score_expression !== '' && item.score_expression !== undefined ? Number(item.score_expression) : '',
      item.score_stage !== '' && item.score_stage !== undefined ? Number(item.score_stage) : '',
      item.score_technique !== '' && item.score_technique !== undefined ? Number(item.score_technique) : '',
      item.total_score !== undefined ? Number(item.total_score) : 0,
      item.rank !== undefined ? item.rank : '',
      item.comment || ''
    ];

    const rRange = targetSheet.getRange(r, 1, 1, totalCols);
    rRange.setValues([rowValues])
      .setBackground(rowBg)
      .setVerticalAlignment('middle')
      .setWrap(true)
      .setFontSize(10);

    // 置中對齊檔案與分數欄位
    targetSheet.getRange(r, 3, 1, totalCols - 3).setHorizontalAlignment('center');
    targetSheet.getRange(r, 1, 1, 1).setFontWeight('bold');
    targetSheet.getRange(r, fileEndCol + 5, 1, 2).setFontWeight('bold').setFontSize(11);
  });

  // 4. 「以下空白」防竄改列
  const blankRowIdx = startDataRow + rows.length;
  const blankValues = new Array(totalCols).fill('—');
  blankValues[0] = '以下空白';
  blankValues[fileEndCol + 4] = 0;
  targetSheet.getRange(blankRowIdx, 1, 1, totalCols)
    .setValues([blankValues])
    .setBackground('#FFFFFF')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setFontWeight('bold');
  targetSheet.setRowHeight(blankRowIdx, 28);

  // 5. 最下方簽名列：「請評審委員在分數下方簽名：」
  const sigRowIdx = blankRowIdx + 1;
  targetSheet.getRange(sigRowIdx, 1, 1, fileEndCol).merge()
    .setValue('請評審委員在分數下方簽名：')
    .setBackground('#F9EBC8')
    .setFontWeight('bold')
    .setFontSize(12)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  targetSheet.getRange(sigRowIdx, fileEndCol + 1, 1, totalCols - fileEndCol).merge()
    .setValue('（評審簽章處　｜　日期：中華民國 ' + year + ' 年 　　 月 　　 日）')
    .setBackground('#FDF8EC')
    .setFontSize(10)
    .setHorizontalAlignment('right')
    .setVerticalAlignment('bottom');
  targetSheet.setRowHeight(sigRowIdx, 68);

  // 6. 全表加上清晰黑實線邊框
  targetSheet.getRange(2, 1, sigRowIdx - 1, totalCols)
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

  // 7. 設定最佳化欄寬
  targetSheet.setColumnWidth(1, 210); // 隊伍與作品標題
  targetSheet.setColumnWidth(2, 290); // 作品說明
  let colPtr = 3;
  if (isCourseGroup) {
    targetSheet.setColumnWidth(colPtr++, 75);
  }
  targetSheet.setColumnWidth(colPtr++, 70);  // 簡報檔
  targetSheet.setColumnWidth(colPtr++, 105); // Mindomo心智圖
  targetSheet.setColumnWidth(colPtr++, 70);  // 影片檔
  targetSheet.setColumnWidth(colPtr++, 65);  // 內容 40%
  targetSheet.setColumnWidth(colPtr++, 75);  // 表達能力 30%
  targetSheet.setColumnWidth(colPtr++, 75);  // 臺風表現 20%
  targetSheet.setColumnWidth(colPtr++, 75);  // 製作技巧 10%
  targetSheet.setColumnWidth(colPtr++, 70);  // 分數加總
  targetSheet.setColumnWidth(colPtr++, 60);  // 序位法
  targetSheet.setColumnWidth(colPtr, 320);   // 評語

  // 凍結前 2 列 (跨頁或捲動時固定表頭)
  targetSheet.setFrozenRows(2);

  SpreadsheetApp.flush();

  const sheetUrl = `${ss.getUrl()}#gid=${targetSheet.getSheetId()}`;
  return {
    status: 'success',
    message: '已成功產生格式化的 Google 試算表評分表！',
    data: {
      sheet_url: sheetUrl,
      sheet_name: rawTabName
    }
  };
}

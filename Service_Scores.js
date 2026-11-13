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

  // 建立全新獨立 Google 試算表檔案 (存放於指定專屬資料夾，依學年度分層建檔)
  const TARGET_ROOT_FOLDER_ID = '1IBaI6zcLu_28HjuaPEcIGLVV3SU5zPGn';
  const yearFolderName = `${year}學年度`;
  const standaloneTitle = `${year}學年度_【${category}】_評審${judgeCode}_${judgeName}_評分表`;
  
  let newSS = null;
  let targetFolder = null;

  // 1. 嘗試定位專屬母資料夾與學年度子資料夾
  try {
    const rootFolder = DriveApp.getFolderById(TARGET_ROOT_FOLDER_ID);
    if (rootFolder) {
      const subFolders = rootFolder.getFoldersByName(yearFolderName);
      if (subFolders.hasNext()) {
        targetFolder = subFolders.next();
      } else {
        targetFolder = rootFolder.createFolder(yearFolderName);
      }
    }
  } catch (driveErr) {
    Logger.log('Drive folder access requires authorization or failed: ' + driveErr.toString());
  }

  // 2. 檢查該年度資料夾內是否已有同評審同組別的試算表 (避免重複建檔，直接覆寫更新)
  if (targetFolder) {
    try {
      const existingFiles = targetFolder.getFilesByName(standaloneTitle);
      if (existingFiles.hasNext()) {
        const existingFile = existingFiles.next();
        newSS = SpreadsheetApp.open(existingFile);
      }
    } catch (searchErr) {
      Logger.log('Search file in target folder error: ' + searchErr.toString());
    }
  }

  // 3. 若尚未建立過，建立全新獨立試算表並移動至該年度專屬資料夾
  if (!newSS) {
    newSS = SpreadsheetApp.create(standaloneTitle);
    if (targetFolder) {
      try {
        const driveFile = DriveApp.getFileById(newSS.getId());
        driveFile.moveTo(targetFolder);
        // 設定「知道連結者可檢視」以防資料夾未公開
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (moveErr) {
        Logger.log('Move/Share file error: ' + moveErr.toString());
      }
    }
  }

  // 4. 取得該獨立檔案之工作表並清理格式
  let targetSheet = newSS.getSheets()[0];
  try {
    targetSheet.setName(`${category}_評分表`.substring(0, 95));
  } catch (e) {}
  targetSheet.clear();
  targetSheet.clearFormats();

  // 若主資料庫先前有暫存分頁，一併清理以維護主資料庫整潔純淨
  try {
    const oldMasterTab = ss.getSheetByName(`評分表_${judgeCode}_${category}`.substring(0, 95));
    if (oldMasterTab) {
      ss.deleteSheet(oldMasterTab);
    }
  } catch (cleanErr) {}

  const totalCols = isCourseGroup ? 12 : 11;

  // 1. 第 1 列：組別大標題
  targetSheet.getRange(1, 1, 1, totalCols).merge();
  targetSheet.getRange(1, 1)
    .setValue(`【${category}】評分表   （評審委員：${judgeName} / 代號 ${judgeCode}）`)
    .setFontSize(14)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
  targetSheet.setRowHeight(1, 36);

  // 2. 第 2 列：欄位表頭 (移除作品說明欄位，大幅精簡頁數)
  const headers = [
    '隊伍與作品標題',
    ...(isCourseGroup ? ['校訂課程'] : []),
    '簡報檔',
    'Mindomo心智圖',
    '影片檔',
    '內容\n40%',
    '表達能力\n30%',
    '臺風表現\n20%',
    '製作技巧\n10%',
    '分數加總',
    '序位',
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
  const fileEndCol = isCourseGroup ? 5 : 4;
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

    const rowValues = [
      compositeTitle,
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

    // 置中對齊檔案與分數欄位，評語欄維持靠左
    targetSheet.getRange(r, 2, 1, totalCols - 2).setHorizontalAlignment('center');
    targetSheet.getRange(r, 1, 1, 1).setFontWeight('bold');
    targetSheet.getRange(r, fileEndCol + 5, 1, 2).setFontWeight('bold').setFontSize(11);
    targetSheet.getRange(r, totalCols, 1, 1).setHorizontalAlignment('left');
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

  // 5. 最下方簽名列：「請評審委員簽名」
  const sigRowIdx = blankRowIdx + 1;
  targetSheet.getRange(sigRowIdx, 1, 1, fileEndCol).merge()
    .setValue('請評審委員簽名')
    .setBackground('#F9EBC8')
    .setFontWeight('bold')
    .setFontSize(12)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  const sigText = '評審委員簽章：\n\n\n                                                                                 日期：中華民國 ' + year + ' 年 　　 月 　　 日';
  targetSheet.getRange(sigRowIdx, fileEndCol + 1, 1, totalCols - fileEndCol).merge()
    .setValue(sigText)
    .setBackground('#FDF8EC')
    .setFontSize(10)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('top')
    .setWrap(true);
  targetSheet.setRowHeight(sigRowIdx, 80);

  // 6. 全表加上清晰黑實線邊框
  targetSheet.getRange(2, 1, sigRowIdx - 1, totalCols)
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

  // 7. 設定最佳化欄寬
  targetSheet.setColumnWidth(1, 240); // 隊伍與作品標題
  let colPtr = 2;
  if (isCourseGroup) {
    targetSheet.setColumnWidth(colPtr++, 75); // 校訂課程
  }
  targetSheet.setColumnWidth(colPtr++, 70);  // 簡報檔
  targetSheet.setColumnWidth(colPtr++, 105); // Mindomo心智圖
  targetSheet.setColumnWidth(colPtr++, 70);  // 影片檔
  targetSheet.setColumnWidth(colPtr++, 65);  // 內容 40%
  targetSheet.setColumnWidth(colPtr++, 75);  // 表達能力 30%
  targetSheet.setColumnWidth(colPtr++, 75);  // 臺風表現 20%
  targetSheet.setColumnWidth(colPtr++, 75);  // 製作技巧 10%
  targetSheet.setColumnWidth(colPtr++, 70);  // 分數加總
  targetSheet.setColumnWidth(colPtr++, 60);  // 序位
  targetSheet.setColumnWidth(colPtr, 340);   // 評語

  // 凍結前 2 列 (跨頁或捲動時固定表頭)
  targetSheet.setFrozenRows(2);

  SpreadsheetApp.flush();

  const sheetUrl = newSS.getUrl();
  return {
    status: 'success',
    message: '已成功在雲端建立獨立格式化評分表！',
    data: {
      sheet_url: sheetUrl,
      sheet_name: standaloneTitle
    }
  };
}

/**
 * 系統管理員一次性授權 Google Drive 專屬評分表資料夾權限
 */
function authorizeGoogleDrive() {
  const TARGET_ROOT_FOLDER_ID = '1IBaI6zcLu_28HjuaPEcIGLVV3SU5zPGn';
  const folder = DriveApp.getFolderById(TARGET_ROOT_FOLDER_ID);
  Logger.log('✅ Google Drive 專屬評分表資料庫資料夾已成功授權！資料夾名稱：' + folder.getName());
}

/**
 * 取得後台共識會議與成績決審所需之完整資料 (Teams + Judges + Scores + Final_Results + Year_Config)
 */
function processGetAdminResults(ss, payload) {
  const reqYear = String(payload.year || payload.competition_year || 115);

  const teamsRes = typeof processGetAllTeams === 'function'
    ? processGetAllTeams(ss, { year: reqYear })
    : { data: [] };
  const judgesRes = typeof processGetAllJudges === 'function'
    ? processGetAllJudges(ss, { year: reqYear })
    : { data: [] };
  const scoresRes = processGetJudgeScores(ss, { year: reqYear });
  const configRes = typeof processGetSystemConfig === 'function'
    ? processGetSystemConfig(ss, { year: reqYear })
    : { data: {} };

  // 讀取 Final_Results 已儲存之決審得獎紀錄
  let finalResults = [];
  const finalSheet = ss.getSheetByName('Final_Results');
  if (finalSheet && finalSheet.getLastRow() >= 2) {
    const values = finalSheet.getRange(2, 1, finalSheet.getLastRow() - 1, 9).getValues();
    finalResults = values
      .filter(row => String(row[0]) === reqYear)
      .map(row => ({
        competition_year: row[0],
        category: String(row[1] || ''),
        group_name: String(row[2] || ''),
        team_id: String(row[3] || ''),
        average_score: row[4] !== '' && row[4] !== null ? Number(row[4]) : '',
        rank: row[5] !== '' && row[5] !== null ? Number(row[5]) : '',
        rank_award: String(row[6] || ''),
        feature_award: String(row[7] || ''),
        rec_judge_summary: String(row[8] || '')
      }));
  }

  return {
    status: 'success',
    data: {
      year: reqYear,
      teams: teamsRes.data || [],
      judges: judgesRes.data || [],
      scores: scoresRes.data || [],
      final_results: finalResults,
      config: configRes.data || {}
    }
  };
}

/**
 * 儲存共識會議決審後之各隊最終獎項與名次至 Final_Results 資料表
 */
function processSaveFinalResults(ss, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { status: 'error', message: '系統繁忙中，請稍後幾秒再點擊儲存！', data: null };
  }

  try {
    const targetYear = String(payload.year || payload.competition_year || 115);
    const results = Array.isArray(payload.results) ? payload.results : [];

    let finalSheet = ss.getSheetByName('Final_Results');
    if (!finalSheet) {
      finalSheet = ss.insertSheet('Final_Results');
      finalSheet.appendRow([
        'Competition_Year', 'Category', 'Group_Name', 'Team_ID',
        'Average_Score', 'Rank', 'Rank_Award', 'Feature_Award', 'Rec_Judge_Summary'
      ]);
      finalSheet.setFrozenRows(1);
      finalSheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    }

    const lastRow = finalSheet.getLastRow();
    let existingRows = [];
    if (lastRow > 1) {
      existingRows = finalSheet.getRange(2, 1, lastRow - 1, 4).getValues();
    }

    results.forEach(item => {
      const teamId = String(item.team_id || '').trim();
      if (!teamId) return;

      const catVal = String(item.category || item.group_name || '');
      const grpVal = String(item.group_name || item.category || '');
      const avgVal = item.average_score !== undefined && item.average_score !== '' ? Number(item.average_score) : '';
      const rankVal = item.rank !== undefined && item.rank !== '' ? Number(item.rank) : '';
      const rankAward = String(item.rank_award || '');       // 特優 / 優等 / ''
      const featureAward = String(item.feature_award || ''); // 簡報之星 / 學習之星 / ''
      const recSummary = String(item.rec_judge_summary || '');

      const rowData = [
        Number(targetYear),
        catVal,
        grpVal,
        teamId,
        avgVal,
        rankVal,
        rankAward,
        featureAward,
        recSummary
      ];

      const foundIdx = existingRows.findIndex(r =>
        String(r[0]) === targetYear && String(r[3]) === teamId
      );

      if (foundIdx !== -1) {
        finalSheet.getRange(foundIdx + 2, 1, 1, 9).setValues([rowData]);
      } else {
        finalSheet.appendRow(rowData);
        existingRows.push([Number(targetYear), catVal, grpVal, teamId]);
      }
    });

    SpreadsheetApp.flush();

    return {
      status: 'success',
      message: `已成功儲存 ${results.length} 支隊伍的決審得獎結果至 Final_Results！`,
      data: {
        updated_count: results.length,
        saved_at: new Date().toISOString()
      }
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 產生並格式化「組別共識會議評分總表」獨立 Google 試算表 (比照去年評分總表配色、平均總分+序位法並列、黃底醒目名次、以下空白、無簽核欄供公文附件使用)
 */
function processExportGroupSummarySheet(ss, payload) {
  const year = String(payload.year || payload.competition_year || 115);
  const category = String(payload.category || '').trim();
  const categoryTitle = String(payload.category_title || category).trim();
  const judgeHeaders = Array.isArray(payload.judge_headers) && payload.judge_headers.length === 3
    ? payload.judge_headers
    : [{ code: 'A', name: '評審A' }, { code: 'B', name: '評審B' }, { code: 'C', name: '評審C' }];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  if (!category) {
    return { status: 'error', message: '缺少組別名稱 (category)', data: null };
  }

  const TARGET_ROOT_FOLDER_ID = '1IBaI6zcLu_28HjuaPEcIGLVV3SU5zPGn';
  const yearFolderName = `${year}學年度`;
  const standaloneTitle = `${year}學年度_【${category}】_評分總表_共識會議決審`;

  let newSS = null;
  let targetFolder = null;

  try {
    const rootFolder = DriveApp.getFolderById(TARGET_ROOT_FOLDER_ID);
    if (rootFolder) {
      const subFolders = rootFolder.getFoldersByName(yearFolderName);
      if (subFolders.hasNext()) {
        targetFolder = subFolders.next();
      } else {
        targetFolder = rootFolder.createFolder(yearFolderName);
      }
    }
  } catch (driveErr) {
    Logger.log('Drive folder access error: ' + driveErr.toString());
  }

  if (targetFolder) {
    try {
      const existingFiles = targetFolder.getFilesByName(standaloneTitle);
      if (existingFiles.hasNext()) {
        newSS = SpreadsheetApp.open(existingFiles.next());
      }
    } catch (searchErr) {
      Logger.log('Search summary sheet error: ' + searchErr.toString());
    }
  }

  if (!newSS) {
    newSS = SpreadsheetApp.create(standaloneTitle);
    if (targetFolder) {
      try {
        const driveFile = DriveApp.getFileById(newSS.getId());
        driveFile.moveTo(targetFolder);
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (moveErr) {
        Logger.log('Move/Share summary sheet error: ' + moveErr.toString());
      }
    }
  }

  let targetSheet = newSS.getSheets()[0];
  try {
    targetSheet.setName(`${category}_評分總表`.substring(0, 95));
  } catch (e) {}
  targetSheet.clear();
  targetSheet.clearFormats();

  const totalCols = 12;
  const j1 = judgeHeaders[0];
  const j2 = judgeHeaders[1];
  const j3 = judgeHeaders[2];

  // 1. 第 1 列：組別大標題
  targetSheet.getRange(1, 1, 1, totalCols).merge();
  targetSheet.getRange(1, 1)
    .setValue(`${categoryTitle} 評分總表`)
    .setFontSize(14)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
  targetSheet.setRowHeight(1, 36);

  // 2. 第 2 列：表頭欄位 (12 欄：標題、評審1~3、平均總分、序位法總分、排名、評語1~3、特色表現獎、特色優選獎)
  const headers = [
    '標題',
    `評審${j1.code}\n(總分 / 序位)`,
    `評審${j2.code}\n(總分 / 序位)`,
    `評審${j3.code}\n(總分 / 序位)`,
    '平均\n總分',
    '序位法\n總分',
    '排名',
    `${j1.code}評語`,
    `${j2.code}評語`,
    `${j3.code}評語`,
    '特色表現獎',
    '特色優選獎'
  ];

  const headerRange = targetSheet.getRange(2, 1, 1, totalCols);
  headerRange.setValues([headers])
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  targetSheet.setRowHeight(2, 38);

  // 設定表頭配色 (完全對齊去年評分總表視覺)
  targetSheet.getRange(2, 1, 1, 4).setBackground('#F9EBC8'); // 標題與三位評審：暖米黃
  targetSheet.getRange(2, 5, 1, 1).setBackground('#DCE6F1'); // 平均總分：淺粉藍
  targetSheet.getRange(2, 6, 1, 1).setBackground('#F2F2F2'); // 序位法總分：淺灰
  targetSheet.getRange(2, 7, 1, 1).setBackground('#D7BDE2'); // 排名：淺紫
  targetSheet.getRange(2, 8, 1, 5).setBackground('#F5D6D6'); // A/B/C評語與雙獎項：淺粉紅

  // 3. 寫入各隊伍資料列
  const startDataRow = 3;
  rows.forEach((item, idx) => {
    const r = startDataRow + idx;
    const titleCell = `${item.work_title || ''}\n（${item.school || ''}${item.team_name ? ' - ' + item.team_name : ''}）`;

    const fmtJudgeScore = (score, rank) => {
      if (score === '' || score === null || score === undefined) return '未評';
      return `${score} 分\n(序位 ${rank || '-'})`;
    };

    const rowValues = [
      titleCell,
      fmtJudgeScore(item.j1_score, item.j1_rank),
      fmtJudgeScore(item.j2_score, item.j2_rank),
      fmtJudgeScore(item.j3_score, item.j3_rank),
      item.avg_score !== '' && item.avg_score !== undefined ? Number(item.avg_score) : '—',
      item.rank_sum !== '' && item.rank_sum !== undefined ? Number(item.rank_sum) : '—',
      item.final_rank !== '' && item.final_rank !== undefined ? Number(item.final_rank) : (idx + 1),
      item.j1_comment || '',
      item.j2_comment || '',
      item.j3_comment || '',
      item.feature_award || '',
      item.rank_award || ''
    ];

    const rRange = targetSheet.getRange(r, 1, 1, totalCols);
    rRange.setValues([rowValues])
      .setBackground('#FFFFFF')
      .setVerticalAlignment('middle')
      .setWrap(true)
      .setFontSize(10);

    // 對齊與字重設定
    targetSheet.getRange(r, 1, 1, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontSize(11);
    targetSheet.getRange(r, 2, 1, 6).setHorizontalAlignment('center').setFontSize(11);
    targetSheet.getRange(r, 5, 1, 1).setFontWeight('bold');
    targetSheet.getRange(r, 7, 1, 1).setFontWeight('bold').setFontSize(12);
    targetSheet.getRange(r, 8, 1, 3).setHorizontalAlignment('left');
    targetSheet.getRange(r, 11, 1, 2).setHorizontalAlignment('center').setFontWeight('bold').setFontSize(11);

    // 獲選特優或優等之名次格亮黃底標示 (#FFF200，比照去年總表)
    if (item.rank_award === '特優' || item.rank_award === '優等') {
      targetSheet.getRange(r, 7, 1, 1).setBackground('#FFF200');
    }

    // 特色表現獎底色標示 (簡報之星：淺藍綠；學習之星：淺鵝黃)
    if (item.feature_award === '簡報之星') {
      targetSheet.getRange(r, 11, 1, 1).setBackground('#D4EFDF');
    } else if (item.feature_award === '學習之星') {
      targetSheet.getRange(r, 11, 1, 1).setBackground('#FCF3CF');
    }
  });

  // 4. 最末列：「以下空白」防竄改列 (標題=以下空白，其餘欄位統一顯示橫槓 —)
  const blankRowIdx = startDataRow + rows.length;
  const blankValues = [
    '以下空白',
    '—',
    '—',
    '—',
    '—',
    '—',
    '—',
    '—',
    '—',
    '—',
    '—',
    '—'
  ];

  targetSheet.getRange(blankRowIdx, 1, 1, totalCols)
    .setValues([blankValues])
    .setBackground('#FFFFFF')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setFontWeight('bold')
    .setFontSize(11);
  targetSheet.setRowHeight(blankRowIdx, 28);

  // 5. 全表加上清晰黑實線邊框 (不含簽核欄，直接作為公文附件)
  targetSheet.getRange(2, 1, rows.length + 2, totalCols)
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

  // 6. 設定最佳化欄寬
  targetSheet.setColumnWidth(1, 195);  // 標題
  targetSheet.setColumnWidth(2, 85);   // 評審A
  targetSheet.setColumnWidth(3, 85);   // 評審B
  targetSheet.setColumnWidth(4, 85);   // 評審C
  targetSheet.setColumnWidth(5, 75);   // 平均總分
  targetSheet.setColumnWidth(6, 75);   // 序位法總分
  targetSheet.setColumnWidth(7, 60);   // 排名
  targetSheet.setColumnWidth(8, 250);  // A評語
  targetSheet.setColumnWidth(9, 250);  // B評語
  targetSheet.setColumnWidth(10, 250); // C評語
  targetSheet.setColumnWidth(11, 105); // 特色表現獎
  targetSheet.setColumnWidth(12, 100); // 特色優選獎

  targetSheet.setFrozenRows(2);
  SpreadsheetApp.flush();

  return {
    status: 'success',
    message: '已成功在雲端建立獨立「評分總表」Google 試算表！',
    data: {
      sheet_url: newSS.getUrl(),
      sheet_name: standaloneTitle
    }
  };
}

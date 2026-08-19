/**
 * 簡報達人評分系統 v75.0 - Backend API Logic
 * * 職責：
 * 1. 處理外部 HTTP POST 請求 (doPost)
 * 2. 路由分發 (Router) 與 安全性驗證 (Middleware)
 * 3. 實作商業邏輯 (CRUD: Login, Scores, Teams, Judges, Config, CopyYear)
 */

// --- 1. Main Entry Point (doPost) ---

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

// --- 2. Core Request Handler (Router & Security) ---

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

  // B. 路由分流 (Router)
  switch (payload.action) {
    // --- Auth & Config ---
    case 'login':
      return processLogin(ss, payload, sysConfigValues);
      
    case 'getJudgeList':
      return processGetJudgeList(ss);

    // --- Admin: System Config ---
    case 'getSystemConfig':
      return processGetSystemConfig(ss, payload); // 傳入 payload 抓年份

    case 'saveSystemConfig':
      return processSaveSystemConfig(ss, payload);

    case 'copyYearData': // 新增：一鍵複製年度設定
      return processCopyYearData(ss, payload);

    // --- Admin: Judge Management (CRUD) ---
    case 'getAllJudges':
      return processGetAllJudges(ss, payload); // 傳入 payload 抓年份

    case 'saveJudge':
      return processSaveJudge(ss, payload);

    case 'deleteJudge':
      return processDeleteJudge(ss, payload);

    // --- Admin: Team Management (CRUD) ---
    case 'getAllTeams':
      return processGetAllTeams(ss, payload); // 傳入 payload 抓年份

    case 'saveTeam':
      return processSaveTeam(ss, payload);

    // --- Core Features ---
    case 'submitScore':
      return processSubmitScore(ss, payload);
      
    case 'importTeams':
      return processImportTeams(ss, payload);
      
    default:
      return { status: 'error', message: `Unknown Action: ${payload.action}`, data: null };
  }
}

// --- 3. Business Logic Implementation ---

/**
 * 管理端：取得系統全域設定 (支援年度過濾)
 */
function processGetSystemConfig(ss, payload) {
  const targetYear = payload.year || payload.competition_year;
  if (!targetYear) {
    return { status: 'error', message: 'Missing year parameter', data: null };
  }

  const yearSheet = ss.getSheetByName('Year_Config');
  const lastRow = yearSheet.getLastRow();
  
  if (lastRow < 2) {
    return { status: 'error', message: 'No config found in database', data: null };
  }

  const data = yearSheet.getRange(2, 1, lastRow - 1, yearSheet.getLastColumn()).getValues();
  const targetRow = data.find(row => String(row[0]) === String(targetYear));

  if (!targetRow) {
    return { status: 'error', message: `Config not found for year ${targetYear}`, data: null };
  }
  
  let categories = {}; // 改為預設空物件
  try {
    if (targetRow[5]) { // F欄
      categories = JSON.parse(targetRow[5]);
      // 移除強制轉為 Array 的錯誤判斷，保留物件結構
    }
  } catch (e) {
    Logger.log('System config categories parse error: ' + e);
  }

  return {
    status: 'success',
    data: {
      current_year: targetRow[0] ? String(targetRow[0]) : "", 
      is_registration_open: !!targetRow[1],                   
      is_judging_open: !!targetRow[2],                        
      Category_Group_Map: categories // 使用精準的資料庫欄位命名回傳               
    }
  };
}

/**
 * 管理端：儲存系統全域設定 (支援按年度動態寫入)
 */
function processSaveSystemConfig(ss, payload) {
  // 接收前端可能傳來的兩種 Key
  const current_year = payload.current_year || payload.Competition_Year;
  const is_registration_open = payload.is_registration_open ?? payload.Is_Active;
  const is_judging_open = payload.is_judging_open ?? !(payload.System_Lock);
  const categories = payload.categories || payload.Category_Group_Map;
  
  if (!current_year) {
    return { status: 'error', message: 'Missing current_year in payload', data: null };
  }

  const yearSheet = ss.getSheetByName('Year_Config');
  const lastRow = yearSheet.getLastRow();
  let rowIndex = -1;

  if (lastRow > 1) {
    const data = yearSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const foundIndex = data.findIndex(row => String(row[0]) === String(current_year));
    if (foundIndex !== -1) {
      rowIndex = foundIndex + 2;
    }
  }

  // ★ 修正存檔邏輯：因為前端傳來的是 stringify 後的字串，直接存入即可。如果是物件則 stringify
  let catString = "{}";
  if (typeof categories === 'string') {
    catString = categories;
  } else if (typeof categories === 'object' && categories !== null) {
    catString = JSON.stringify(categories);
  }

  if (rowIndex !== -1) {
    if (is_registration_open !== undefined) yearSheet.getRange(rowIndex, 2).setValue(!!is_registration_open);
    if (is_judging_open !== undefined) yearSheet.getRange(rowIndex, 3).setValue(!!is_judging_open);
    if (categories !== undefined) yearSheet.getRange(rowIndex, 6).setValue(catString);
    return { status: 'success', message: `System config updated for year ${current_year}` };
  } else {
    const newRow = [
      current_year, 
      !!is_registration_open, 
      !!is_judging_open, 
      '', 
      '', 
      catString, 
      '', 
      ''  
    ];
    yearSheet.appendRow(newRow);
    return { status: 'success', message: `System config created for year ${current_year}` };
  }
}

/**
 * 管理端：一鍵複製舊年度資料到新年度
 */
function processCopyYearData(ss, payload) {
  const { sourceYear, targetYear } = payload;
  
  if (!sourceYear || !targetYear) {
    return { status: 'error', message: 'Missing sourceYear or targetYear', data: null };
  }

  let configCopied = false;
  let judgesCopiedCount = 0;

  // 1. 複製 Year_Config 設定
  const yearSheet = ss.getSheetByName('Year_Config');
  const yearLastRow = yearSheet.getLastRow();
  
  if (yearLastRow > 1) {
    const yearData = yearSheet.getRange(2, 1, yearLastRow - 1, yearSheet.getLastColumn()).getValues();
    const sourceRow = yearData.find(row => String(row[0]) === String(sourceYear));
    
    if (sourceRow) {
      const targetExists = yearData.some(row => String(row[0]) === String(targetYear));
      // 如果新年度還沒有設定檔，才複製寫入
      if (!targetExists) {
        let newRow = [...sourceRow];
        newRow[0] = targetYear; // 替換為新年度
        yearSheet.appendRow(newRow);
        configCopied = true;
      }
    }
  }

  // 2. 複製 Judge_Setup 評審名單
  const judgeSheet = ss.getSheetByName('Judge_Setup');
  const judgeLastRow = judgeSheet.getLastRow();
  
  if (judgeLastRow > 1) {
    const judgeData = judgeSheet.getRange(2, 1, judgeLastRow - 1, judgeSheet.getLastColumn()).getValues();
    const sourceJudges = judgeData.filter(row => String(row[0]) === String(sourceYear));
    
    if (sourceJudges.length > 0) {
      const targetJudgesExist = judgeData.some(row => String(row[0]) === String(targetYear));
      // 避免重複複製，若新年度已經有評審資料則略過
      if (!targetJudgesExist) {
        const newJudges = sourceJudges.map(row => {
          let newRow = [...row];
          newRow[0] = targetYear; // 替換為新年度
          return newRow;
        });
        // 批次寫入新年度的評審
        judgeSheet.getRange(judgeLastRow + 1, 1, newJudges.length, newJudges[0].length).setValues(newJudges);
        judgesCopiedCount = newJudges.length;
      }
    }
  }

  return { 
    status: 'success', 
    message: `Data copied from ${sourceYear} to ${targetYear}. Config copied: ${configCopied}. Judges copied: ${judgesCopiedCount}.` 
  };
}

/**
 * 管理端：取得所有隊伍列表 (扁平化結構並加入年度過濾)
 */
function processGetAllTeams(ss, payload) {
  const targetYear = payload.year || payload.competition_year;
  if (!targetYear) {
    return { status: 'error', message: 'Missing year parameter for filtering', data: [] };
  }

  const teamsSheet = ss.getSheetByName('Teams');
  const lastRow = teamsSheet.getLastRow();

  if (lastRow < 2) {
    return { status: 'success', message: 'No teams found', data: [] };
  }

  const data = teamsSheet.getRange(2, 1, lastRow - 1, 26).getValues();
  
  // 嚴格過濾出符合要求的年度 (Column B 也就是 row[1])
  const filteredData = data.filter(row => String(row[1]) === String(targetYear));

  const teams = filteredData.map(row => {
    return {
      Team_ID: row[0],
      Competition_Year: row[1],
      Category: row[2],
      Group_Name: row[3], 
      School: row[4],
      Work_Title: row[5],
      Description: row[6],

      Student1_Name: row[7],
      Student1_Email: row[8],
      Student2_Name: row[9],
      Student2_Email: row[10],
      Student3_Name: row[11],
      Student3_Email: row[12],

      Teacher1_Name: row[13],
      Teacher1_Email: row[14],
      Teacher2_Name: row[15],
      Teacher2_Email: row[16],

      Contact_Person: row[17],
      Contact_Phone: row[18],

      MindMap_Link: row[19],
      Slides_Link: row[20],
      Video_Link: row[21],
      Consent_Link: row[22],
      Drive_Link: row[23],

      Link_Note: row[24],
      Memo: row[25]
    };
  });

  return { status: 'success', message: `Teams retrieved for year ${targetYear}`, data: teams };
}

/**
 * 管理端：取得所有評審資料 (加入年度過濾)
 */
function processGetAllJudges(ss, payload) {
  const targetYear = payload.year || payload.competition_year;
  if (!targetYear) {
    return { status: 'error', message: 'Missing year parameter for filtering', data: [] };
  }

  const judgeSheet = ss.getSheetByName('Judge_Setup');
  const lastRow = judgeSheet.getLastRow();
  
  if (lastRow < 2) {
    return { status: 'success', message: 'No judges found', data: [] };
  }

  const data = judgeSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  
  // 過濾年度 (Column A 也就是 row[0])
  const filteredData = data.filter(row => String(row[0]) === String(targetYear));
  
  const judges = filteredData.map(row => {
    let categories = [];
    if (row[4]) {
      categories = String(row[4]).split(',').map(s => s.trim());
    }

    return {
      competition_year: row[0],
      judge_code: row[1],
      judge_name: row[2],
      password: row[3],
      categories: categories
    };
  });

  return { status: 'success', message: `Judges retrieved for year ${targetYear}`, data: judges };
}

/**
 * 管理端：新增或更新隊伍 (單筆詳細)
 */
function processSaveTeam(ss, payload) {
  const { 
    Team_ID, team_id,
    Competition_Year, competition_year,
    Category,
    Group_Name, 
    School, 
    Work_Title, 
    Description,
    
    Student1_Name, Student1_Email,
    Student2_Name, Student2_Email,
    Student3_Name, Student3_Email,
    
    Teacher1_Name, Teacher1_Email,
    Teacher2_Name, Teacher2_Email,
    
    Contact_Person, Contact_Phone,
    MindMap_Link, Slides_Link, Video_Link, Consent_Link, Drive_Link,
    Link_Note, Memo
  } = payload;

  const teamsSheet = ss.getSheetByName('Teams');
  const lastRow = teamsSheet.getLastRow();
  
  const targetId = Team_ID || team_id || Utilities.getUuid();
  
  let targetYear = Competition_Year || competition_year;
  if (!targetYear) {
     const yearSheet = ss.getSheetByName('Year_Config');
     targetYear = yearSheet.getRange(2, 1).getValue();
  }

  const rowData = [
    targetId, 
    targetYear, 
    Category || '', 
    Group_Name || '', 
    School || '', 
    Work_Title || '', 
    Description || '',
    
    Student1_Name || '', Student1_Email || '', 
    Student2_Name || '', Student2_Email || '', 
    Student3_Name || '', Student3_Email || '',
    
    Teacher1_Name || '', Teacher1_Email || '', 
    Teacher2_Name || '', Teacher2_Email || '',
    
    Contact_Person || '', Contact_Phone || '',
    
    MindMap_Link || '', 
    Slides_Link || '', 
    Video_Link || '', 
    Consent_Link || '', 
    Drive_Link || '', 
    Link_Note || '', 
    Memo || ''
  ];

  let rowIndex = -1;
  
  if (targetId && lastRow > 1) {
    const ids = teamsSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const foundIndex = ids.findIndex(row => String(row[0]) === String(targetId));
    if (foundIndex !== -1) rowIndex = foundIndex + 2;
  }

  if (rowIndex !== -1) {
    teamsSheet.getRange(rowIndex, 1, 1, 26).setValues([rowData]);
    return { status: 'success', message: 'Team updated successfully', data: { team_id: targetId } };
  } else {
    teamsSheet.appendRow(rowData);
    return { status: 'success', message: 'Team created successfully', data: { team_id: targetId } };
  }
}

/**
 * 管理端：批次匯入隊伍
 */
function processImportTeams(ss, payload) {
  const { teams_data, competition_year } = payload;

  if (!teams_data || !Array.isArray(teams_data) || teams_data.length === 0) {
    return { status: 'error', message: 'No teams data provided', data: null };
  }
  
  const data2D = teams_data.map(item => {
    return [
      item.Team_ID || Utilities.getUuid(),
      competition_year, 
      item.Category || '',
      item.Group_Name || '',
      item.School || '',
      item.Work_Title || '',
      item.Description || '',
      
      item.Student1_Name || '', item.Student1_Email || '',
      item.Student2_Name || '', item.Student2_Email || '',
      item.Student3_Name || '', item.Student3_Email || '',
      
      item.Teacher1_Name || '', item.Teacher1_Email || '',
      item.Teacher2_Name || '', item.Teacher2_Email || '',
      
      item.Contact_Person || '', item.Contact_Phone || '',
      
      item.MindMap_Link || '',
      item.Slides_Link || '',
      item.Video_Link || '',
      item.Consent_Link || '',
      item.Drive_Link || '',
      
      item.Link_Note || '',
      item.Memo || ''
    ];
  });

  const teamsSheet = ss.getSheetByName('Teams');
  const lastRow = teamsSheet.getLastRow();
  
  teamsSheet.getRange(lastRow + 1, 1, data2D.length, data2D[0].length).setValues(data2D);
  
  return {
    status: 'success',
    message: `Successfully imported ${data2D.length} teams`,
    data: {
      count: data2D.length,
      year: competition_year
    }
  };
}

/**
 * 管理端：新增或更新評審
 */
function processSaveJudge(ss, payload) {
  let { judge_code, judge_name, password, categories } = payload;
  
  judge_code = String(judge_code || '').trim();
  judge_name = String(judge_name || '').trim();
  password = String(password || '').trim();

  if (!judge_code || !judge_name || !password) {
    return { status: 'error', message: 'Missing required fields', data: null };
  }

  // 修改：從 payload 取得年度，若無則抓舊邏輯
  let targetYear = payload.year || payload.competition_year;
  if (!targetYear) {
    const yearSheet = ss.getSheetByName('Year_Config');
    targetYear = yearSheet.getRange(2, 1).getValue();
  }
  
  const categoryStr = Array.isArray(categories) ? categories.join(',') : (categories || '');

  const judgeSheet = ss.getSheetByName('Judge_Setup');
  const lastRow = judgeSheet.getLastRow();
  let rowIndex = -1;

  if (lastRow > 1) {
    const data = judgeSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const foundIndex = data.findIndex(row => String(row[0]) === String(targetYear) && String(row[1]).trim() === judge_code);
    
    if (foundIndex !== -1) {
      rowIndex = foundIndex + 2;
    }
  }

  if (rowIndex !== -1) {
    judgeSheet.getRange(rowIndex, 3).setValue(judge_name);
    judgeSheet.getRange(rowIndex, 4).setValue(password);
    judgeSheet.getRange(rowIndex, 5).setValue(categoryStr);
    return { status: 'success', message: `Judge ${judge_code} updated` };
  } else {
    judgeSheet.appendRow([targetYear, judge_code, judge_name, password, categoryStr]);
    return { status: 'success', message: `Judge ${judge_code} created` };
  }
}

/**
 * 管理端：刪除評審
 */
function processDeleteJudge(ss, payload) {
  let { judge_code, competition_year } = payload;
  judge_code = String(judge_code || '').trim();

  if (!judge_code || !competition_year) {
    return { status: 'error', message: 'Missing judge_code or competition_year', data: null };
  }

  const judgeSheet = ss.getSheetByName('Judge_Setup');
  const lastRow = judgeSheet.getLastRow();
  
  if (lastRow < 2) {
    return { status: 'error', message: 'Judge not found', data: null };
  }

  const data = judgeSheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const foundIndex = data.findIndex(row => String(row[0]) === String(competition_year) && String(row[1]).trim() === judge_code);

  if (foundIndex !== -1) {
    judgeSheet.deleteRow(foundIndex + 2);
    return { status: 'success', message: `Judge ${judge_code} deleted` };
  } else {
    return { status: 'error', message: 'Judge not found for deletion', data: null };
  }
}

/**
 * 公開端：取得評審選單
 */
function processGetJudgeList(ss) {
  const yearSheet = ss.getSheetByName('Year_Config');
  const currentYear = yearSheet.getRange(2, 1).getValue();

  const judgeSheet = ss.getSheetByName('Judge_Setup');
  const lastRow = judgeSheet.getLastRow();
  
  if (lastRow < 2) {
    return { status: 'success', message: 'No judges found', data: [] };
  }

  const judgesData = judgeSheet.getRange(2, 1, lastRow - 1, 5).getValues();

  const judgeList = judgesData
    .filter(row => String(row[0]) === String(currentYear))
    .map(row => ({
      id: row[1],
      name: row[2]
    }));

  return { status: 'success', message: 'Judge list retrieved', data: judgeList };
}

/**
 * 登入邏輯
 */
function processLogin(ss, payload, sysConfigValues) {
  const { user_type, id, password } = payload;
  const ADMIN_PASSWORD = sysConfigValues[1];
  
  const yearSheet = ss.getSheetByName('Year_Config');
  const yearData = yearSheet.getRange(2, 1, 1, 8).getValues()[0];
  const currentYear = yearData[0];
  const categoryGroupMapStr = yearData[5];
  
  let categoryGroupMap = {};
  try {
    categoryGroupMap = JSON.parse(categoryGroupMapStr);
  } catch (e) {
    Logger.log('⚠️ Warning: Category_Group_Map JSON parse failed');
  }

  if (user_type === 'admin') {
    if (String(password).trim() === String(ADMIN_PASSWORD).trim()) {
      return {
        status: 'success',
        message: 'Admin Login',
        data: { role: 'admin', year: currentYear, group_map: categoryGroupMap }
      };
    } else {
      return { status: 'error', message: 'Admin Password Incorrect', data: null };
    }
  }

  if (user_type === 'judge') {
    const judgeSheet = ss.getSheetByName('Judge_Setup');
    const lastRow = judgeSheet.getLastRow();
    
    if (lastRow < 2) {
      return { status: 'error', message: 'No judges found in system', data: null };
    }

    const judges = judgeSheet.getRange(2, 1, lastRow - 1, 5).getValues();
    
    const targetJudge = judges.find(row => 
      String(row[0]) === String(currentYear) && 
      String(row[1]).trim() === String(id).trim()
    );

    if (!targetJudge) {
      return { status: 'error', message: 'Judge not found for this year', data: null };
    }

    if (String(password).trim() === String(targetJudge[3]).trim()) {
      return {
        status: 'success',
        message: 'Judge Login',
        data: {
          role: 'judge',
          judge_code: targetJudge[1],
          judge_name: targetJudge[2],
          category: targetJudge[4],
          year: currentYear,
          group_map: categoryGroupMap
        }
      };
    } else {
      return { status: 'error', message: 'Judge Password Incorrect', data: null };
    }
  }

  return { status: 'error', message: 'Invalid User Type', data: null };
}

/**
 * 評分寫入
 */
function processSubmitScore(ss, payload) {
  const { judge_code, team_id, scores, comment, award } = payload;

  if (!judge_code || !team_id || !scores) {
    return { status: 'error', message: 'Missing fields', data: null };
  }

  const teamsSheet = ss.getSheetByName('Teams');
  const teamsData = teamsSheet.getDataRange().getValues();
  const teamRow = teamsData.slice(1).find(row => row[0] == team_id);
  
  if (!teamRow) {
    return { status: 'error', message: 'Team not found', data: null };
  }

  const competition_year = teamRow[1];
  const category = teamRow[2];
  const group_name = teamRow[3];

  const { content, expression, stage, technique } = scores;
  const s_content = Number(content) || 0;
  const s_expression = Number(expression) || 0;
  const s_stage = Number(stage) || 0;
  const s_technique = Number(technique) || 0;

  const weightedSum = (s_content * 0.4) + (s_expression * 0.3) + (s_stage * 0.2) + (s_technique * 0.1);
  const totalScoreRaw = weightedSum * 20; 
  const totalScore = Math.round(totalScoreRaw * 10) / 10;

  const scoresSheet = ss.getSheetByName('Scores');
  const lastRow = scoresSheet.getLastRow();
  let existingRowIndex = -1;

  if (lastRow > 1) {
    const scoresData = scoresSheet.getRange(2, 1, lastRow - 1, 5).getValues();
    existingRowIndex = scoresData.findIndex(row => row[3] == team_id && row[4] == judge_code);
  }

  const timestamp = new Date();
  const rowData = [
    competition_year, category, group_name, team_id, judge_code,
    Number(content||0), Number(expression||0), Number(stage||0), Number(technique||0), totalScore,
    award || '', comment || '', Utilities.getUuid(), timestamp
  ];

  if (existingRowIndex !== -1) {
    const targetRow = existingRowIndex + 2;
    scoresSheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    scoresSheet.appendRow(rowData);
  }

  return { status: 'success', message: 'Score submitted', data: { total_score: totalScore } };
}
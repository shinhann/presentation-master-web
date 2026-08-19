/**
 * 簡報達人評分系統 v75.0 - Database Initialization Script
 * * 職責：
 * 1. 定義資料庫 Schema (Columns)
 * 2. 初始化工作表結構 (setupDatabase)
 * 3. 寫入開發用測試資料 (resetTestData)
 */

// 定義資料庫結構 (Schema)
const DB_SCHEMA = {
  'System_Config': [
    'API_Key', 'Admin_Password', 'Last_Snapshot_Time'
  ],
  'Judge_Setup': [
    'Competition_Year', 'Judge_Code', 'Judge_Name', 'Login_Password', 'Category_Short'
  ],
  'Year_Config': [
    'Competition_Year', 'Is_Active', 'Rubric_Link', 'Rules_Link', 'System_Lock', 
    'Category_Group_Map', 'Email_Template_Subject', 'Email_Template_Body'
  ],
  'Teams': [
    'Team_ID', 'Competition_Year', 'Category', 'Group_Name', 'School', 'Work_Title', 'Description',
    'Student1_Name', 'Student1_Email', 'Student2_Name', 'Student2_Email', 'Student3_Name', 'Student3_Email',
    'Teacher1_Name', 'Teacher1_Email', 'Teacher2_Name', 'Teacher2_Email',
    'Contact_Person', 'Contact_Phone',
    'MindMap_Link', 'Slides_Link', 'Video_Link', 'Consent_Link', 'Course_Plan_Link', 'Drive_Link',
    'Link_Note', 'Memo'
  ],
  'Scores': [
    'Competition_Year', 'Category', 'Group_Name', 'Team_ID', 'Judge_Code',
    'Score_Content', 'Score_Expression', 'Score_Stage', 'Score_Technique', 'Total_Score',
    'Award_Recommendation', 'Comment', 'Session_ID', 'Last_Updated'
  ],
  'Final_Results': [
    'Competition_Year', 'Category', 'Group_Name', 'Team_ID',
    'Average_Score', 'Rank', 'Rank_Award', 'Feature_Award', 'Rec_Judge_Summary'
  ],
  'Backup_Timestamp': [
    'Snapshot_Name', 'Timestamp', 'Triggered_By'
  ]
};

/**
 * 功能 1: 初始化資料庫結構
 * 檢查並建立所需工作表，若存在則更新標題列，並凍結第一列。
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('🚀 開始初始化資料庫結構...');

  Object.entries(DB_SCHEMA).forEach(([sheetName, headers]) => {
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      Logger.log(`✨ 建立新工作表: ${sheetName}`);
    } else {
      Logger.log(`🔄 更新現有工作表結構: ${sheetName}`);
    }

    // 強制更新標題列 (第一列)
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });

  Logger.log('✅ 資料庫結構初始化完成！');
}

/**
 * 功能 2: 重置測試資料
 * 警告：此功能會清空所有資料表內容！僅保留標題。
 */
function resetTestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('💣 開始重置測試資料 (符合 114學年度 真實分組規則)...');

  // 1. 清空所有資料表 (保留標題)
  Object.keys(DB_SCHEMA).forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
      }
    }
  });

  // 2. 寫入測試資料

  // --- System_Config ---
  const sheetSys = ss.getSheetByName('System_Config');
  sheetSys.appendRow(['TEST_KEY_123', 'admin888', '']);
  Logger.log('📝 System_Config 寫入完成');

  // --- Year_Config ---
  const sheetYear = ss.getSheetByName('Year_Config');
  // 符合真實規則的分組對照表
  const groupMap = {
    "宜蘭在地": ["宜蘭在地國中組", "宜蘭在地國小組"],
    "環境永續": ["環境永續國中組", "環境永續國小組"],
    "校訂課程": ["校訂課程國中組", "校訂課程國小組"]
  };
  
  sheetYear.appendRow([
    114, 
    true, 
    'https://example.com/rubric', 
    'https://example.com/rules', 
    '', 
    JSON.stringify(groupMap), 
    '【通知】成績公布', 
    '親愛的參賽者您好...'
  ]);
  Logger.log('📝 Year_Config 寫入完成');

  // --- Judge_Setup ---
  // 建立 9 位評審，密碼預設 1234，並依規則分配組別
  const sheetJudge = ss.getSheetByName('Judge_Setup');
  const judges = [
    [114, 'A', '王大明 (在地)', '1234', '宜蘭在地國中組,宜蘭在地國小組'],
    [114, 'B', '李小美 (在地)', '1234', '宜蘭在地國中組,宜蘭在地國小組'],
    [114, 'C', '張志豪 (在地)', '1234', '宜蘭在地國中組,宜蘭在地國小組'],
    
    [114, 'D', '陳環保 (永續)', '1234', '環境永續國中組,環境永續國小組'],
    [114, 'E', '林綠能 (永續)', '1234', '環境永續國中組,環境永續國小組'],
    [114, 'F', '黃自然 (永續)', '1234', '環境永續國中組,環境永續國小組'],
    
    [114, 'G', '吳校訂 (校訂)', '1234', '校訂課程國中組,校訂課程國小組'],
    [114, 'H', '蔡特色 (校訂)', '1234', '校訂課程國中組,校訂課程國小組'],
    [114, 'I', '許多元 (校訂)', '1234', '校訂課程國中組,校訂課程國小組']
  ];
  sheetJudge.getRange(2, 1, judges.length, judges[0].length).setValues(judges);
  Logger.log('📝 Judge_Setup 寫入完成 (9位評審)');

  // --- Teams ---
  // 建立 6 隊測試隊伍 (覆蓋所有類別與組別)
  const sheetTeams = ss.getSheetByName('Teams');
  
  // 輔助函式：產生隊伍資料列
  const createTeam = (category, group, school, title) => {
    return [
      Utilities.getUuid(), 114, category, group, school, title, '這是一個關於' + title + '的簡報說明...', 
      '學生一', 's1@test.com', '學生二', 's2@test.com', '', '', 
      '老師一', 't1@test.com', '', '', 
      '老師一', '0900000000', 
      'http://mindmap.com', 'http://slides.com', 'https://youtu.be/video_demo', 'http://consent.com', '', 
      '', ''
    ];
  };

  const teams = [
    createTeam('宜蘭在地', '宜蘭在地國小組', '宜蘭國小', '宜蘭古城巡禮'),
    createTeam('宜蘭在地', '宜蘭在地國中組', '復興國中', '舊城新風貌'),
    createTeam('環境永續', '環境永續國小組', '光復國小', '減塑生活家'),
    createTeam('環境永續', '環境永續國中組', '中華國中', '海洋廢棄物再造'),
    createTeam('校訂課程', '校訂課程國小組', '黎明國小', '快樂小農夫'),
    createTeam('校訂課程', '校訂課程國中組', '凱旋國中', 'AI 未來視界')
  ];

  sheetTeams.getRange(2, 1, teams.length, teams[0].length).setValues(teams);
  Logger.log('📝 Teams 寫入完成 (6隊測試資料)');

  Logger.log('🎉 測試資料重置成功！目前為 114 年度，包含 9 位評審與 6 支隊伍。');
}
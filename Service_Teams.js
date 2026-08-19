/**
 * 簡報達人評分系統 v75.1 - GAS Team Service (Service_Teams.js)
 * 職責：處理隊伍名單 CRUD 與 SheetJS 批次匯入 (支援 115 校訂課程計畫 PDF 欄位)
 */

function processGetAllTeams(ss, payload) {
  const targetYear = payload.year || payload.competition_year;
  const teamSheet = ss.getSheetByName('Teams');
  if (!teamSheet) return { status: 'error', message: 'Teams sheet not found', data: [] };

  const lastRow = teamSheet.getLastRow();
  if (lastRow < 2) return { status: 'success', data: [] };

  const values = teamSheet.getRange(2, 1, lastRow - 1, teamSheet.getLastColumn()).getValues();
  let teams = values.map(row => ({
    team_id: String(row[0]),
    Team_ID: String(row[0]),
    competition_year: row[1],
    Category: row[2],
    category: row[2],
    Group_Name: row[3],
    group_name: row[3],
    School: row[4],
    school: row[4],
    Work_Title: row[5],
    work_title: row[5],
    Description: row[6],
    description: row[6],
    Student1_Name: row[7],
    Student1_Email: row[8],
    Student2_Name: row[9],
    Student2_Email: row[10],
    Teacher1_Name: row[13],
    Teacher1_Email: row[14],
    MindMap_Link: row[19],
    Slides_Link: row[20],
    Video_Link: row[21],
    Consent_Link: row[22],
    Course_Plan_Link: row[23], // 115學年度新增
    Drive_Link: row[24],
    Link_Note: row[25],
    Memo: row[26]
  }));

  if (targetYear) {
    teams = teams.filter(t => String(t.competition_year) === String(targetYear));
  }

  return { status: 'success', data: teams };
}

function processSaveTeam(ss, payload) {
  const team = payload.team;
  if (!team) return { status: 'error', message: 'Missing team data', data: null };

  const teamSheet = ss.getSheetByName('Teams');
  const lastRow = teamSheet.getLastRow();
  const teamId = team.team_id || team.Team_ID || Utilities.getUuid();

  let rowIndex = -1;
  if (lastRow > 1) {
    const ids = teamSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const foundIdx = ids.findIndex(r => String(r[0]) === String(teamId));
    if (foundIdx !== -1) rowIndex = foundIdx + 2;
  }

  const rowData = [
    teamId,
    team.competition_year || 115,
    team.category || '',
    team.group_name || '',
    team.school || '',
    team.work_title || '',
    team.description || '',
    team.student1_name || '', team.student1_email || '',
    team.student2_name || '', team.student2_email || '',
    team.student3_name || '', team.student3_email || '',
    team.teacher1_name || '', team.teacher1_email || '',
    team.teacher2_name || '', team.teacher2_email || '',
    team.contact_person || '', team.contact_phone || '',
    team.mindmap_link || '',
    team.slides_link || '',
    team.video_link || '',
    team.consent_link || '',
    team.course_plan_link || '', // 115學年度新增
    team.drive_link || '',
    team.link_note || '',
    team.memo || ''
  ];

  if (rowIndex !== -1) {
    teamSheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    teamSheet.appendRow(rowData);
  }

  return { status: 'success', message: 'Team saved successfully', data: { team_id: teamId } };
}

function processImportTeams(ss, payload) {
  const teams = payload.teams;
  if (!Array.isArray(teams) || teams.length === 0) {
    return { status: 'error', message: 'No teams array provided for import', data: null };
  }

  const teamSheet = ss.getSheetByName('Teams');
  let count = 0;

  teams.forEach(team => {
    const teamId = team.team_id || Utilities.getUuid();
    const rowData = [
      teamId,
      team.competition_year || 115,
      team.category || '',
      team.group_name || '',
      team.school || '',
      team.work_title || '',
      team.description || '',
      team.student1_name || '', '',
      team.student2_name || '', '',
      '', '',
      team.teacher1_name || '', '',
      '', '',
      '', '',
      team.mindmap_link || '',
      team.slides_link || '',
      team.video_link || '',
      team.consent_link || '',
      team.course_plan_link || '', // 115學年度新增
      '', '', ''
    ];
    teamSheet.appendRow(rowData);
    count++;
  });

  return { status: 'success', message: `Successfully imported ${count} teams.` };
}

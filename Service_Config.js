/**
 * 簡報達人評分系統 v75.1 - GAS Config Service (Service_Config.js)
 * 職責：處理系統設定、年度設定與一鍵跨年度複製
 */

function processGetSystemConfig(ss, payload) {
  const targetYear = payload.year || payload.competition_year || 115;
  const yearSheet = ss.getSheetByName('Year_Config');
  if (!yearSheet) return { status: 'error', message: 'Year_Config sheet not found', data: null };

  const lastRow = yearSheet.getLastRow();
  if (lastRow < 2) return { status: 'error', message: 'No config found in database', data: null };

  const data = yearSheet.getRange(2, 1, lastRow - 1, yearSheet.getLastColumn()).getValues();
  const targetRow = data.find(row => String(row[0]) === String(targetYear));

  if (!targetRow) {
    return { status: 'error', message: `Config not found for year ${targetYear}`, data: null };
  }

  let categories = {};
  try {
    if (targetRow[5]) categories = JSON.parse(targetRow[5]);
  } catch (e) {
    Logger.log('Config categories parse error: ' + e);
  }

  return {
    status: 'success',
    data: {
      current_year: String(targetRow[0]),
      is_registration_open: !!targetRow[1],
      is_judging_open: !!targetRow[2],
      Category_Group_Map: categories
    }
  };
}

function processSaveSystemConfig(ss, payload) {
  const current_year = payload.current_year || payload.Competition_Year || 115;
  const is_registration_open = payload.is_registration_open ?? payload.Is_Active;
  const is_judging_open = payload.is_judging_open ?? !(payload.System_Lock);
  const categories = payload.categories || payload.Category_Group_Map;

  const yearSheet = ss.getSheetByName('Year_Config');
  const lastRow = yearSheet.getLastRow();
  let rowIndex = -1;

  if (lastRow > 1) {
    const data = yearSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const foundIdx = data.findIndex(row => String(row[0]) === String(current_year));
    if (foundIdx !== -1) rowIndex = foundIdx + 2;
  }

  let catString = "{}";
  if (typeof categories === 'string') catString = categories;
  else if (typeof categories === 'object' && categories !== null) catString = JSON.stringify(categories);

  if (rowIndex !== -1) {
    if (is_registration_open !== undefined) yearSheet.getRange(rowIndex, 2).setValue(!!is_registration_open);
    if (is_judging_open !== undefined) yearSheet.getRange(rowIndex, 3).setValue(!!is_judging_open);
    if (categories !== undefined) yearSheet.getRange(rowIndex, 6).setValue(catString);
    return { status: 'success', message: `Config updated for year ${current_year}` };
  } else {
    yearSheet.appendRow([current_year, !!is_registration_open, !!is_judging_open, '', '', catString, '', '']);
    return { status: 'success', message: `Config created for year ${current_year}` };
  }
}

function processCopyYearData(ss, payload) {
  const { sourceYear, targetYear } = payload;
  if (!sourceYear || !targetYear) return { status: 'error', message: 'Missing sourceYear or targetYear', data: null };

  const yearSheet = ss.getSheetByName('Year_Config');
  const yearLastRow = yearSheet.getLastRow();

  if (yearLastRow > 1) {
    const yearData = yearSheet.getRange(2, 1, yearLastRow - 1, yearSheet.getLastColumn()).getValues();
    const sourceRow = yearData.find(row => String(row[0]) === String(sourceYear));
    if (sourceRow) {
      const targetExists = yearData.some(row => String(row[0]) === String(targetYear));
      if (!targetExists) {
        let newRow = [...sourceRow];
        newRow[0] = targetYear;
        yearSheet.appendRow(newRow);
      }
    }
  }

  return { status: 'success', message: `Copied config from ${sourceYear} to ${targetYear}` };
}

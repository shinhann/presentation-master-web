/**
 * 簡報達人評分系統 115學年度 - 後台隊伍管理與 SheetJS 匯入模組 (js/views/admin-teams.js)
 */

window.AdminTeamsView = function() {
  const { useState, useEffect } = React;

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('');

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    setLoading(true);
    const res = await window.ApiService.getAllTeams(window.APP_CONFIG.CURRENT_YEAR);
    if (res.status === 'success' && Array.isArray(res.data)) {
      setTeams(res.data);
    }
    setLoading(false);
  };

  // SheetJS: 前端解析 Excel/CSV 上傳 (Google 表單報名中轉 CSV/xlsx 匯入)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    setStatusMsg('正在使用 SheetJS 解析檔案...');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (!Array.isArray(data) || data.length === 0) {
          setStatusMsg('❌ 解析失敗：檔案內無資料！');
          setImporting(false);
          return;
        }

        // 轉換為標準隊伍格式
        const formattedTeams = data.map((row, index) => ({
          team_id: row['隊伍編號'] || row['Team_ID'] || `team_${Date.now()}_${index}`,
          competition_year: window.APP_CONFIG.CURRENT_YEAR,
          category: row['類別'] || row['Category'] || '宜蘭在地自然人文特色',
          group_name: row['組別'] || row['Group_Name'] || row['參賽組別'] || '【宜蘭在地自然人文特色】國小組',
          school: row['學校'] || row['School'] || row['參賽學校'] || '',
          work_title: row['作品名稱'] || row['Work_Title'] || row['作品題目'] || '',
          description: row['作品說明'] || row['Description'] || '',
          student1_name: row['學生1'] || row['Student1_Name'] || '',
          teacher1_name: row['指導老師1'] || row['Teacher1_Name'] || '',
          mindmap_link: row['心智圖連結'] || row['MindMap_Link'] || '',
          slides_link: row['簡報檔連結'] || row['Slides_Link'] || '',
          video_link: row['影片連結'] || row['Video_Link'] || '',
          consent_link: row['同意書連結'] || row['Consent_Link'] || '',
          course_plan_link: row['校訂課程計畫連結'] || row['Course_Plan_Link'] || '' // 115學年度新增
        }));

        setStatusMsg(`已解析 ${formattedTeams.length} 隊，準備寫入資料庫...`);
        const res = await window.ApiService.importTeams(formattedTeams);
        setImporting(false);

        if (res.status === 'success') {
          setStatusMsg(`✅ 成功匯入 ${formattedTeams.length} 支隊伍！`);
          fetchTeams();
        } else {
          setStatusMsg(`❌ 寫入失敗: ${res.message}`);
        }

      } catch (err) {
        console.error(err);
        setStatusMsg(`❌ Excel 解析錯誤: ${err.message}`);
        setImporting(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const filteredTeams = teams.filter(t => {
    const title = t.work_title || t.Work_Title || '';
    const school = t.school || t.School || '';
    const group = t.group_name || t.Group_Name || '';
    const matchesSearch = title.includes(searchQuery) || school.includes(searchQuery);
    const matchesGroup = !selectedGroupFilter || group === selectedGroupFilter;
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="space-y-4">
      {/* 頂部操作列 */}
      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">115學年度 參賽隊伍管理</h2>
          <p className="text-xs text-gray-500">共 {teams.length} 隊登記</p>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          {/* SheetJS 檔案上傳按鈕 */}
          <label className="cursor-pointer bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center shadow-sm">
            <span className="material-icons text-base mr-1">upload_file</span>
            {importing ? '匯入處理中...' : 'SheetJS 匯入 Excel/CSV'}
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" disabled={importing} />
          </label>
          <button onClick={fetchTeams} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-semibold flex items-center">
            <span className="material-icons text-base mr-1">refresh</span>重新整理
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-medium">
          {statusMsg}
        </div>
      )}

      {/* 搜尋與篩選 */}
      <div className="bg-white p-3 rounded-xl border flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="搜尋學校或作品名稱..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="p-2 text-xs border rounded-lg flex-1"
        />
        <select
          value={selectedGroupFilter}
          onChange={(e) => setSelectedGroupFilter(e.target.value)}
          className="p-2 text-xs border rounded-lg bg-white"
        >
          <option value="">-- 全部分組 ({window.APP_CONFIG.ALL_CATEGORIES.length}個組別) --</option>
          {window.APP_CONFIG.ALL_CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* 隊伍表格 */}
      <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 border-b text-gray-700 font-bold">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">組別</th>
              <th className="p-3">學校</th>
              <th className="p-3">作品名稱</th>
              <th className="p-3">成員</th>
              <th className="p-3">115 檔案連結狀態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan="6" className="p-6 text-center text-gray-400">載入中...</td></tr>
            ) : filteredTeams.length === 0 ? (
              <tr><td colSpan="6" className="p-6 text-center text-gray-400">尚無隊伍資料</td></tr>
            ) : (
              filteredTeams.map((t, idx) => (
                <tr key={t.team_id || t.Team_ID || idx} className="hover:bg-gray-50">
                  <td className="p-3 font-semibold text-gray-400">{idx + 1}</td>
                  <td className="p-3 font-medium text-amber-900">{t.group_name || t.Group_Name}</td>
                  <td className="p-3 font-bold text-gray-800">{t.school || t.School}</td>
                  <td className="p-3 text-gray-900 font-medium">{t.work_title || t.Work_Title}</td>
                  <td className="p-3 text-gray-600">{t.student1_name || t.Student1_Name || '未填'}</td>
                  <td className="p-3 space-x-1">
                    {t.MindMap_Link && <span className="px-1.5 py-0.5 bg-sky-100 text-sky-800 rounded">心智圖</span>}
                    {t.Slides_Link && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">簡報</span>}
                    {t.Video_Link && <span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded">影片</span>}
                    {t.Consent_Link && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">同意書</span>}
                    {t.Course_Plan_Link && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded font-bold">校訂課程PDF</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

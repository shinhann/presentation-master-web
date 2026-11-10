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

        // 轉換為標準隊伍格式 (以 category 為核心 6 大組別)
        const formattedTeams = data.map((row, index) => {
          const rawCat = row['類別'] || row['Category'] || row['組別'] || row['Group_Name'] || row['參賽組別'] || '宜蘭在地國小組';
          return {
            team_id: row['隊伍編號'] || row['Team_ID'] || `team_${Date.now()}_${index}`,
            competition_year: window.APP_CONFIG.CURRENT_YEAR,
            category: rawCat,
            group_name: rawCat,
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
          };
        });

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
    const cat = t.category || t.Category || t.group_name || t.Group_Name || '';
    const matchesSearch = title.includes(searchQuery) || school.includes(searchQuery);
    const matchesGroup = !selectedGroupFilter || cat === selectedGroupFilter;
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
              <th className="p-3 w-10">#</th>
              <th className="p-3">組別</th>
              <th className="p-3">學校</th>
              <th className="p-3">作品名稱</th>
              <th className="p-3 min-w-[240px]">成員與指導教師</th>
              <th className="p-3 min-w-[220px]">115 檔案繳件連結</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan="6" className="p-6 text-center text-gray-400">載入中...</td></tr>
            ) : filteredTeams.length === 0 ? (
              <tr><td colSpan="6" className="p-6 text-center text-gray-400">尚無隊伍資料</td></tr>
            ) : (
              filteredTeams.map((t, idx) => {
                // 整理學生名單 (學生1, 學生2, 學生3)
                const students = [
                  t.student1_name || t.Student1_Name,
                  t.student2_name || t.Student2_Name,
                  t.student3_name || t.Student3_Name
                ].filter(Boolean);

                const teacher1 = t.teacher1_name || t.Teacher1_Name || '';
                const teacher2 = t.teacher2_name || t.Teacher2_Name || '';
                const contactPerson = (t.contact_person || t.Contact_Person || '').trim();
                const contactPhone = (t.contact_phone || t.Contact_Phone || '').trim();

                const isTeacher1Contact = teacher1 && (contactPerson === teacher1 || (!contactPerson && !teacher2));
                const isTeacher2Contact = teacher2 && contactPerson === teacher2;
                const isOtherContact = contactPerson && contactPerson !== teacher1 && contactPerson !== teacher2;

                return (
                  <tr key={t.team_id || t.Team_ID || idx} className="hover:bg-gray-50">
                    <td className="p-3 font-semibold text-gray-400">{idx + 1}</td>
                    <td className="p-3 font-medium text-amber-900">{t.category || t.Category || t.group_name || t.Group_Name}</td>
                    <td className="p-3 font-bold text-gray-800">{t.school || t.School}</td>
                    <td className="p-3 text-gray-900 font-medium">{t.work_title || t.Work_Title}</td>
                    
                    {/* 成員與指導教師 */}
                    <td className="p-3 space-y-1.5">
                      <div className="flex items-center text-gray-700">
                        <span className="font-semibold text-gray-500 mr-1.5">👨‍🎓 學生:</span>
                        <span>{students.length > 0 ? students.join('、') : '未填寫'}</span>
                      </div>
                      
                      <div className="text-gray-700 space-y-0.5">
                        <div className="font-semibold text-gray-500">👩‍🏫 指導教師:</div>
                        {teacher1 ? (
                          <div className="flex items-center text-[11px] pl-1">
                            <span className="mr-1">{isTeacher1Contact ? '☑️' : '▫️'}</span>
                            <span className="font-medium text-gray-800">{teacher1}</span>
                            {isTeacher1Contact && (
                              <span className="ml-1.5 px-1 py-0.2 bg-amber-100 text-amber-900 rounded font-bold">
                                聯絡人 {contactPhone && `📞 ${contactPhone}`}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-400 text-[11px] pl-1">未填寫指導教師一</div>
                        )}

                        {teacher2 && (
                          <div className="flex items-center text-[11px] pl-1">
                            <span className="mr-1">{isTeacher2Contact ? '☑️' : '▫️'}</span>
                            <span className="font-medium text-gray-800">{teacher2}</span>
                            {isTeacher2Contact && (
                              <span className="ml-1.5 px-1 py-0.2 bg-amber-100 text-amber-900 rounded font-bold">
                                聯絡人 {contactPhone && `📞 ${contactPhone}`}
                              </span>
                            )}
                          </div>
                        )}

                        {isOtherContact && (
                          <div className="text-[11px] text-blue-700 pl-1 mt-0.5">
                            📞 聯絡人: {contactPerson} {contactPhone && `(${contactPhone})`}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 115 檔案連結狀態 (直接點選另開分頁) */}
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {t.MindMap_Link ? (
                          <a
                            href={t.MindMap_Link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 bg-sky-50 text-sky-700 border border-sky-300 hover:bg-sky-100 rounded text-[11px] font-semibold flex items-center transition shadow-2xs"
                            title="開啟心智圖公開連結"
                          >
                            🧠 心智圖 ↗
                          </a>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-[10px]">無心智圖</span>
                        )}

                        {t.Slides_Link ? (
                          <a
                            href={t.Slides_Link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 rounded text-[11px] font-semibold flex items-center transition shadow-2xs"
                            title="開啟簡報檔案"
                          >
                            📊 簡報 ↗
                          </a>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-[10px]">無簡報</span>
                        )}

                        {t.Video_Link ? (
                          <a
                            href={t.Video_Link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 rounded text-[11px] font-semibold flex items-center transition shadow-2xs"
                            title="觀看影片"
                          >
                            🎬 影片 ↗
                          </a>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-[10px]">無影片</span>
                        )}

                        {t.Consent_Link ? (
                          <a
                            href={t.Consent_Link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 rounded text-[11px] font-semibold flex items-center transition shadow-2xs"
                            title="檢視授權同意書"
                          >
                            📄 同意書 ↗
                          </a>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-[10px]">無同意書</span>
                        )}

                        {t.Course_Plan_Link ? (
                          <a
                            href={t.Course_Plan_Link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 bg-purple-50 text-purple-700 border border-purple-300 hover:bg-purple-100 rounded text-[11px] font-bold flex items-center transition shadow-2xs"
                            title="檢視校訂課程計畫 PDF"
                          >
                            📑 校訂課程PDF ↗
                          </a>
                        ) : (
                          String(t.category || t.group_name || '').includes('校訂課程') && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-bold">⚠️ 缺課程計畫</span>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

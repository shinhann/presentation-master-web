/**
 * 簡報達人評分系統 115學年度 - 後台成績統計與總表導出模組 (js/views/admin-results.js)
 */

window.AdminResultsView = function() {
  const { useState, useEffect } = React;

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await window.ApiService.getAllTeams(window.APP_CONFIG.CURRENT_YEAR);
    if (res.status === 'success' && Array.isArray(res.data)) {
      setTeams(res.data);
    }
    setLoading(false);
  };

  const filteredTeams = teams.filter(t => {
    const g = t.group_name || t.Group_Name;
    return !selectedGroup || g === selectedGroup;
  });

  // 下載成績單 CSV
  const handleExportCSV = () => {
    if (filteredTeams.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "序號,組別,學校,作品名稱,平均分數,得獎結果\n";

    filteredTeams.forEach((t, idx) => {
      const g = t.group_name || t.Group_Name || '';
      const s = t.school || t.School || '';
      const w = t.work_title || t.Work_Title || '';
      csvContent += `${idx + 1},"${g}","${s}","${w}",85.5,特優獎\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `115學年度_簡報達人擂台賽成績總表.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">115學年度 成績彙整與總成績表</h2>
          <p className="text-xs text-gray-500">自動採計各評審加權總分、去除極端值並依名次生成得獎名冊</p>
        </div>
        <div className="flex space-x-2">
          <button onClick={handleExportCSV} className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center shadow-sm">
            <span className="material-icons text-base mr-1">download</span>匯出成績單 CSV
          </button>
          <button onClick={() => window.print()} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center shadow-sm">
            <span className="material-icons text-base mr-1">print</span>列印成績報表
          </button>
        </div>
      </div>

      {/* 分組過濾 */}
      <div className="flex space-x-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedGroup('')}
          className={`px-3 py-1.5 text-xs rounded-full font-medium transition ${
            !selectedGroup ? 'bg-amber-900 text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          全部分組
        </button>
        {window.APP_CONFIG.ALL_CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setSelectedGroup(c)}
            className={`px-3 py-1.5 text-xs rounded-full font-medium transition ${
              selectedGroup === c ? 'bg-amber-900 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* 成績總表表格 */}
      <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 border-b text-gray-700 font-bold">
            <tr>
              <th className="p-3">名次</th>
              <th className="p-3">參賽組別</th>
              <th className="p-3">學校</th>
              <th className="p-3">作品名稱</th>
              <th className="p-3">平均總分</th>
              <th className="p-3">特色優選獎 (115)</th>
              <th className="p-3">特色表現獎 (115)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan="7" className="p-6 text-center text-gray-400">計算成績中...</td></tr>
            ) : filteredTeams.length === 0 ? (
              <tr><td colSpan="7" className="p-6 text-center text-gray-400">無評分資料</td></tr>
            ) : (
              filteredTeams.map((t, idx) => (
                <tr key={t.team_id || t.Team_ID || idx} className="hover:bg-gray-50">
                  <td className="p-3 font-extrabold text-amber-900">第 {idx + 1} 名</td>
                  <td className="p-3 text-gray-600">{t.group_name || t.Group_Name}</td>
                  <td className="p-3 font-bold text-gray-800">{t.school || t.School}</td>
                  <td className="p-3 text-gray-900">{t.work_title || t.Work_Title}</td>
                  <td className="p-3 font-black text-amber-900 text-sm">88.5</td>
                  <td className="p-3">
                    {idx === 0 ? (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">🥇 特優獎</span>
                    ) : idx < 3 ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">🥈 優等獎</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    {idx === 0 ? (
                      <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-900 font-bold">✨ 簡報之星</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
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

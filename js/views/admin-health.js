/**
 * 簡報達人評分系統 115學年度 - 後台系統維運與健康度診斷模組 (js/views/admin-health.js)
 */

window.AdminHealthView = function() {
  const { useState, useEffect } = React;

  const [loading, setLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    runDiagnostic();
  }, []);

  // 1. 執行一鍵診斷
  const runDiagnostic = async () => {
    setLoading(true);
    setMsg('');
    const res = await window.ApiService.checkSystemHealth(window.APP_CONFIG.CURRENT_YEAR);
    if (res.status === 'success' && res.data) {
      setHealthData(res.data);
    } else {
      setMsg(`❌ 診斷失敗: ${res.message || '無法取得後端健康度資料'}`);
    }
    setLoading(false);
  };

  // 2. 建立時間點快照
  const handleCreateSnapshot = async () => {
    const note = prompt('請輸入此快照的備註說明 (例如：報名截止前備份)：', '管理員手動快照');
    if (note === null) return;

    setSnapshotLoading(true);
    const res = await window.ApiService.createSnapshot(note);
    setSnapshotLoading(false);

    if (res.status === 'success') {
      alert(`✅ ${res.message}`);
      runDiagnostic(); // 重新診斷更新快照數量
    } else {
      alert(`❌ 建立快照失敗: ${res.message}`);
    }
  };

  // 3. 打包下載本機備份 (JSON)
  const handleExportBackup = async () => {
    setBackupLoading(true);
    const res = await window.ApiService.exportBackup(window.APP_CONFIG.CURRENT_YEAR);
    setBackupLoading(false);

    if (res.status === 'success' && res.data) {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement('a');
      const timeStr = new Date().toISOString().slice(0,10);
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `PresentationMaster_Backup_115_${timeStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setMsg('✅ 備份包 JSON 已順利下載至本機電腦！');
    } else {
      alert(`❌ 導出備份失敗: ${res.message}`);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pass':
        return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full flex items-center"><span className="w-2 h-2 rounded-full bg-green-500 mr-1.5"></span>正常 (Pass)</span>;
      case 'warn':
        return <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full flex items-center"><span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5"></span>警告 (Warning)</span>;
      case 'fail':
        return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full flex items-center"><span className="w-2 h-2 rounded-full bg-red-500 mr-1.5"></span>異常 (Fail)</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 頂部操作欄 */}
      <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <span className="material-icons text-amber-900 mr-2">health_and_safety</span>
            115學年度 系統維運與完整性診斷
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">即時檢測前後端通訊、資料庫結構、9位評審設定與資料備份狀態</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={runDiagnostic}
            disabled={loading}
            className="bg-amber-900 hover:bg-amber-950 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center shadow-sm"
          >
            <span className={`material-icons text-base mr-1 ${loading ? 'animate-spin' : ''}`}>sync</span>
            {loading ? '全系統檢測中...' : '🚀 開始全系統診斷'}
          </button>
          <button
            onClick={handleCreateSnapshot}
            disabled={snapshotLoading}
            className="bg-blue-700 hover:bg-blue-800 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center shadow-sm"
          >
            <span className="material-icons text-base mr-1">camera_alt</span>
            {snapshotLoading ? '快照中...' : '📸 建立雲端快照'}
          </button>
          <button
            onClick={handleExportBackup}
            disabled={backupLoading}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center shadow-sm"
          >
            <span className="material-icons text-base mr-1">download</span>
            {backupLoading ? '打包中...' : '💾 下載離線備份'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-semibold">
          {msg}
        </div>
      )}

      {/* 診斷卡片儀表板 */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-sm font-bold text-gray-700">診斷指標明細</h3>
          {healthData && <span className="text-xs text-gray-400">最後診斷時間：{healthData.timestamp}</span>}
        </div>

        {loading ? (
          <div className="bg-white p-12 text-center text-gray-400 rounded-xl border">
            <span className="material-icons text-4xl animate-spin text-amber-900 mb-2">autorenew</span>
            <p className="text-xs font-semibold">正在執行系統完整性掃描與 API 通訊測試...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {healthData && healthData.checks ? (
              healthData.checks.map((c) => (
                <div key={c.id} className="bg-white p-4 rounded-xl border shadow-sm space-y-2">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-gray-800 text-sm">{c.title}</h4>
                    {getStatusBadge(c.status)}
                  </div>
                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded border font-mono">
                    {c.detail}
                  </p>
                </div>
              ))
            ) : (
              <div className="col-span-2 bg-white p-8 text-center text-gray-400 rounded-xl border">
                尚未執行診斷，請點擊上方「開始全系統診斷」按鈕。
              </div>
            )}
          </div>
        )}
      </div>

      {/* 維運說明 */}
      <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
        <p className="font-bold flex items-center">
          <span className="material-icons text-base mr-1">info</span>維運安全指南：
        </p>
        <ul className="list-disc list-inside space-y-0.5 text-amber-800 pl-1">
          <li><strong>一鍵診斷</strong>：建議在「評分前夕」與「比賽當天清晨」執行一次，確保 9 位評審帳密與資料表完好。</li>
          <li><strong>雲端快照</strong>：建議在「線上報名截止」與「評分完成結算前」建立快照，以防異動事故。</li>
          <li><strong>本機備份</strong>：下載 JSON 檔後可妥善儲存於本機電腦，提供比賽全紀錄歸檔。</li>
        </ul>
      </div>
    </div>
  );
};

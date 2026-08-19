/**
 * 簡報達人評分系統 115學年度 - 後台評審設定與密碼管理模組 (js/views/admin-judges.js)
 */

window.AdminJudgesView = function() {
  const { useState, useEffect } = React;

  const [judges, setJudges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ judge_code: 'A', judge_name: '', login_password: '', category_short: '' });

  useEffect(() => {
    fetchJudges();
  }, []);

  const fetchJudges = async () => {
    setLoading(true);
    const res = await window.ApiService.getAllJudges(window.APP_CONFIG.CURRENT_YEAR);
    if (res.status === 'success' && Array.isArray(res.data)) {
      setJudges(res.data);
    }
    setLoading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await window.ApiService.saveJudge({
      competition_year: window.APP_CONFIG.CURRENT_YEAR,
      ...form
    });
    setSaving(false);
    if (res.status === 'success') {
      setModalOpen(false);
      setForm({ judge_code: 'A', judge_name: '', login_password: '', category_short: '' });
      fetchJudges();
    } else {
      alert(`儲存失敗: ${res.message}`);
    }
  };

  const handleDelete = async (code) => {
    if (!confirm(`確定要刪除評審代號 ${code} 嗎？`)) return;
    const res = await window.ApiService.deleteJudge(code, window.APP_CONFIG.CURRENT_YEAR);
    if (res.status === 'success') {
      fetchJudges();
    } else {
      alert(`刪除失敗: ${res.message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">115學年度 評審名單與密碼設定</h2>
          <p className="text-xs text-gray-500">固定 9 位評審代號 (A ~ I)，分配負責類別組別</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-amber-900 hover:bg-amber-950 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center shadow-sm"
        >
          <span className="material-icons text-base mr-1">person_add</span>新增/編輯評審
        </button>
      </div>

      {/* 評審列表 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 text-center py-8 text-gray-400">載入評審資料中...</div>
        ) : (
          judges.map((j) => (
            <div key={j.judge_code || j.Judge_Code} className="bg-white p-4 rounded-xl border shadow-sm space-y-2">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-lg font-black text-amber-900">評審 {j.judge_code || j.Judge_Code}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 font-mono text-gray-600">密碼: {j.login_password || j.Login_Password}</span>
              </div>
              <h3 className="font-bold text-gray-800 text-sm">{j.judge_name || j.Judge_Name}</h3>
              <p className="text-xs text-gray-500">負責類別: {j.category_short || j.Category_Short || '全部'}</p>
              <div className="pt-2 flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setForm({
                      judge_code: j.judge_code || j.Judge_Code,
                      judge_name: j.judge_name || j.Judge_Name,
                      login_password: j.login_password || j.Login_Password,
                      category_short: j.category_short || j.Category_Short
                    });
                    setModalOpen(true);
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  編輯
                </button>
                <button onClick={() => handleDelete(j.judge_code || j.Judge_Code)} className="text-xs text-red-600 hover:underline">
                  刪除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal 彈窗 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-gray-800">編輯/新增評審資料</h3>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">評審代號 (A ~ I)</label>
                <select
                  value={form.judge_code}
                  onChange={(e) => setForm({ ...form, judge_code: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-white"
                >
                  {['A','B','C','D','E','F','G','H','I'].map(c => (
                    <option key={c} value={c}>評審代號 {c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">評審真實姓名</label>
                <input
                  type="text"
                  required
                  value={form.judge_name}
                  onChange={(e) => setForm({ ...form, judge_name: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                  placeholder="例如: 王大明 老師"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">登入密碼</label>
                <input
                  type="text"
                  required
                  value={form.login_password}
                  onChange={(e) => setForm({ ...form, login_password: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                  placeholder="預設密碼"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">負責類別簡稱</label>
                <input
                  type="text"
                  value={form.category_short}
                  onChange={(e) => setForm({ ...form, category_short: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                  placeholder="例如: 宜蘭在地國小組,環境永續國小組"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border rounded-lg">取消</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-900 text-white rounded-lg font-bold">
                  {saving ? '存檔中...' : '儲存評審資料'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

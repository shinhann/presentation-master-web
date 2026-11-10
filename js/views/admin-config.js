/**
 * 簡報達人評分系統 115學年度 - 後台系統與年度設定模組 (js/views/admin-config.js)
 */

window.AdminConfigView = function() {
  const { useState, useEffect } = React;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    current_year: window.APP_CONFIG.CURRENT_YEAR,
    is_registration_open: true,
    is_judging_open: true,
    rubric_link: 'https://example.com/rubric',
    rules_link: 'https://example.com/rules',
    email_subject: '【簡報達人擂台賽】通知信',
    email_body: '親愛的參賽隊伍您好：\n恭喜完成簡報達人擂台賽提交！'
  });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    const res = await window.ApiService.getSystemConfig(window.APP_CONFIG.CURRENT_YEAR);
    if (res.status === 'success' && res.data) {
      setConfig(prev => ({
        ...prev,
        ...res.data
      }));
    }
    setLoading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    const res = await window.ApiService.saveSystemConfig({
      current_year: config.current_year,
      Competition_Year: config.current_year,
      is_registration_open: config.is_registration_open,
      is_judging_open: config.is_judging_open,
      rubric_link: config.rubric_link,
      rules_link: config.rules_link,
      Category_Group_Map: window.APP_CONFIG.CATEGORY_GROUP_MAP,
      email_subject: config.email_subject,
      email_body: config.email_body
    });

    setSaving(false);
    if (res.status === 'success') {
      setMsg('✅ 115學年度 系統與年度設定已成功更新！');
    } else {
      setMsg(`❌ 更新失敗: ${res.message}`);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-400">系統設定載入中...</div>;

  return (
    <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-gray-800">115學年度 系統與比賽參數設定</h2>
        <p className="text-xs text-gray-500">管理比賽開放狀態、外部規準、簡章網址與 Email 範本</p>
      </div>

      {msg && (
        <div className="p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-semibold">
          {msg}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 text-xs">
        <div>
          <label className="block font-bold text-gray-700 mb-1">當前競賽學年度</label>
          <input
            type="number"
            value={config.current_year}
            onChange={(e) => setConfig({ ...config, current_year: e.target.value })}
            className="w-full p-2 border rounded-lg"
          />
        </div>

        <div className="flex items-center space-x-6 py-2 border-y">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.is_registration_open}
              onChange={(e) => setConfig({ ...config, is_registration_open: e.target.checked })}
              className="w-4 h-4 accent-amber-900"
            />
            <span className="font-semibold text-gray-800">開放線上隊伍報名 / 繳件</span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.is_judging_open}
              onChange={(e) => setConfig({ ...config, is_judging_open: e.target.checked })}
              className="w-4 h-4 accent-amber-900"
            />
            <span className="font-semibold text-gray-800">開放評審線上評分</span>
          </label>
        </div>

        <div>
          <label className="block font-bold text-gray-700 mb-1">評分規準連結網址 (Rubric Link)</label>
          <input
            type="url"
            value={config.rubric_link}
            onChange={(e) => setConfig({ ...config, rubric_link: e.target.value })}
            className="w-full p-2 border rounded-lg"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="block font-bold text-gray-700 mb-1">比賽簡章網址 (Rules Link)</label>
          <input
            type="url"
            value={config.rules_link}
            onChange={(e) => setConfig({ ...config, rules_link: e.target.value })}
            className="w-full p-2 border rounded-lg"
            placeholder="https://..."
          />
        </div>

        <div className="pt-2 border-t space-y-3">
          <h3 className="font-bold text-sm text-gray-800">✉️ Email 郵件通知範本</h3>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">郵件主旨 (Subject)</label>
            <input
              type="text"
              value={config.email_subject || ''}
              onChange={(e) => setConfig({ ...config, email_subject: e.target.value })}
              className="w-full p-2 border rounded-lg"
              placeholder="【簡報達人擂台賽】通知信"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">郵件內文範本 (Body)</label>
            <textarea
              rows={4}
              value={config.email_body || ''}
              onChange={(e) => setConfig({ ...config, email_body: e.target.value })}
              className="w-full p-2 border rounded-lg font-mono text-xs"
              placeholder="支援變數標籤：{Team_Name}, {Judge_Name}"
            />
            <p className="text-[11px] text-gray-400 mt-1">支援替換標籤變數：{"{Team_Name}"} (隊伍名稱)、{"{Judge_Name}"} (評審姓名)</p>
          </div>
        </div>

        <div className="pt-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-amber-900 hover:bg-amber-950 text-white rounded-lg font-bold text-xs shadow"
          >
            {saving ? '儲存設定中...' : '儲存系統設定'}
          </button>
        </div>
      </form>
    </div>
  );
};

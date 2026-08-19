/**
 * 簡報達人評分系統 115學年度 - 登入頁面模組 (js/views/login.js)
 */

window.LoginView = function({ onLoginSuccess }) {
  const { useState, useEffect } = React;

  const [userType, setUserType] = useState('judge');
  const [formData, setFormData] = useState({ id: '', password: '' });
  const [judgeList, setJudgeList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isListLoading, setIsListLoading] = useState(false);
  const [error, setError] = useState('');

  // 載入評審下拉選單
  useEffect(() => {
    if (userType === 'judge') {
      fetchJudgeList();
    }
  }, [userType]);

  const fetchJudgeList = async () => {
    setIsListLoading(true);
    setError('');
    const res = await window.ApiService.getJudgeList();
    if (res.status === 'success' && Array.isArray(res.data)) {
      setJudgeList(res.data);
    } else {
      setError(res.message || '無法載入評審名單，請確認 API 連線。');
    }
    setIsListLoading(false);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (userType === 'judge' && !formData.id) {
      setError('請選擇評審姓名');
      return;
    }
    if (!formData.password) {
      setError('請輸入密碼');
      return;
    }

    setLoading(true);
    setError('');

    const res = await window.ApiService.login(userType, formData.id, formData.password);
    setLoading(false);

    if (res.status === 'success') {
      const userData = {
        ...res.data,
        role: userType === 'admin' ? 'admin' : 'judge'
      };
      localStorage.setItem('currentUser', JSON.stringify(userData));
      onLoginSuccess(userData);
    } else {
      setError(res.message || '登入失敗，請檢查密碼是否正確。');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-light)' }}>
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md border-t-4" style={{ borderColor: 'var(--primary)' }}>
        <div className="text-center mb-6">
          <span className="material-icons text-5xl mb-2" style={{ color: 'var(--secondary)' }}>mic</span>
          <h1 className="text-2xl font-bold text-gray-800">{window.APP_CONFIG.CURRENT_YEAR}學年度 簡報達人擂台賽</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">評審線上評分系統 (Remote Grading)</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 flex items-center">
            <span className="material-icons text-base mr-2">error_outline</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLoginSubmit} className="space-y-5">
          {/* 身分選擇 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">登入身分</label>
            <div className="relative">
              <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-lg">badge</span>
              <select
                value={userType}
                onChange={(e) => {
                  setUserType(e.target.value);
                  setFormData({ id: '', password: '' });
                  setError('');
                }}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-800 bg-white"
              >
                <option value="judge">評審委員 (Judge)</option>
                <option value="admin">系統管理員 (Admin)</option>
              </select>
            </div>
          </div>

          {/* 評審姓名下拉 */}
          {userType === 'judge' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                評審姓名
                {isListLoading && <span className="text-xs text-amber-800 ml-2">(讀取中...)</span>}
              </label>
              <div className="relative">
                <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-lg">person</span>
                <select
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-800 bg-white"
                  disabled={isListLoading}
                >
                  <option value="">{isListLoading ? "載入名單中..." : "-- 請選擇您的姓名 --"}</option>
                  {judgeList.map((j) => (
                    <option key={j.id || j.judge_code} value={j.id || j.judge_code}>
                      {j.name || j.judge_name} (評審 {j.judge_code || j.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 密碼輸入 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              {userType === 'admin' ? '管理員密碼' : '登入密碼'}
            </label>
            <div className="relative">
              <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-lg">lock</span>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="請輸入密碼"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-800"
              />
            </div>
          </div>

          {/* 登入按鈕 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg font-semibold text-white transition shadow-md flex justify-center items-center"
            style={{ backgroundColor: loading ? '#A1887F' : 'var(--secondary)' }}
          >
            {loading ? (
              <>
                <span className="material-icons animate-spin text-base mr-2">sync</span>
                驗證身分中...
              </>
            ) : (
              '登入系統'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

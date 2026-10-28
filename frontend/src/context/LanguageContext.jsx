import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const LanguageContext = createContext(null);

const translations = {
  zh: {
    home: '首页', dashboard: '控制台', synthesis: '语音合成', history: '生成记录', sample: '示例', about: '关于我们', login: '登录', register: '注册', logout: '退出登录', admin: '管理后台', start: '立即开始', viewAbout: '了解平台',
    heroTitle: '大汐数字人与声音创作平台', heroTagline: '声音克隆、文本转语音与数字人视频统一入口',
    heroPhrases: ['上传一段声音，生成专属数字音色。', '输入文字，快速生成自然流畅的语音。', '上传训练视频，创建专属数字人模型并生成视频。'],
    aboutTitle: '为什么选择大汐？', aboutCopy: '大汐提供简单、稳定、可扩展的 AI 内容工作台。上传声音样本、输入文案或训练视频，即可管理音色、生成音频和数字人视频。',
    signIn: '登录', username: '用户名', password: '密码', forgotPassword: '忘记密码？', noAccount: '还没有账号？', createAccount: '创建账号', createNewAccount: '创建新账号', alreadyAccount: '已有账号？', email: '邮箱', confirmPassword: '确认密码', reenterPassword: '再次输入密码', language: '语言',
  },
  en: {
    home: 'Home', dashboard: 'Dashboard', synthesis: 'Voice Studio', history: 'History', sample: 'Sample', about: 'About', login: 'Log in', register: 'Sign up', logout: 'Log out', admin: 'Admin', start: 'Get started', viewAbout: 'Explore platform',
    heroTitle: 'DAXI AI Avatar & Voice Studio', heroTagline: 'One workspace for voice cloning, text-to-speech, and digital-human video',
    heroPhrases: ['Upload a sample and create a dedicated voice.', 'Turn text into natural speech in seconds.', 'Train a digital-human model and generate videos from your voice.'],
    aboutTitle: 'Why Choose DAXI?', aboutCopy: 'DAXI provides a simple, stable, and extensible AI content workspace. Upload a sample, enter a script, or train a model to manage voices, audio, and digital-human videos in one place.',
    signIn: 'Sign in', username: 'Username', password: 'Password', forgotPassword: 'Forgot password?', noAccount: "Don't have an account?", createAccount: 'Create account', createNewAccount: 'Create new account', alreadyAccount: 'Already have an account?', email: 'Email', confirmPassword: 'Confirm password', reenterPassword: 'Re-enter password', language: 'Language',
  },
};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('daxi-language') || 'zh');

  useEffect(() => {
    localStorage.setItem('daxi-language', language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage(current => current === 'zh' ? 'en' : 'zh'),
    t: (key) => translations[language][key] ?? translations.en[key] ?? key,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

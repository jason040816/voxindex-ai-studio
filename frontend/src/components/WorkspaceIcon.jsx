const paths = {
  dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  mic: <><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11.5v1a6.5 6.5 0 0 0 13 0v-1M12 19v3M8.5 22h7" /></>,
  human: <><circle cx="12" cy="7" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0M18 4l2 2-2 2" /></>,
  audio: <><path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 9v6M23 11v2" /></>,
  history: <><path d="M3.5 11a8.5 8.5 0 1 1 .7 4.3M3.5 5.5v5.7h5.7M12 7v5l3.5 2" /></>,
  credits: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
};

export default function WorkspaceIcon({ name, size = 20, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.dashboard}
    </svg>
  );
}

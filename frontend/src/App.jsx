import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Homepage from './pages/Homepage';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Synthesis from './pages/Synthesis';
import History from './pages/History';
import Sample from './pages/Sample';
import AdminDashboard from './pages/AdminDashboard';
import Profile from './pages/Profile';
import VoiceClone from './pages/VoiceClone';
import DigitalHuman from './pages/DigitalHuman';
import Credits from './pages/Credits';
import WorkspaceLayout from './components/WorkspaceLayout';
import { LanguageProvider } from './context/LanguageContext';
import './theme.css';
import './responsive.css';

function WorkspaceRoute({ children, adminOnly = false }) {
  return (
    <ProtectedRoute adminOnly={adminOnly}>
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Navbar />
          <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Homepage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<WorkspaceRoute><Dashboard /></WorkspaceRoute>} />
          <Route path="/synthesis" element={<WorkspaceRoute><Synthesis /></WorkspaceRoute>} />
          <Route path="/voice-clone" element={<WorkspaceRoute><VoiceClone /></WorkspaceRoute>} />
          <Route path="/digital-human" element={<WorkspaceRoute><DigitalHuman /></WorkspaceRoute>} />
          <Route path="/history" element={<WorkspaceRoute><History /></WorkspaceRoute>} />
          <Route path="/sample" element={<Sample />} />
          <Route path="/admin" element={<WorkspaceRoute adminOnly><AdminDashboard /></WorkspaceRoute>} />
          <Route path="/profile" element={<WorkspaceRoute><Profile /></WorkspaceRoute>} />
          <Route path="/credits" element={<WorkspaceRoute><Credits /></WorkspaceRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;

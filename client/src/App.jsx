import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import FreelancerDashboard from './pages/FreelancerDashboard';
import ClientDashboard from './pages/ClientDashboard';
import BookingPage from './pages/BookingPage';
import Auth from './pages/Auth';
import ProfileSettings from './pages/ProfileSettings';
import LandingPage from './pages/LandingPage';
import PrivacyPolicy from './pages/PrivacyPolicy';
import { applyTheme, getSavedTheme } from './utils/theme';

const NotFound = () => (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center gap-4 text-white font-syne">
      <div className="text-8xl font-bold text-dark-600 font-mono">404</div>
      <div className="text-slate-400">Page not found</div>
      <a href="/" className="mt-4 px-6 py-2 bg-accent-500 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-standard">
        Go home
      </a>
    </div>
);

function App() {
  useEffect(() => {
    applyTheme(getSavedTheme());
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/freelancer" element={<FreelancerDashboard />} />
        <Route path="/client" element={<ClientDashboard />} />
        <Route path="/book/:freelancerId" element={<BookingPage />} />
        <Route path="/settings" element={<ProfileSettings />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth, RequireAdmin } from './auth/guards';
import SignIn from './auth/SignIn';
import SignUp from './auth/SignUp';
import Layout from './components/Layout';
import Placeholder from './components/Placeholder';
import PlotsPage from './features/plots/PlotsPage';
import PlotDetail from './features/plots/PlotDetail';
import MembersPage from './features/members/MembersPage';
import WaitlistPage from './features/members/WaitlistPage';
import MemberDetail from './features/members/MemberDetail';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Placeholder title="Dashboard" />} />
              <Route path="/plots" element={<PlotsPage />} />
              <Route path="/plots/:id" element={<PlotDetail />} />
              <Route path="/calendar" element={<Placeholder title="Calendar" />} />
              <Route path="/my-hours" element={<Placeholder title="My Hours" />} />
              <Route element={<RequireAdmin />}>
                <Route path="/members" element={<MembersPage />} />
                <Route path="/members/:id" element={<MemberDetail />} />
                <Route path="/waitlist" element={<WaitlistPage />} />
                <Route path="/dues" element={<Placeholder title="Dues" />} />
                <Route path="/settings" element={<Placeholder title="Settings" />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

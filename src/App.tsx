import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth, RequireAdmin } from './auth/guards';
import SignIn from './auth/SignIn';
import SignUp from './auth/SignUp';
import Layout from './components/Layout';
import Placeholder from './components/Placeholder';

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
              <Route path="/plots" element={<Placeholder title="Plots" />} />
              <Route path="/plots/:id" element={<Placeholder title="Plot detail" />} />
              <Route path="/calendar" element={<Placeholder title="Calendar" />} />
              <Route path="/my-hours" element={<Placeholder title="My Hours" />} />
              <Route element={<RequireAdmin />}>
                <Route path="/members" element={<Placeholder title="Members" />} />
                <Route path="/waitlist" element={<Placeholder title="Waitlist" />} />
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

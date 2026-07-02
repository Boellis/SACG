import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth, RequireAdmin } from './auth/guards';
import SignIn from './auth/SignIn';
import SignUp from './auth/SignUp';
import Layout from './components/Layout';
import MyHoursPage from './features/hours/MyHoursPage';
import PlotsPage from './features/plots/PlotsPage';
import PlotDetail from './features/plots/PlotDetail';
import MembersPage from './features/members/MembersPage';
import WaitlistPage from './features/members/WaitlistPage';
import MemberDetail from './features/members/MemberDetail';
import DuesPage from './features/dues/DuesPage';
import Dashboard from './features/dashboard/Dashboard';
import CalendarPage from './features/calendar/CalendarPage';
import SettingsPage from './features/settings/SettingsPage';
import EmailPage from './features/email/EmailPage';
import ForumPage from './features/forum/ForumPage';
import ThreadPage from './features/forum/ThreadPage';
import MembersLoungePage from './features/lounge/MembersLoungePage';
import MemberProfilePage from './features/lounge/MemberProfilePage';
import MessagesPage from './features/lounge/MessagesPage';
import ChatPage from './features/lounge/ChatPage';
import DocumentsPage from './features/documents/DocumentsPage';
import PollsPage from './features/polls/PollsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/plots" element={<PlotsPage />} />
              <Route path="/plots/:id" element={<PlotDetail />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/my-hours" element={<MyHoursPage />} />
              <Route path="/forum" element={<ForumPage />} />
              <Route path="/forum/:threadId" element={<ThreadPage />} />
              <Route path="/lounge" element={<MembersLoungePage />} />
              <Route path="/lounge/:memberId" element={<MemberProfilePage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/messages/:convId" element={<ChatPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/polls" element={<PollsPage />} />
              <Route element={<RequireAdmin />}>
                <Route path="/members" element={<MembersPage />} />
                <Route path="/members/:id" element={<MemberDetail />} />
                <Route path="/waitlist" element={<WaitlistPage />} />
                <Route path="/dues" element={<DuesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/email" element={<EmailPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
